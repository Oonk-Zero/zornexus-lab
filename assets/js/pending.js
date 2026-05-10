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

  /** In-memory cache of related items keyed by filename (session-only). */
  var relatedCache = {};

  /** Per-filename related-items UI state. */
  var relatedStateByFilename = {};

  /** Tracks latest in-flight related request id per filename. */
  var relatedRequestIdByFilename = {};

  /** Monotonic request id sequence for related-item fetches. */
  var relatedRequestSeq = 0;

  /** In-memory cache of overlap items keyed by filename (session-only). */
  var overlapCache = {};

  /** Per-filename overlap UI state. */
  var overlapStateByFilename = {};

  /** Tracks latest in-flight overlap request id per filename. */
  var overlapRequestIdByFilename = {};

  /** Monotonic request id sequence for overlap fetches. */
  var overlapRequestSeq = 0;

  /** In-memory cache of explain payload keyed by filename (session-only). */
  var explainCache = {};

  /** Per-filename explain UI state. */
  var explainStateByFilename = {};

  /** Tracks latest in-flight explain request id per filename. */
  var explainRequestIdByFilename = {};

  /** Monotonic request id sequence for explain fetches. */
  var explainRequestSeq = 0;

  /** In-memory cache of pending item detail keyed by filename (session-only). */
  var detailCache = {};

  /** Per-filename detail UI state. */
  var detailStateByFilename = {};

  /** Tracks latest in-flight detail request id per filename. */
  var detailRequestIdByFilename = {};

  /** Monotonic request id sequence for detail fetches. */
  var detailRequestSeq = 0;

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
    selectedItem = Object.assign({}, item);

    document.querySelectorAll(".pending-item").forEach(function (el) {
      el.classList.toggle("pending-item--selected", el.dataset.filename === selectedItem.filename);
    });

    renderPreview(selectedItem);
    ensurePendingDetailLoaded(selectedItem.filename);
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
    var relatedState = getRelatedState(filename);
    var overlapState = getOverlapState(filename);
    var explainState = getExplainState(filename);
    var detailState = getDetailState(filename);
    var qualityGate = (item && item.quality_gate) || (detailState.item && detailState.item.quality_gate) || null;

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
            '<span class="preview-assist-label">QUALITY GATE</span>' +
          '</div>' +
          '<div class="preview-quality-region" id="preview-quality-gate-region">' +
            renderQualityGateMarkup(detailState, qualityGate) +
          '</div>' +
        '</div>' +
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
        '<div class="preview-assist">' +
          '<div class="preview-assist-head">' +
            '<span class="preview-assist-label">Related</span>' +
            '<button class="btn btn--default btn--sm" id="preview-load-related-btn"' +
                    (relatedState.status === "loading" ? " disabled" : "") + '>' +
              'Load related' +
            '</button>' +
          '</div>' +
          '<div class="preview-related-region" id="preview-related-region">' +
            renderRelatedMarkup(relatedState) +
          '</div>' +
        '</div>' +
        '<div class="preview-assist">' +
          '<div class="preview-assist-head">' +
            '<span class="preview-assist-label">Overlap hints</span>' +
            '<button class="btn btn--default btn--sm" id="preview-load-overlap-btn"' +
                    (overlapState.status === "loading" ? " disabled" : "") + '>' +
              'Load overlap hints' +
            '</button>' +
          '</div>' +
          '<div class="preview-overlap-region" id="preview-overlap-region">' +
            renderOverlapMarkup(overlapState) +
          '</div>' +
        '</div>' +
        '<div class="preview-assist">' +
          '<div class="preview-assist-head">' +
            '<span class="preview-assist-label">Explain</span>' +
            '<button class="btn btn--default btn--sm" id="preview-load-explain-btn"' +
                    (explainState.status === "loading" ? " disabled" : "") + '>' +
              'Load explain' +
            '</button>' +
          '</div>' +
          '<div class="preview-explain-region" id="preview-explain-region">' +
            renderExplainMarkup(explainState) +
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

    var loadRelatedBtn = document.getElementById("preview-load-related-btn");
    if (loadRelatedBtn) {
      loadRelatedBtn.addEventListener("click", function () {
        loadRelated(filename);
      });
    }

    var loadOverlapBtn = document.getElementById("preview-load-overlap-btn");
    if (loadOverlapBtn) {
      loadOverlapBtn.addEventListener("click", function () {
        loadOverlap(filename);
      });
    }

    var loadExplainBtn = document.getElementById("preview-load-explain-btn");
    if (loadExplainBtn) {
      loadExplainBtn.addEventListener("click", function () {
        loadExplain(filename);
      });
    }
  }

  function getFullContentState(filename) {
    if (Object.prototype.hasOwnProperty.call(fullContentCache, filename)) {
      return { status: "loaded", content: fullContentCache[filename] };
    }
    return fullContentStateByFilename[filename] || { status: "idle" };
  }

  function getDetailState(filename) {
    if (Object.prototype.hasOwnProperty.call(detailCache, filename)) {
      return { status: "loaded", item: detailCache[filename] };
    }
    return detailStateByFilename[filename] || { status: "idle", item: null };
  }

  function renderQualityGateMarkup(detailState, qualityGate) {
    if (qualityGate) {
      var status = String(qualityGate.status || "unavailable").toLowerCase();
      var recommended = qualityGate.recommended_action || "review";
      var summary = qualityGate.summary || {};
      var findings = Array.isArray(qualityGate.top_findings) ? qualityGate.top_findings : [];

      return (
        '<div class="quality-gate-card">' +
          '<div class="quality-gate-header">' +
            '<span class="quality-gate-badge quality-gate-badge--' + window.escHtml(status) + '">' +
              window.escHtml(status.toUpperCase()) +
            '</span>' +
            '<span class="quality-gate-action">Recommended: ' + window.escHtml(String(recommended).toUpperCase()) + '</span>' +
          '</div>' +
          '<div class="quality-gate-summary">' +
            'Hard blocks: ' + window.escHtml(String(summary.hard_block_count || 0)) +
            ' &middot; Warnings: ' + window.escHtml(String(summary.warning_count || 0)) +
            ' &middot; Advisories: ' + window.escHtml(String(summary.advisory_count || 0)) +
          '</div>' +
          (findings.length
            ? '<ul class="quality-gate-list">' +
                findings.slice(0, 3).map(function (entry) {
                  var findingStatus = String(entry.severity || "advisory").toUpperCase();
                  var findingAction = entry.recommended_action ? ' &middot; ' + window.escHtml(entry.recommended_action) : '';
                  return '<li>' +
                    '<span class="quality-gate-finding-id">' + window.escHtml(entry.id || "quality_gate_finding") + '</span>' +
                    '<span class="quality-gate-finding-severity">' + window.escHtml(findingStatus) + '</span>' +
                    '<div class="quality-gate-finding-message">' + window.escHtml(entry.message || "Quality gate finding.") + findingAction + '</div>' +
                  '</li>';
                }).join("") +
              '</ul>'
            : '<div class="preview-inline-note">No quality findings.</div>') +
        '</div>'
      );
    }

    if (detailState && detailState.status === "loading") {
      return '<div class="preview-inline-status">Loading quality gate&hellip;</div>';
    }

    if (detailState && detailState.status === "error") {
      return '<div class="preview-inline-error">' +
               window.escHtml(detailState.message || "Failed to load quality gate.") +
             '</div>';
    }

    return '<div class="preview-inline-note">Quality gate is not loaded yet.</div>';
  }

  function ensurePendingDetailLoaded(filename) {
    if (!filename) return;

    var existingState = getDetailState(filename);
    if (existingState.status === "loaded") {
      if (selectedItem && selectedItem.filename === filename) {
        selectedItem = Object.assign({}, selectedItem, existingState.item || {});
        renderPreview(selectedItem);
      }
      return;
    }

    if (existingState.status === "loading") {
      return;
    }

    var requestId = ++detailRequestSeq;
    detailRequestIdByFilename[filename] = requestId;
    detailStateByFilename[filename] = { status: "loading", item: null };
    if (selectedItem && selectedItem.filename === filename) {
      renderPreview(selectedItem);
    }

    API.getPendingItem(filename)
      .then(function (item) {
        if (detailRequestIdByFilename[filename] !== requestId) return;

        detailCache[filename] = item || {};
        detailStateByFilename[filename] = { status: "loaded", item: item || {} };

        if (selectedItem && selectedItem.filename === filename) {
          selectedItem = Object.assign({}, selectedItem, item || {});
          renderPreview(selectedItem);
        }
      })
      .catch(function (err) {
        if (detailRequestIdByFilename[filename] !== requestId) return;

        detailStateByFilename[filename] = {
          status: "error",
          item: null,
          message: buildPendingDetailErrorMessage(err)
        };

        if (selectedItem && selectedItem.filename === filename) {
          renderPreview(selectedItem);
        }
      });
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

    var detailState = getDetailState(filename);
    if (detailState.status === "loaded" && detailState.item && typeof detailState.item.content === "string") {
      fullContentCache[filename] = detailState.item.content;
      fullContentStateByFilename[filename] = { status: "loaded", content: detailState.item.content };
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

        detailCache[filename] = Object.assign({}, detailCache[filename] || {}, item || {});
        detailStateByFilename[filename] = { status: "loaded", item: detailCache[filename] };
        var content = (item && typeof item.content === "string") ? item.content : "";
        fullContentCache[filename] = content;
        fullContentStateByFilename[filename] = { status: "loaded", content: content };
        if (selectedItem && selectedItem.filename === filename) {
          selectedItem = Object.assign({}, selectedItem, item || {});
        }
        renderFullContentForCurrentSelection(filename);
        if (selectedItem && selectedItem.filename === filename) {
          renderPreview(selectedItem);
        }
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

  function buildPendingDetailErrorMessage(err) {
    var msg = "Failed to load item detail";
    if (err && err.status) msg += " (" + err.status + ")";
    return msg + ".";
  }

  function getRelatedState(filename) {
    if (Object.prototype.hasOwnProperty.call(relatedCache, filename)) {
      return { status: "loaded", items: relatedCache[filename] };
    }
    return relatedStateByFilename[filename] || { status: "idle" };
  }

  function renderRelatedMarkup(state) {
    if (!state || state.status === "idle") {
      return '<div class="preview-inline-note">Related items are not loaded yet.</div>';
    }
    if (state.status === "loading") {
      return '<div class="preview-inline-status">Loading related items&hellip;</div>';
    }
    if (state.status === "error") {
      return '<div class="preview-inline-error">' +
               window.escHtml(state.message || "Failed to load related items.") +
             '</div>';
    }

    var items = Array.isArray(state.items) ? state.items : [];
    if (!items.length) {
      return '<div class="preview-inline-note">No related pending items found in the queue.</div>';
    }

    return items.map(function (entry) {
      var title = entry.title || entry.filename || "Untitled";
      var filename = entry.filename || "";
      var typeTxt = entry.type || "unknown";
      var summary = entry.summary || "";
      var modifiedTxt = entry.modified_at ? window.formatDateTime(entry.modified_at) : "—";
      var reasons = Array.isArray(entry.match_reasons) ? entry.match_reasons : [];
      var reasonsText = reasons.join(", ");

      return (
        '<div class="related-item">' +
          '<div class="related-item-head">' +
            '<span class="related-item-title">' + window.escHtml(title) + '</span>' +
            '<span class="related-item-type">' + window.escHtml(String(typeTxt).toUpperCase()) + '</span>' +
          '</div>' +
          '<div class="related-item-meta">' +
            window.escHtml(filename) + ' &middot; ' + window.escHtml(modifiedTxt) +
          '</div>' +
          '<p class="related-item-summary">' + window.escHtml(summary) + '</p>' +
          (reasonsText
            ? '<div class="related-item-reasons">' + window.escHtml(reasonsText) + '</div>'
            : '') +
        '</div>'
      );
    }).join("");
  }

  function loadRelated(filename) {
    if (!filename) return;

    var existingState = getRelatedState(filename);
    if (existingState.status === "loaded") {
      renderRelatedForCurrentSelection(filename);
      return;
    }

    var requestId = ++relatedRequestSeq;
    relatedRequestIdByFilename[filename] = requestId;
    relatedStateByFilename[filename] = { status: "loading" };
    renderRelatedForCurrentSelection(filename);

    API.getPendingRelated(filename, 5)
      .then(function (data) {
        if (relatedRequestIdByFilename[filename] !== requestId) return;

        var items = (data && Array.isArray(data.items)) ? data.items : [];
        relatedCache[filename] = items;
        relatedStateByFilename[filename] = { status: "loaded", items: items };
        renderRelatedForCurrentSelection(filename);
      })
      .catch(function (err) {
        if (relatedRequestIdByFilename[filename] !== requestId) return;

        relatedStateByFilename[filename] = {
          status: "error",
          message: buildRelatedErrorMessage(err)
        };
        renderRelatedForCurrentSelection(filename);
      });
  }

  function renderRelatedForCurrentSelection(filename) {
    if (!selectedItem || selectedItem.filename !== filename) return;

    var state = getRelatedState(filename);
    var region = document.getElementById("preview-related-region");
    if (region) {
      region.innerHTML = renderRelatedMarkup(state);
    }

    var loadBtn = document.getElementById("preview-load-related-btn");
    if (loadBtn) {
      loadBtn.disabled = state.status === "loading";
    }
  }

  function buildRelatedErrorMessage(err) {
    var msg = "Failed to load related items";
    if (err && err.status) msg += " (" + err.status + ")";
    return msg + ".";
  }

  function getOverlapState(filename) {
    if (Object.prototype.hasOwnProperty.call(overlapCache, filename)) {
      return { status: "loaded", items: overlapCache[filename] };
    }
    return overlapStateByFilename[filename] || { status: "idle" };
  }

  function renderOverlapMarkup(state) {
    if (!state || state.status === "idle") {
      return '<div class="preview-inline-note">Overlap hints are not loaded yet.</div>';
    }
    if (state.status === "loading") {
      return '<div class="preview-inline-status">Loading overlap hints&hellip;</div>';
    }
    if (state.status === "error") {
      return '<div class="preview-inline-error">' +
               window.escHtml(state.message || "Failed to load overlap hints.") +
             '</div>';
    }

    var items = Array.isArray(state.items) ? state.items : [];
    if (!items.length) {
      return '<div class="preview-inline-note">No overlap signals detected in the pending queue.</div>';
    }

    return items.map(function (entry) {
      var title = entry.title || entry.filename || "Untitled";
      var filename = entry.filename || "";
      var typeTxt = entry.type || "unknown";
      var summary = entry.summary || "";
      var modifiedTxt = entry.modified_at ? window.formatDateTime(entry.modified_at) : "—";
      var reasons = Array.isArray(entry.overlap_reasons) ? entry.overlap_reasons : [];
      var reasonsText = reasons.join(", ");

      return (
        '<div class="overlap-item">' +
          '<div class="overlap-item-head">' +
            '<span class="overlap-item-title">' + window.escHtml(title) + '</span>' +
            '<span class="overlap-item-type">' + window.escHtml(String(typeTxt).toUpperCase()) + '</span>' +
          '</div>' +
          '<div class="overlap-item-meta">' +
            window.escHtml(filename) + ' &middot; ' + window.escHtml(modifiedTxt) +
          '</div>' +
          '<p class="overlap-item-summary">' + window.escHtml(summary) + '</p>' +
          (reasonsText
            ? '<div class="overlap-item-reasons">' + window.escHtml(reasonsText) + '</div>'
            : '') +
        '</div>'
      );
    }).join("");
  }

  function loadOverlap(filename) {
    if (!filename) return;

    var existingState = getOverlapState(filename);
    if (existingState.status === "loaded") {
      renderOverlapForCurrentSelection(filename);
      return;
    }

    var requestId = ++overlapRequestSeq;
    overlapRequestIdByFilename[filename] = requestId;
    overlapStateByFilename[filename] = { status: "loading" };
    renderOverlapForCurrentSelection(filename);

    API.getPendingOverlap(filename, 5)
      .then(function (data) {
        if (overlapRequestIdByFilename[filename] !== requestId) return;

        var items = (data && Array.isArray(data.items)) ? data.items : [];
        overlapCache[filename] = items;
        overlapStateByFilename[filename] = { status: "loaded", items: items };
        renderOverlapForCurrentSelection(filename);
      })
      .catch(function (err) {
        if (overlapRequestIdByFilename[filename] !== requestId) return;

        overlapStateByFilename[filename] = {
          status: "error",
          message: buildOverlapErrorMessage(err)
        };
        renderOverlapForCurrentSelection(filename);
      });
  }

  function renderOverlapForCurrentSelection(filename) {
    if (!selectedItem || selectedItem.filename !== filename) return;

    var state = getOverlapState(filename);
    var region = document.getElementById("preview-overlap-region");
    if (region) {
      region.innerHTML = renderOverlapMarkup(state);
    }

    var loadBtn = document.getElementById("preview-load-overlap-btn");
    if (loadBtn) {
      loadBtn.disabled = state.status === "loading";
    }
  }

  function buildOverlapErrorMessage(err) {
    var msg = "Failed to load overlap hints";
    if (err && err.status) msg += " (" + err.status + ")";
    return msg + ".";
  }

  function getExplainState(filename) {
    if (Object.prototype.hasOwnProperty.call(explainCache, filename)) {
      return { status: "loaded", data: explainCache[filename] };
    }
    return explainStateByFilename[filename] || { status: "idle" };
  }

  function renderExplainMarkup(state) {
    if (!state || state.status === "idle") {
      return '<div class="preview-inline-note">Explain output is not loaded yet.</div>';
    }
    if (state.status === "loading") {
      return '<div class="preview-inline-status">Loading explanation&hellip;</div>';
    }
    if (state.status === "error") {
      return '<div class="preview-inline-error">' +
               window.escHtml(state.message || "Failed to load explanation.") +
             '</div>';
    }

    var data = state.data || {};
    var artifactType = data.artifact_type || "unknown";
    var typeSignals = Array.isArray(data.type_signals) ? data.type_signals : [];
    var purpose = data.purpose || "—";
    var whyInPending = data.why_in_pending || "—";
    var keyPoints = Array.isArray(data.key_points) ? data.key_points : [];
    var reread = Array.isArray(data.reread_candidates) ? data.reread_candidates : [];
    var cautions = Array.isArray(data.cautions) ? data.cautions : [];

    return (
      '<div class="explain-section">' +
        '<div class="explain-section-title">Artifact type</div>' +
        '<p class="explain-paragraph"><span class="explain-type-value">' +
          window.escHtml(String(artifactType).toUpperCase()) +
        '</span></p>' +
        (typeSignals.length
          ? '<div class="explain-signals-title">Type signals</div>' +
            '<ul class="explain-bullet-list explain-type-signals">' +
              typeSignals.map(function (entry) {
                return '<li>' + window.escHtml(entry) + '</li>';
              }).join("") +
            '</ul>'
          : '') +
      '</div>' +
      '<div class="explain-section">' +
        '<div class="explain-section-title">Purpose</div>' +
        '<p class="explain-paragraph">' + window.escHtml(purpose) + '</p>' +
      '</div>' +
      '<div class="explain-section">' +
        '<div class="explain-section-title">Why in pending</div>' +
        '<p class="explain-paragraph">' + window.escHtml(whyInPending) + '</p>' +
      '</div>' +
      '<div class="explain-section">' +
        '<div class="explain-section-title">Key points</div>' +
        renderExplainList(keyPoints, "No extracted key points.") +
      '</div>' +
      '<div class="explain-section">' +
        '<div class="explain-section-title">Reread</div>' +
        renderRereadList(reread) +
      '</div>' +
      '<div class="explain-section">' +
        '<div class="explain-section-title">Cautions</div>' +
        renderExplainList(cautions, "No explicit structural cautions.") +
      '</div>'
    );
  }

  function renderExplainList(items, emptyLabel) {
    if (!items.length) {
      return '<div class="explain-empty-note">' + window.escHtml(emptyLabel) + '</div>';
    }
    return '<ul class="explain-bullet-list">' +
      items.map(function (entry) {
        return '<li>' + window.escHtml(entry) + '</li>';
      }).join("") +
    '</ul>';
  }

  function renderRereadList(items) {
    if (!items.length) {
      return '<div class="explain-empty-note">No explicit reread candidates.</div>';
    }
    return '<ul class="explain-bullet-list explain-bullet-list--mono">' +
      items.map(function (entry) {
        return '<li>' + window.escHtml(entry) + '</li>';
      }).join("") +
    '</ul>';
  }

  function loadExplain(filename) {
    if (!filename) return;

    var existingState = getExplainState(filename);
    if (existingState.status === "loaded") {
      renderExplainForCurrentSelection(filename);
      return;
    }

    var requestId = ++explainRequestSeq;
    explainRequestIdByFilename[filename] = requestId;
    explainStateByFilename[filename] = { status: "loading" };
    renderExplainForCurrentSelection(filename);

    API.getPendingExplain(filename)
      .then(function (data) {
        if (explainRequestIdByFilename[filename] !== requestId) return;

        explainCache[filename] = data || {};
        explainStateByFilename[filename] = { status: "loaded", data: data || {} };
        renderExplainForCurrentSelection(filename);
      })
      .catch(function (err) {
        if (explainRequestIdByFilename[filename] !== requestId) return;

        explainStateByFilename[filename] = {
          status: "error",
          message: buildExplainErrorMessage(err)
        };
        renderExplainForCurrentSelection(filename);
      });
  }

  function renderExplainForCurrentSelection(filename) {
    if (!selectedItem || selectedItem.filename !== filename) return;

    var state = getExplainState(filename);
    var region = document.getElementById("preview-explain-region");
    if (region) {
      region.innerHTML = renderExplainMarkup(state);
    }

    var loadBtn = document.getElementById("preview-load-explain-btn");
    if (loadBtn) {
      loadBtn.disabled = state.status === "loading";
    }
  }

  function buildExplainErrorMessage(err) {
    var msg = "Failed to load explanation";
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
