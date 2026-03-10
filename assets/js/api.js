/**
 * ZORNOX Web Ops Console — API Adapter
 *
 * All functions return Promises. Callers are responsible for error handling.
 * Endpoint configuration is read from window.ZORNOX_CONFIG (config/app-config.js).
 * This file must be loaded AFTER config/app-config.js.
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
    const ep      = cfg().endpoints || {};
    const base    = (cfg().apiBase || "").replace(/\/$/, "");
    const path    = ep[key] || `/api/${key}`;
    // If apiBase is a full URL (starts with http), prefix the path with it.
    // If apiBase is empty or "/api", just return the path as-is (same-origin).
    if (base && (base.startsWith("http://") || base.startsWith("https://"))) {
      // path already starts with /api/..., so strip /api from base if present
      return base + path;
    }
    return path;
  }

  /**
   * Core fetch wrapper.
   * - Adds Content-Type: application/json for non-FormData bodies.
   * - Serialises plain objects to JSON.
   * - Throws on non-2xx responses (error has .status and .body properties).
   */
  async function request(url, options) {
    const opts = Object.assign({ headers: {} }, options);

    // Inject bearer token from config if set
    const token = cfg().apiToken;
    if (token) {
      opts.headers["Authorization"] = "Bearer " + token;
    }

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
   * POST /api/claw-drop/upload  (multipart/form-data, field: "file")
   *
   * Response: { "ok": true, "file": { "name", "size", "uploaded_at" } }
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
   * GET /api/claw-drop/list
   *
   * Response: { "items": [{ "name", "size", "uploaded_at" }] }
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
   * Retrieve the pending decision queue — real file-backed records.
   * GET /api/pending/list
   *
   * Response:
   * {
   *   "items": [
   *     {
   *       "filename":        "PENDING_DECISION__use_web_ui.md",
   *       "path":            "D:\\...\\queue\\PENDING_DECISION__use_web_ui.md",
   *       "type":            "decision",
   *       "modified_at":     "2026-03-09T12:54:00",
   *       "title":           "Use web UI for pending approval",   // optional human label
   *       "summary":         "Short readable summary...",         // optional
   *       "content_preview": "First N chars of content..."        // optional
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
   * Retrieve full content for a single pending item by filename.
   * GET /api/pending/item?filename=<filename>
   *
   * Response:
   * {
   *   "filename":    "...",
   *   "path":        "...",
   *   "type":        "...",
   *   "modified_at": "...",
   *   "title":       "...",
   *   "summary":     "...",
   *   "content":     "full markdown content"
   * }
   *
   * @param {string} filename
   * @returns {Promise<object>}
   */
  function getPendingItem(filename) {
    const url = endpoint("pendingItem") + "?filename=" + encodeURIComponent(filename);
    return request(url);
  }

  /**
   * Approve a single pending item by filename.
   * POST /api/pending/approve
   *
   * Request:  { "filename": "PENDING_DECISION__use_web_ui.md" }
   * Response: { "ok": true, "filename": "..." }
   *
   * @param {string} filename
   * @returns {Promise<object>}
   */
  function approvePending(filename) {
    return request(endpoint("pendingApprove"), { method: "POST", body: { filename } });
  }

  /**
   * Reject a single pending item by filename.
   * POST /api/pending/reject
   *
   * Request:  { "filename": "PENDING_DECISION__use_web_ui.md" }
   * Response: { "ok": true, "filename": "..." }
   *
   * @param {string} filename
   * @returns {Promise<object>}
   */
  function rejectPending(filename) {
    return request(endpoint("pendingReject"), { method: "POST", body: { filename } });
  }

  /**
   * Batch approve multiple pending items by filename.
   * POST /api/pending/batch
   *
   * Request:  { "action": "approve", "filenames": ["file1.md", "file2.md"] }
   * Response: { "ok": true, "processed": 2, "failed": [], "action": "approve" }
   *
   * @param {string[]} filenames
   * @returns {Promise<object>}
   */
  function batchApprove(filenames) {
    return request(endpoint("pendingBatch"), { method: "POST", body: { action: "approve", filenames } });
  }

  /**
   * Batch reject multiple pending items by filename.
   * POST /api/pending/batch
   *
   * Request:  { "action": "reject", "filenames": ["file1.md", "file2.md"] }
   * Response: same shape as batchApprove
   *
   * @param {string[]} filenames
   * @returns {Promise<object>}
   */
  function batchReject(filenames) {
    return request(endpoint("pendingBatch"), { method: "POST", body: { action: "reject", filenames } });
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
