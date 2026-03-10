/**
 * ZORNOX Web Ops Console — Frontend Configuration
 *
 * All API calls in assets/js/api.js read from window.ZORNOX_CONFIG.
 * This file must be loaded BEFORE api.js and any page script.
 *
 * ── How to point at the backend ──────────────────────────────────────────────
 *
 * Local dev (backend on same machine):
 *   apiBase: "http://127.0.0.1:8090"
 *
 * Via Pinggy tunnel (production / remote):
 *   apiBase: "https://xxxx.a.pinggy.io"   ← replace with your tunnel URL
 *
 * Same-origin proxy (Cloudflare Worker or reverse proxy in front):
 *   apiBase: "/api"  and remove the full-URL endpoint overrides below
 */

window.ZORNOX_CONFIG = {

  /**
   * Base URL for all API calls.
   * Change this to your Pinggy tunnel URL when using the backend remotely.
   */
  apiBase: "https://zornexus.a.pinggy.link",

  /**
   * Bearer token sent in every API request as:
   *   Authorization: Bearer <apiToken>
   * Must match API_TOKEN in the backend .env file.
   * Leave empty to send no auth header (only valid when ENABLE_AUTH=false on backend).
   */
  apiToken: "sOrdM50zqwtDYmzo7ta2vqV7ifGNUs5q",

  /**
   * Explicit endpoint paths — override individual entries if routes differ.
   * All paths are appended to apiBase.
   */
  endpoints: {
    /* Upload workflow */
    clawDropUpload: "/api/claw-drop/upload",   // POST  multipart/form-data; field: "file"
    clawDropList:   "/api/claw-drop/list",      // GET   returns { items: [...] }

    /* Pending review workflow */
    pendingList:    "/api/pending/list",         // GET   ?limit=N&search=...  returns { items, total }
    pendingItem:    "/api/pending/item",         // GET   ?filename=...        returns full item detail
    pendingApprove: "/api/pending/approve",      // POST  { "filename": "..." }
    pendingReject:  "/api/pending/reject",       // POST  { "filename": "..." }
    pendingBatch:   "/api/pending/batch"         // POST  { "action": "approve"|"reject", "filenames": [...] }
  },

  /**
   * UI / runtime settings.
   */
  ui: {
    appName:         "ZORNOX Web Ops Console",
    /** Auto-refresh interval for the pending count badge (ms). Set 0 to disable. */
    refreshInterval: 60000
  }

};
