/**
 * ZORNOX Web Ops Console — API Adapter
 *
 * All functions return Promises. Callers are responsible for error handling.
 *
 * Endpoint configuration is read from window.ZORNOX_CONFIG (config/app-config.js).
 * This file must be loaded AFTER config/app-config.js.
 *
 * Placeholder response shapes are documented inline.
 * Backend schema is not final — shapes will be updated once the wrapper is built.
 *
 * NOTE: Functions that call real backend endpoints are commented with:
 *   "// LIVE: <method> <endpoint>"
 * Placeholder/simulated blocks are marked with:
 *   "// PLACEHOLDER — remove when backend is available"
 */

/* global window, fetch, FormData */

const API = (() => {

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                             */
  /* ------------------------------------------------------------------ */

  function cfg() {
    return window.ZORNOX_CONFIG || {};
  }

  function endpoint(key) {
    const ep = cfg().endpoints || {};
    return ep[key] || `${cfg().apiBase || "/api"}/${key}`;
  }

  /**
   * Core fetch wrapper.
   * - Adds Content-Type: application/json for non-FormData bodies.
   * - Serialises plain objects to JSON.
   * - Throws on non-2xx responses (error has .status property).
   */
  async function request(url, options) {
    const opts = Object.assign({ headers: {} }, options);

    if (opts.body && !(opts.body instanceof FormData) && typeof opts.body !== "string") {
      opts.body = JSON.stringify(opts.body);
      opts.headers["Content-Type"] = "application/json";
    }

    if (opts.body instanceof FormData) {
      delete opts.headers["Content-Type"];
    }

    const res = await fetch(url, opts);

    if (!res.ok) {
      const err = new Error(`API ${res.status}: ${res.statusText} — ${url}`);
      err.status = res.status;
      let body = null;
      try { body = await res.json(); } catch (_) { /* ignore */ }
      err.body = body;
      throw err;
    }

    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  }

  /* ------------------------------------------------------------------ */
  /*  Upload Workflow                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Upload a single file to the intake pipeline.
   * LIVE: POST /api/claw-drop/upload
   *
   * Expected response:
   * {
   *   "ok": true,
   *   "file": {
   *     "name": "document.pdf",
   *     "size": 12345,
   *     "uploaded_at": "2026-03-09T08:00:00Z"
   *   }
   * }
   *
   * @param {File} file
   * @returns {Promise<object>}
   */
  function uploadFile(file) {
    const form = new FormData();
    form.append("file", file);
    return request(endpoint("clawDropUpload"), { method: "POST", body: form });
  }

  /**
   * Retrieve recently uploaded files.
   * LIVE: GET /api/claw-drop/list
   *
   * Expected response:
   * {
   *   "items": [
   *     { "name": "document.pdf", "size": 12345, "uploaded_at": "2026-03-09T08:00:00Z" }
   *   ]
   * }
   *
   * @returns {Promise<object>}
   */
  function getUploadList() {
    return request(endpoint("clawDropList"));
  }

  /* ------------------------------------------------------------------ */
  /*  Pending Review Workflow                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Retrieve the pending decision queue.
   * LIVE: GET /api/pending/list
   *
   * Expected response:
   * {
   *   "items": [
   *     {
   *       "id":         "PENDING_DECISION_001",
   *       "title":      "Example decision",
   *       "created_at": "2026-03-09",
   *       "preview":    "Short preview text..."
   *     }
   *   ]
   * }
   *
   * @returns {Promise<object>}
   */
  function getPendingList() {
    return request(endpoint("pendingList"));
  }

  /**
   * Retrieve full content for a single pending item.
   * LIVE: GET /api/pending/item?id=<id>
   *
   * Expected response:
   * {
   *   "id":         "PENDING_DECISION_001",
   *   "title":      "Example decision",
   *   "created_at": "2026-03-09",
   *   "preview":    "Short preview text...",
   *   "content":    "Full markdown or plain-text content...",
   *   "source":     "obsidian_vault | claw_drop | manual",
   *   "tags":       ["tag1", "tag2"]
   * }
   *
   * @param {string} id
   * @returns {Promise<object>}
   */
  function getPendingItem(id) {
    const url = endpoint("pendingItem") + "?id=" + encodeURIComponent(id);
    return request(url);
  }

  /**
   * Approve a single pending item.
   * LIVE: POST /api/pending/approve
   *
   * Request body:  { "id": "PENDING_DECISION_001" }
   * Expected response: { "ok": true, "id": "PENDING_DECISION_001" }
   *
   * @param {string} id
   * @returns {Promise<object>}
   */
  function approvePending(id) {
    return request(endpoint("pendingApprove"), { method: "POST", body: { id } });
  }

  /**
   * Reject a single pending item.
   * LIVE: POST /api/pending/reject
   *
   * Request body:  { "id": "PENDING_DECISION_001" }
   * Expected response: { "ok": true, "id": "PENDING_DECISION_001" }
   *
   * @param {string} id
   * @returns {Promise<object>}
   */
  function rejectPending(id) {
    return request(endpoint("pendingReject"), { method: "POST", body: { id } });
  }

  /**
   * Batch approve multiple pending items.
   * LIVE: POST /api/pending/batch
   *
   * Request body:  { "action": "approve", "ids": ["ID_001", "ID_002"] }
   * Expected response:
   * {
   *   "ok": true,
   *   "processed": 2,
   *   "failed": [],
   *   "action": "approve"
   * }
   *
   * @param {string[]} ids
   * @returns {Promise<object>}
   */
  function batchApprove(ids) {
    return request(endpoint("pendingBatch"), { method: "POST", body: { action: "approve", ids } });
  }

  /**
   * Batch reject multiple pending items.
   * LIVE: POST /api/pending/batch
   *
   * Request body:  { "action": "reject", "ids": ["ID_001", "ID_002"] }
   * Expected response: same shape as batchApprove
   *
   * @param {string[]} ids
   * @returns {Promise<object>}
   */
  function batchReject(ids) {
    return request(endpoint("pendingBatch"), { method: "POST", body: { action: "reject", ids } });
  }

  /* ------------------------------------------------------------------ */
  /*  Public Interface                                                    */
  /* ------------------------------------------------------------------ */

  return {
    uploadFile,
    getUploadList,
    getPendingList,
    getPendingItem,
    approvePending,
    rejectPending,
    batchApprove,
    batchReject
  };

})();
