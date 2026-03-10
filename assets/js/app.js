/**
 * ZORNOX Web Ops Console — Shared Utilities
 *
 * Runs on every page. Handles:
 *   - Active nav link detection
 *   - Live clock
 *   - Toast notifications (window.showToast)
 *   - Shared date helpers
 */

/* global window, document, API */

(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /*  Active nav detection                                                */
  /* ------------------------------------------------------------------ */

  function setActiveNav() {
    const raw  = window.location.pathname.split("/").pop();
    const page = raw === "" ? "index.html" : raw;

    document.querySelectorAll(".nav-link").forEach(function (link) {
      const href = (link.getAttribute("href") || "").split("?")[0];
      const match =
        href === page ||
        (page === "index.html" && (href === "index.html" || href === "")) ||
        href.replace(/\.html$/, "") === page.replace(/\.html$/, "");
      link.classList.toggle("active", match);
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Live clock                                                           */
  /* ------------------------------------------------------------------ */

  function startClock() {
    var el = document.getElementById("current-time");
    if (!el) return;

    function tick() {
      el.textContent = new Date().toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ------------------------------------------------------------------ */
  /*  Date stamp                                                           */
  /* ------------------------------------------------------------------ */

  function setDateStamp() {
    var el = document.getElementById("stat-date");
    if (!el) return;
    el.textContent = new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Toast notifications                                                  */
  /* ------------------------------------------------------------------ */

  function getOrCreateToastContainer() {
    var container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "toast-container";
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Show a toast message.
   * @param {string} message
   * @param {"info"|"success"|"error"|"warning"} [type="info"]
   */
  window.showToast = function (message, type) {
    type = type || "info";
    var container = getOrCreateToastContainer();

    var toast = document.createElement("div");
    toast.className = "toast toast--" + type;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        toast.classList.add("toast--visible");
      });
    });

    setTimeout(function () {
      toast.classList.remove("toast--visible");
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 280);
    }, 3600);
  };

  /* ------------------------------------------------------------------ */
  /*  Dashboard: pending count refresh                                    */
  /* ------------------------------------------------------------------ */

  function refreshDashboardStats() {
    var badge      = document.getElementById("nav-pending-count");
    var statPending = document.getElementById("stat-pending");
    if (!badge && !statPending) return;

    /* NOTE: Uncomment when backend is available:
    API.getPendingList()
      .then(function (data) {
        var count = (data && data.items) ? data.items.length : 0;
        if (badge)      badge.textContent      = count;
        if (statPending) statPending.textContent = count;
      })
      .catch(function () {
        // silently fail — badge stays at previous value
      });
    */

    // PLACEHOLDER — shows a static 5 for demo purposes
    var count = 5;
    if (badge)       badge.textContent       = count;
    if (statPending) statPending.textContent = count;
  }

  function scheduleStatRefresh() {
    var cfg = window.ZORNOX_CONFIG && window.ZORNOX_CONFIG.ui;
    var interval = cfg && cfg.refreshInterval ? cfg.refreshInterval : 0;
    refreshDashboardStats();
    if (interval > 0) setInterval(refreshDashboardStats, interval);
  }

  /* ------------------------------------------------------------------ */
  /*  Shared date formatter (used by upload + pending)                    */
  /* ------------------------------------------------------------------ */

  /**
   * @param {string} iso  ISO date/datetime string
   * @returns {string}
   */
  window.formatDateTime = function (iso) {
    try {
      return new Date(iso).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (_) {
      return iso;
    }
  };

  /**
   * Escape a string for safe insertion as HTML text.
   * @param {string} str
   * @returns {string}
   */
  window.escHtml = function (str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  /* ------------------------------------------------------------------ */
  /*  Init                                                                 */
  /* ------------------------------------------------------------------ */

  document.addEventListener("DOMContentLoaded", function () {
    setActiveNav();
    startClock();
    setDateStamp();
    scheduleStatRefresh();
  });

})();
