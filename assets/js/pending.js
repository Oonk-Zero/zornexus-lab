/**
 * ZORNOX Web Ops Console — Pending Review Page Logic
 *
 * Handles:
 *   - Loading and rendering the pending decision queue
 *   - Item selection and preview
 *   - Approve / Reject single item
 *   - Batch approve / reject selected items
 *   - Search / filter by title, ID, or preview text
 *   - Checkbox selection state management
 *   - Batch action slide-up bar
 *
 * Requires: config/app-config.js, assets/js/api.js, assets/js/app.js
 */

/* global window, document, API */

(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /*  State                                                               */
  /* ------------------------------------------------------------------ */

  var allItems    = [];
  var selectedItem = null;
  var selectedIds  = {};   // id -> true

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
  /*  Load Queue                                                          */
  /* ------------------------------------------------------------------ */

  function loadPendingList() {
    setListState("loading");

    /* NOTE: Swap for live call when backend is available:
    API.getPendingList()
      .then(function (data) {
        allItems = (data && data.items) ? data.items : [];
        updateCounts(allItems.length);
        renderList(allItems);
        setListState("idle");
      })
      .catch(function (err) {
        console.error("[pending] load error:", err);
        setListState("error");
      });
    */

    // PLACEHOLDER — static seed data matching the API response shape
    // Shape: { items: [{ id, title, created_at, preview }] }
    setTimeout(function () {
      var data = {
        items: [
          {
            id:         "PENDING_DECISION_001",
            title:      "Memory fragment: ZORNOX automation pipeline notes",
            created_at: "2026-03-09",
            preview:    "Planning session notes covering the ZORNOX intake workflow, claw_drop directory structure, and the pending decision queue design..."
          },
          {
            id:         "PENDING_DECISION_002",
            title:      "Research extract: Cloudflare Pages static deployment",
            created_at: "2026-03-09",
            preview:    "Static site deployment considerations for Cloudflare Pages, including build output directory, wrangler.toml options, and custom headers..."
          },
          {
            id:         "PENDING_DECISION_003",
            title:      "Inbox item: Backend API schema draft v0.1",
            created_at: "2026-03-09",
            preview:    "Draft API contract for the pending review endpoints. Covers approve, reject, and batch operations with expected request/response shapes..."
          },
          {
            id:         "PENDING_DECISION_004",
            title:      "Document scan: Weekly review capture — W10 2026",
            created_at: "2026-03-08",
            preview:    "Weekly review items from Obsidian vault: task completions, backlog updates, and integration milestones for the current sprint cycle..."
          },
          {
            id:         "PENDING_DECISION_005",
            title:      "Extract: LLM prompt engineering — memory retrieval patterns",
            created_at: "2026-03-07",
            preview:    "Structured notes on prompt chaining strategies for memory retrieval, context injection techniques, and Graphiti integration notes..."
          }
        ]
      };

      allItems = data.items;
      updateCounts(allItems.length);
      renderList(allItems);
      setListState("idle");
    }, 350);
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
      var isSelected = selectedItem && selectedItem.id === item.id;
      var isChecked  = !!selectedIds[item.id];

      return (
        '<div class="pending-item' + (isSelected ? " pending-item--selected" : "") + '" ' +
             'data-id="' + window.escHtml(item.id) + '" ' +
             'role="button" tabindex="0" ' +
             'aria-label="' + window.escHtml(item.title) + '">' +
          '<label class="pending-item-check" title="Select">' +
            '<input type="checkbox" class="item-checkbox" ' +
                   'value="' + window.escHtml(item.id) + '"' +
                   (isChecked ? " checked" : "") + '>' +
          '</label>' +
          '<div class="pending-item-body">' +
            '<span class="pending-item-title">' + window.escHtml(item.title) + '</span>' +
            '<span class="pending-item-meta">' + window.escHtml(item.id) + ' &middot; ' + window.escHtml(item.created_at) + '</span>' +
          '</div>' +
        '</div>'
      );
    }).join("");

    container.innerHTML = html;
    attachListEvents(container, items);
  }

  function attachListEvents(container, items) {
    // Item row click — open preview
    container.querySelectorAll(".pending-item").forEach(function (el) {
      el.addEventListener("click", function (e) {
        // Don't trigger row click when interacting with checkbox label
        if (e.target.tagName === "INPUT" || e.target.tagName === "LABEL") return;
        var id   = el.dataset.id;
        var item = findItem(items, id);
        if (item) selectItem(item);
      });

      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          var id   = el.dataset.id;
          var item = findItem(items, id);
          if (item) selectItem(item);
        }
      });
    });

    // Checkbox change — update selectedIds and batch bar
    container.querySelectorAll(".item-checkbox").forEach(function (cb) {
      cb.addEventListener("change", function () {
        if (cb.checked) {
          selectedIds[cb.value] = true;
        } else {
          delete selectedIds[cb.value];
        }
        updateBatchBar();
      });
      // Prevent row click when clicking checkbox
      cb.addEventListener("click", function (e) { e.stopPropagation(); });
    });
  }

  function findItem(items, id) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) return items[i];
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /*  Item Preview                                                        */
  /* ------------------------------------------------------------------ */

  function selectItem(item) {
    selectedItem = item;

    // Update row highlight
    document.querySelectorAll(".pending-item").forEach(function (el) {
      el.classList.toggle("pending-item--selected", el.dataset.id === item.id);
    });

    renderPreview(item);
  }

  function renderPreview(item) {
    var panel = document.getElementById("item-preview");
    if (!panel) return;

    var endpoint = (window.ZORNOX_CONFIG && window.ZORNOX_CONFIG.endpoints && window.ZORNOX_CONFIG.endpoints.pendingItem)
      || "/api/pending/item";

    panel.innerHTML =
      '<div class="preview-header">' +
        '<div class="preview-meta">' +
          '<span class="preview-id">' + window.escHtml(item.id) + '</span>' +
          '<span class="preview-date">' + window.escHtml(item.created_at) + '</span>' +
        '</div>' +
        '<h2 class="preview-title">' + window.escHtml(item.title) + '</h2>' +
      '</div>' +
      '<div class="preview-body">' +
        '<p class="preview-text">' + window.escHtml(item.preview) + '</p>' +
        '<div class="preview-api-note">' +
          'Full content via: GET ' + window.escHtml(endpoint) +
          '?id=' + encodeURIComponent(item.id) +
        '</div>' +
      '</div>' +
      '<div class="preview-actions">' +
        '<button class="btn btn--approve" id="preview-approve-btn">&#10003; Approve</button>' +
        '<button class="btn btn--reject"  id="preview-reject-btn">&#10005; Reject</button>' +
      '</div>';

    document.getElementById("preview-approve-btn").addEventListener("click", function () {
      runSingleAction("approve", item.id);
    });
    document.getElementById("preview-reject-btn").addEventListener("click", function () {
      runSingleAction("reject", item.id);
    });
  }

  function clearPreview() {
    var panel = document.getElementById("item-preview");
    if (!panel) return;
    panel.innerHTML =
      '<div class="preview-empty">' +
        '<span class="preview-empty-icon">&#9744;</span>' +
        'Select an item to preview' +
      '</div>';
  }

  /* ------------------------------------------------------------------ */
  /*  Single Item Actions                                                 */
  /* ------------------------------------------------------------------ */

  function runSingleAction(action, id) {
    disablePreviewButtons(true);

    /* NOTE: Swap for live call when backend is available:
    var apiFn = action === "approve" ? API.approvePending : API.rejectPending;
    apiFn(id)
      .then(function () { removeItems([id]); window.showToast("Item " + action + "d", "success"); })
      .catch(function (err) {
        console.error("[pending] action error:", err);
        disablePreviewButtons(false);
        window.showToast(action + " failed", "error");
      });
    */

    // PLACEHOLDER — simulates API delay
    setTimeout(function () {
      removeItems([id]);
      window.showToast("Item " + action + "d", "success");
    }, 380);
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

    if (approveBtn) {
      approveBtn.addEventListener("click", function () { runBatchAction("approve"); });
    }
    if (rejectBtn) {
      rejectBtn.addEventListener("click", function () { runBatchAction("reject"); });
    }
  }

  function runBatchAction(action) {
    var ids = Object.keys(selectedIds);
    if (!ids.length) {
      window.showToast("No items selected", "warning");
      return;
    }

    var label = action === "approve" ? "Approve" : "Reject";
    if (!window.confirm(label + " " + ids.length + " item(s)?")) return;

    /* NOTE: Swap for live call when backend is available:
    var apiFn = action === "approve" ? API.batchApprove : API.batchReject;
    apiFn(ids)
      .then(function (result) {
        removeItems(ids);
        window.showToast(ids.length + " item(s) " + action + "d", "success");
      })
      .catch(function (err) {
        console.error("[pending] batch error:", err);
        window.showToast("Batch " + action + " failed", "error");
      });
    */

    // PLACEHOLDER — simulates API delay
    setTimeout(function () {
      removeItems(ids);
      window.showToast(ids.length + " item(s) " + action + "d", "success");
    }, 450);
  }

  /* ------------------------------------------------------------------ */
  /*  Select All                                                          */
  /* ------------------------------------------------------------------ */

  function setupSelectAll() {
    var btn = document.getElementById("select-all-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var checkboxes   = document.querySelectorAll(".item-checkbox");
      var allChecked   = checkboxes.length > 0 &&
        Array.prototype.every.call(checkboxes, function (cb) { return cb.checked; });

      checkboxes.forEach(function (cb) {
        cb.checked = !allChecked;
        if (!allChecked) {
          selectedIds[cb.value] = true;
        } else {
          delete selectedIds[cb.value];
        }
      });

      btn.textContent = allChecked ? "Select All" : "Deselect All";
      updateBatchBar();
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Search / Filter                                                     */
  /* ------------------------------------------------------------------ */

  function setupSearch() {
    var input = document.getElementById("search-input");
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
            item.title.toLowerCase().indexOf(q)   !== -1 ||
            item.id.toLowerCase().indexOf(q)       !== -1 ||
            item.preview.toLowerCase().indexOf(q)  !== -1
          );
        });
        renderList(filtered);
      }, 150);
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                             */
  /* ------------------------------------------------------------------ */

  function removeItems(ids) {
    var idSet = {};
    ids.forEach(function (id) { idSet[id] = true; });

    allItems = allItems.filter(function (item) { return !idSet[item.id]; });
    ids.forEach(function (id) { delete selectedIds[id]; });

    if (selectedItem && idSet[selectedItem.id]) {
      selectedItem = null;
      clearPreview();
    }

    updateCounts(allItems.length);
    renderList(allItems);
    updateBatchBar();
  }

  function updateCounts(count) {
    ["nav-pending-count", "pending-page-count"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = count;
    });
  }

  function updateBatchBar() {
    var count    = Object.keys(selectedIds).length;
    var bar      = document.getElementById("batch-bar");
    var countEl  = document.getElementById("selected-count");
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
        '<div class="state-error">Failed to load queue.' +
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
