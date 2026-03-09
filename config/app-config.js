/**
 * ZORNOX Web Ops Console — Frontend Configuration
 *
 * This file is the single source of truth for API endpoint configuration.
 * All API calls in assets/js/api.js read from window.ZORNOX_CONFIG.
 *
 * To point at a different backend (e.g. tunnelled local wrapper, staging, prod):
 *   1. Update apiBase to the base URL of your backend wrapper.
 *   2. Update individual endpoint paths if the backend uses different routes.
 *
 * This file must be loaded BEFORE api.js and any page script.
 */

window.ZORNOX_CONFIG = {

  /**
   * Base URL for all API calls.
   * "/" means same-origin — works when served behind a reverse proxy or CF Worker
   * that routes /api/* to the local backend wrapper.
   * For local testing with a running backend, set e.g. "http://localhost:8787"
   */
  apiBase: "/api",

  /**
   * Explicit endpoint paths.
   * Override individual entries here if the backend routes differ from the defaults.
   */
  endpoints: {
    /* Upload workflow */
    clawDropUpload: "/api/claw-drop/upload",   // POST  multipart/form-data
    clawDropList:   "/api/claw-drop/list",      // GET   returns { items: [...] }

    /* Pending review workflow */
    pendingList:    "/api/pending/list",         // GET   returns { items: [...] }
    pendingItem:    "/api/pending/item",         // GET   ?id=... returns full item
    pendingApprove: "/api/pending/approve",      // POST  { id }
    pendingReject:  "/api/pending/reject",       // POST  { id }
    pendingBatch:   "/api/pending/batch"         // POST  { action: "approve"|"reject", ids: [...] }
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
