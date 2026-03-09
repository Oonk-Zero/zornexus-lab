/**
 * ZORNOX Web Ops Console — Upload Page Logic
 *
 * Handles:
 *   - Drag-and-drop file intake
 *   - File picker (click to browse)
 *   - Upload progress list
 *   - Recent uploads list (placeholder; swap for API.getUploadList() when ready)
 *
 * Requires: config/app-config.js, assets/js/api.js, assets/js/app.js
 */

/* global window, document, API */

(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /*  State                                                               */
  /* ------------------------------------------------------------------ */

  /** In-session uploads for the "recent uploads" list top section. */
  var sessionUploads = [];

  /* ------------------------------------------------------------------ */
  /*  Init                                                                */
  /* ------------------------------------------------------------------ */

  function init() {
    setupDropZone();
    setupFilePicker();
    loadRecentUploads();
  }

  /* ------------------------------------------------------------------ */
  /*  Drop Zone                                                           */
  /* ------------------------------------------------------------------ */

  function setupDropZone() {
    var zone = document.getElementById("drop-zone");
    if (!zone) return;

    // Prevent browser default file-open behaviour
    ["dragenter", "dragover", "dragleave", "drop"].forEach(function (evt) {
      zone.addEventListener(evt, function (e) { e.preventDefault(); e.stopPropagation(); });
      document.body.addEventListener(evt, function (e) { e.preventDefault(); });
    });

    zone.addEventListener("dragenter", function () { zone.classList.add("drop-zone--active"); });
    zone.addEventListener("dragover",  function () { zone.classList.add("drop-zone--active"); });
    zone.addEventListener("dragleave", function (e) {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove("drop-zone--active");
    });

    zone.addEventListener("drop", function (e) {
      zone.classList.remove("drop-zone--active");
      var files = Array.prototype.slice.call(e.dataTransfer.files);
      handleFiles(files);
    });

    zone.addEventListener("click",   function () { triggerPicker(); });
    zone.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); triggerPicker(); }
    });
  }

  function triggerPicker() {
    var input = document.getElementById("file-input");
    if (input) input.click();
  }

  /* ------------------------------------------------------------------ */
  /*  File Picker                                                         */
  /* ------------------------------------------------------------------ */

  function setupFilePicker() {
    var input = document.getElementById("file-input");
    if (!input) return;
    input.addEventListener("change", function () {
      var files = Array.prototype.slice.call(input.files);
      handleFiles(files);
      input.value = "";
    });
  }

  /* ------------------------------------------------------------------ */
  /*  File Processing                                                     */
  /* ------------------------------------------------------------------ */

  function handleFiles(files) {
    if (!files || !files.length) return;
    files.forEach(function (file) { processFile(file); });
  }

  function processFile(file) {
    var item = addProgressItem(file.name, "uploading");

    /* NOTE: Swap this block for the live API call when backend is available:
    API.uploadFile(file)
      .then(function (result) {
        updateProgressItem(item, "success");
        prependToRecentList({ name: file.name, uploaded_at: new Date().toISOString() });
        window.showToast("Uploaded: " + file.name, "success");
      })
      .catch(function (err) {
        updateProgressItem(item, "error");
        window.showToast("Upload failed: " + file.name, "error");
        console.error("[upload] API error:", err);
      });
    */

    // PLACEHOLDER — simulates an upload delay
    setTimeout(function () {
      var success = Math.random() > 0.08; // ~92% simulated success rate
      if (success) {
        updateProgressItem(item, "success");
        prependToRecentList({ name: file.name, uploaded_at: new Date().toISOString() });
        window.showToast("Uploaded: " + file.name, "success");
      } else {
        updateProgressItem(item, "error");
        window.showToast("Upload failed: " + file.name, "error");
      }
    }, 700 + Math.random() * 800);
  }

  /* ------------------------------------------------------------------ */
  /*  Progress List                                                       */
  /* ------------------------------------------------------------------ */

  function addProgressItem(name, status) {
    var list = document.getElementById("upload-progress-list");
    if (!list) return null;
    list.style.display = "block";

    var item = document.createElement("div");
    item.className = "upload-progress-item upload-progress-item--" + status;
    item.innerHTML =
      '<span class="upi-name">' + window.escHtml(name) + '</span>' +
      '<span class="upi-status">Uploading\u2026</span>';
    list.insertBefore(item, list.firstChild);
    return item;
  }

  function updateProgressItem(item, status) {
    if (!item) return;
    item.className = "upload-progress-item upload-progress-item--" + status;
    var statusEl = item.querySelector(".upi-status");
    if (statusEl) statusEl.textContent = status === "success" ? "Done" : "Failed";
  }

  /* ------------------------------------------------------------------ */
  /*  Recent Uploads List                                                 */
  /* ------------------------------------------------------------------ */

  function loadRecentUploads() {
    var container = document.getElementById("recent-uploads-list");
    if (!container) return;

    /* NOTE: Swap for live call when backend is available:
    API.getUploadList()
      .then(function (data) { renderRecentList(container, (data && data.items) || []); })
      .catch(function ()    { renderRecentList(container, []); });
    */

    // PLACEHOLDER — static seed data matching the expected response shape
    var placeholder = {
      items: [
        { name: "document_scan_001.pdf",    uploaded_at: "2026-03-09T08:22:00Z" },
        { name: "notes_march_backlog.md",   uploaded_at: "2026-03-09T07:15:00Z" },
        { name: "research_extract.txt",     uploaded_at: "2026-03-08T21:40:00Z" },
        { name: "vault_snapshot_0309.zip",  uploaded_at: "2026-03-08T18:05:00Z" }
      ]
    };

    renderRecentList(container, placeholder.items);
  }

  function prependToRecentList(entry) {
    sessionUploads.unshift(entry);
    var container = document.getElementById("recent-uploads-list");
    if (!container) return;
    // Merge session uploads at the top
    var existing = Array.prototype.slice.call(container.querySelectorAll(".recent-item"))
      .map(function (el) {
        return {
          name: el.querySelector(".recent-item-name") ? el.querySelector(".recent-item-name").textContent : "",
          uploaded_at: el.querySelector(".recent-item-time") ? el.querySelector(".recent-item-time").dataset.iso || "" : ""
        };
      });
    renderRecentList(container, sessionUploads.concat(existing).slice(0, 20));
  }

  function renderRecentList(container, items) {
    if (!items || !items.length) {
      container.innerHTML = '<div class="state-empty">No uploads yet.</div>';
      return;
    }

    container.innerHTML = items.map(function (item) {
      var ext = (item.name || "").split(".").pop().toUpperCase();
      return (
        '<div class="recent-item">' +
          '<div class="recent-item-icon">' + getFileIcon(ext) + '</div>' +
          '<div class="recent-item-body">' +
            '<span class="recent-item-name">' + window.escHtml(item.name) + '</span>' +
            '<span class="recent-item-time" data-iso="' + window.escHtml(item.uploaded_at) + '">' +
              window.formatDateTime(item.uploaded_at) +
            '</span>' +
          '</div>' +
        '</div>'
      );
    }).join("");
  }

  function getFileIcon(ext) {
    var icons = {
      PDF: "📄", MD: "📝", TXT: "📃", ZIP: "📦",
      PNG: "🖼", JPG: "🖼", JPEG: "🖼", GIF: "🖼",
      JSON: "📋", CSV: "📊", DOCX: "📄", DOC: "📄"
    };
    return icons[ext] || "📁";
  }

  /* ------------------------------------------------------------------ */
  /*  Bootstrap                                                           */
  /* ------------------------------------------------------------------ */

  document.addEventListener("DOMContentLoaded", init);

})();
