/**
 * ZORNOX Web Ops Console — Pending Review Page Logic
 *
 * Data source: GET /api/pending/list
 * Item identity: item.filename (real filename from the pending queue folder)
 *
 * Handles:
 *   - Loading real file-backed records from the backend
 *   - Item selection and preview with real fields (filename, type, modified_at, summary)
 *   - Approve / Reject single item → POST /api/pending/approve|reject { filename }
 *   - Batch approve / reject → POST /api/pending/batch { action, filenames[] }
 *   - Refresh from backend after every action
 *   - Search / filter across filename, title, summary, content_preview
 *   - Checkbox selection state and batch action bar
 *
 * Requires: config/app-config.js, assets/js/api.js, assets/js/app.js
 */

/* global window, document, API */

(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /*  State                                                               */
  /* ------------------------------------------------------------------ */

  /** Full list as returned by the last successful API call. */
  var allItems = [];

  /** Currently selected item object (or null). */
  var selectedItem = null;

  /** Set of checked filenames: { "filename.md": true } */
  var selectedFilenames = {};

  /** In-memory cache of full content keyed by filename (session-only). */
  var fullContentCache = {};

  /** Per-filename full-content UI state. */
  var fullContentStateByFilename = {};

  /** Tracks latest in-flight full-content request id per filename. */
  var openFullRequestIdByFilename = {};

  /** Monotonic request id sequence for full-content fetches. */
  var openFullRequestSeq = 0;

  /* ------------------------------------------------------------------ */
  /*  Init                                                                */
  /* ------------------------------------------------------------------ */

  function init() {
    loadPendingList();
    setupSearch();
    setupBatchBar();
    setupSelectAll();
  }

  /* ------------------------------------------------------------------ */
  /*  Load Queue — live backend call                                      */
  /* ------------------------------------------------------------------ */

  function loadPendingList() {
    setListState("loading");

    // Clear stale selection state on every reload
    selectedFilenames = {};
    selectedItem      = null;
    updateBatchBar();

    API.getPendingList()
      .then(function (data) {
        allItems = (data && Array.isArray(data.items)) ? data.items : [];
        // Use data.total (real queue size) — not allItems.length which is capped by the limit param
        var total = (data && data.total != null) ? data.total : allItems.length;
        updateCounts(total);
        renderList(allItems);
        setListState("idle");
      })
      .catch(function (err) {
        console.error("[pending] load error:", err);
        setListState("error");
      });
  }

  /* ------------------------------------------------------------------ */
  /*  Render List                                                         */
  /* ------------------------------------------------------------------ */

  function renderList(items) {
    var container = document.getElementById("pending-list");
    if (!container) return;

    if (!items || !items.length) {
      container.innerHTML = '<div class="state-empty">No pending items match your search.</div>';
      return;
    }

    var html = items.map(function (item) {
      var filename   = item.filename || "";
      var label      = item.title    || filename;
      var typeBadge  = item.type     ? itemTypeBadge(item.type) : "";
      var timeLabel  = item.modified_at ? window.formatDateTime(item.modified_at) : "";
      var isSelected = selectedItem && selectedItem.filename === filename;
      var isChecked  = !!selectedFilenames[filename];

      return (
        '<div class="pending-item' + (isSelected ? " pending-item--selected" : "") + '" ' +
             'data-filename="' + window.escHtml(filename) + '" ' +
             'role="button" tabindex="0" ' +
             'aria-label="' + window.escHtml(label) + '">' +
          '<label class="pending-item-check" title="Select" onclick="event.stopPropagation()">' +
            '<input type="checkbox" class="item-checkbox" ' +
                   'value="' + window.escHtml(filename) + '"' +
                   (isChecked ? " checked" : "") + '>' +
          '</label>' +
          '<div class="pending-item-body">' +
            '<span class="pending-item-title">' + window.escHtml(label) + '</span>' +
            '<span class="pending-item-meta">' +
              typeBadge +
              (typeBadge && timeLabel ? ' &middot; ' : '') +
              window.escHtml(timeLabel) +
            '</span>' +
          '</div>' +
        '</div>'
      );
    }).join("");

    container.innerHTML = html;
    attachListEvents(container, items);
  }

  /** Returns a small inline type label (no extra DOM nodes needed). */
  function itemTypeBadge(type) {
    var labels = {
      decision: "Decision",
      extract:  "Extract",
      scan:     "Scan",
      note:     "Note",
      capture:  "Capture",
      review:   "Review"
    };
    return labels[type] || type;
  }

  function attachListEvents(container, items) {
    container.querySelectorAll(".pending-item").forEach(function (el) {
      el.addEventListener("click", function (e) {
        if (e.target.tagName === "INPUT" || e.target.tagName === "LABEL") return;
        var filename = el.dataset.filename;
        var item     = findItemByFilename(items, filename);
        if (item) selectItem(item);
      });

      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          var filename = el.dataset.filename;
          var item     = findItemByFilename(items, filename);
          if (item) selectItem(item);
        }
      });
    });

    container.querySelectorAll(".item-checkbox").forEach(function (cb) {
      cb.addEventListener("change", function () {
        if (cb.checked) {
          selectedFilenames[cb.value] = true;
        } else {
          delete selectedFilenames[cb.value];
        }
        updateBatchBar();
      });
      cb.addEventListener("click", function (e) { e.stopPropagation(); });
    });
  }

  function findItemByFilename(items, filename) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].filename === filename) return items[i];
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /*  Item Preview                                                        */
  /* ------------------------------------------------------------------ */

  function selectItem(item) {
    selectedItem = item;

    document.querySelectorAll(".pending-item").forEach(function (el) {
      el.classList.toggle("pending-item--selected", el.dataset.filename === item.filename);
    });

    renderPreview(item);
  }

  function renderPreview(item) {
    var panel = document.getElementById("item-preview");
    if (!panel) return;

    var filename = item.filename || "";
    var label    = item.title    || filename;
    var typeTxt  = item.type     ? item.type : "unknown";
    var timeTxt  = item.modified_at ? window.formatDateTime(item.modified_at) : "—";
    var pathTxt  = item.path     || "";
    var fullState = getFullContentState(filename);

    // Summary: prefer summary, fall back to content_preview, then graceful note
    var bodyText = item.summary || item.content_preview || null;

    panel.innerHTML =
      '<div class="preview-header">' +
        '<div class="preview-meta">' +
          '<span class="preview-id">' + window.escHtml(typeTxt.toUpperCase()) + '</span>' +
          '<span class="preview-date">' + window.escHtml(timeTxt) + '</span>' +
        '</div>' +
        '<h2 class="preview-title">' + window.escHtml(label) + '</h2>' +
        (filename !== label
          ? '<div style="margin-top:6px;font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">' +
              window.escHtml(filename) +
            '</div>'
          : '') +
      '</div>' +

      '<div class="preview-body">' +
        (bodyText
          ? '<p class="preview-text">' + window.escHtml(bodyText) + '</p>'
          : '<p class="preview-text" style="color:var(--text-muted);font-style:italic;">' +
              'No summary available. Full content will be loaded from the backend.' +
            '</p>') +
        (pathTxt
          ? '<div class="preview-api-note">' + window.escHtml(pathTxt) + '</div>'
          : '') +
        '<div class="preview-assist">' +
          '<div class="preview-assist-head">' +
            '<span class="preview-assist-label">Full content</span>' +
            '<button class="btn btn--default btn--sm" id="preview-open-full-btn"' +
                    (fullState.status === "loading" ? " disabled" : "") + '>' +
              'Open full' +
            '</button>' +
          '</div>' +
          '<div class="preview-full-region" id="preview-full-content-region">' +
            renderFullContentMarkup(fullState) +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="preview-actions">' +
        '<button class="btn btn--approve" id="preview-approve-btn">&#10003; Approve</button>' +
        '<button class="btn btn--reject"  id="preview-reject-btn">&#10005; Reject</button>' +
      '</div>';

    document.getElementById("preview-approve-btn").addEventListener("click", function () {
      runSingleAction("approve", filename);
    });
    document.getElementById("preview-reject-btn").addEventListener("click", function () {
      runSingleAction("reject", filename);
    });

    var openFullBtn = document.getElementById("preview-open-full-btn");
    if (openFullBtn) {
      openFullBtn.addEventListener("click", function () {
        openFullContent(filename);
      });
    }
  }

  function getFullContentState(filename) {
    if (Object.prototype.hasOwnProperty.call(fullContentCache, filename)) {
      return { status: "loaded", content: fullContentCache[filename] };
    }
    return fullContentStateByFilename[filename] || { status: "idle" };
  }

  function renderFullContentMarkup(state) {
    if (!state || state.status === "idle") {
      return '<div class="preview-inline-note">Full content is not loaded yet.</div>';
    }
    if (state.status === "loading") {
      return '<div class="preview-inline-status">Loading full content&hellip;</div>';
    }
    if (state.status === "error") {
      return '<div class="preview-inline-error">' +
               window.escHtml(state.message || "Failed to load full content.") +
             '</div>';
    }

    var content = state.content || "";
    if (!content.trim()) {
      return '<div class="preview-inline-note">This item has no full content.</div>';
    }
    return '<pre class="preview-full-content">' + window.escHtml(content) + '</pre>';
  }

  function openFullContent(filename) {
    if (!filename) return;

    var existingState = getFullContentState(filename);
    if (existingState.status === "loaded") {
      renderFullContentForCurrentSelection(filename);
      return;
    }

    var requestId = ++openFullRequestSeq;
    openFullRequestIdByFilename[filename] = requestId;
    fullContentStateByFilename[filename] = { status: "loading" };
    renderFullContentForCurrentSelection(filename);

    API.getPendingItem(filename)
      .then(function (item) {
        if (openFullRequestIdByFilename[filename] !== requestId) return;

        var content = (item && typeof item.content === "string") ? item.content : "";
        fullContentCache[filename] = content;
        fullContentStateByFilename[filename] = { status: "loaded", content: content };
        renderFullContentForCurrentSelection(filename);
      })
      .catch(function (err) {
        if (openFullRequestIdByFilename[filename] !== requestId) return;

        fullContentStateByFilename[filename] = {
          status: "error",
          message: buildOpenFullErrorMessage(err)
        };
        renderFullContentForCurrentSelection(filename);
      });
  }

  function renderFullContentForCurrentSelection(filename) {
    if (!selectedItem || selectedItem.filename !== filename) return;

    var state = getFullContentState(filename);
    var region = document.getElementById("preview-full-content-region");
    if (region) {
      region.innerHTML = renderFullContentMarkup(state);
    }

    var openFullBtn = document.getElementById("preview-open-full-btn");
    if (openFullBtn) {
      openFullBtn.disabled = state.status === "loading";
    }
  }

  function buildOpenFullErrorMessage(err) {
    var msg = "Failed to load full content";
    if (err && err.status) msg += " (" + err.status + ")";
    return msg + ".";
  }

  function clearPreview() {
    var panel = document.getElementById("item-preview");
    if (!panel) return;
    selectedItem = null;
    panel.innerHTML =
      '<div class="preview-empty">' +
        '<span class="preview-empty-icon" aria-hidden="true">&#9744;</span>' +
        'Select an item to preview' +
      '</div>';
  }

  /* ------------------------------------------------------------------ */
  /*  Single Item Actions                                                 */
  /* ------------------------------------------------------------------ */

  function runSingleAction(action, filename) {
    disablePreviewButtons(true);

    var apiFn = action === "approve" ? API.approvePending : API.rejectPending;

    apiFn(filename)
      .then(function () {
        window.showToast("Item " + action + "d", "success");
        clearPreview();
        loadPendingList();
      })
      .catch(function (err) {
        console.error("[pending] action error (" + action + "):", err);
        disablePreviewButtons(false);
        window.showToast(
          action + " failed" + (err.status ? " (" + err.status + ")" : ""),
          "error"
        );
      });
  }

  function disablePreviewButtons(disabled) {
    ["preview-approve-btn", "preview-reject-btn"].forEach(function (btnId) {
      var btn = document.getElementById(btnId);
      if (btn) btn.disabled = disabled;
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Batch Actions                                                       */
  /* ------------------------------------------------------------------ */

  function setupBatchBar() {
    var approveBtn = document.getElementById("batch-approve-btn");
    var rejectBtn  = document.getElementById("batch-reject-btn");
    if (approveBtn) approveBtn.addEventListener("click", function () { runBatchAction("approve"); });
    if (rejectBtn)  rejectBtn.addEventListener("click",  function () { runBatchAction("reject");  });
  }

  function runBatchAction(action) {
    var filenames = Object.keys(selectedFilenames);
    if (!filenames.length) {
      window.showToast("No items selected", "warning");
      return;
    }

    var label = action === "approve" ? "Approve" : "Reject";
    if (!window.confirm(label + " " + filenames.length + " item(s)?")) return;

    var apiFn = action === "approve" ? API.batchApprove : API.batchReject;

    apiFn(filenames)
      .then(function (result) {
        var processed = (result && result.processed != null) ? result.processed : filenames.length;
        window.showToast(processed + " item(s) " + action + "d", "success");
        clearPreview();
        loadPendingList();
      })
      .catch(function (err) {
        console.error("[pending] batch error:", err);
        window.showToast(
          "Batch " + action + " failed" + (err.status ? " (" + err.status + ")" : ""),
          "error"
        );
      });
  }

  /* ------------------------------------------------------------------ */
  /*  Select All                                                          */
  /* ------------------------------------------------------------------ */

  function setupSelectAll() {
    var btn = document.getElementById("select-all-btn");
    if (!btn) return;

    btn.addEventListener("click", function () {
      var checkboxes = document.querySelectorAll(".item-checkbox");
      var allChecked = checkboxes.length > 0 &&
        Array.prototype.every.call(checkboxes, function (cb) { return cb.checked; });

      checkboxes.forEach(function (cb) {
        cb.checked = !allChecked;
        if (!allChecked) {
          selectedFilenames[cb.value] = true;
        } else {
          delete selectedFilenames[cb.value];
        }
      });

      btn.textContent = allChecked ? "Select All" : "Deselect All";
      updateBatchBar();
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Search / Filter (client-side, against loaded items)                */
  /* ------------------------------------------------------------------ */

  function setupSearch() {
    var input   = document.getElementById("search-input");
    if (!input) return;
    var timeout = null;

    input.addEventListener("input", function () {
      clearTimeout(timeout);
      timeout = setTimeout(function () {
        var q = input.value.toLowerCase().trim();
        if (!q) {
          renderList(allItems);
          return;
        }
        var filtered = allItems.filter(function (item) {
          return (
            (item.filename        || "").toLowerCase().indexOf(q) !== -1 ||
            (item.title           || "").toLowerCase().indexOf(q) !== -1 ||
            (item.summary         || "").toLowerCase().indexOf(q) !== -1 ||
            (item.content_preview || "").toLowerCase().indexOf(q) !== -1 ||
            (item.type            || "").toLowerCase().indexOf(q) !== -1
          );
        });
        renderList(filtered);
      }, 150);
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                             */
  /* ------------------------------------------------------------------ */

  function updateCounts(count) {
    ["nav-pending-count", "pending-page-count"].forEach(function (elId) {
      var el = document.getElementById(elId);
      if (el) el.textContent = count;
    });
  }

  function updateBatchBar() {
    var count   = Object.keys(selectedFilenames).length;
    var bar     = document.getElementById("batch-bar");
    var countEl = document.getElementById("selected-count");
    if (bar)     bar.classList.toggle("batch-bar--visible", count > 0);
    if (countEl) countEl.textContent = count;
  }

  function setListState(state) {
    var container = document.getElementById("pending-list");
    if (!container || state === "idle") return;

    if (state === "loading") {
      container.innerHTML = '<div class="state-loading">Loading queue\u2026</div>';
    } else if (state === "error") {
      container.innerHTML =
        '<div class="state-error">Failed to load queue. ' +
        '<button class="retry-btn">Retry</button></div>';
      var retry = container.querySelector(".retry-btn");
      if (retry) retry.addEventListener("click", loadPendingList);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Bootstrap                                                           */
  /* ------------------------------------------------------------------ */

  document.addEventListener("DOMContentLoaded", init);

})();
