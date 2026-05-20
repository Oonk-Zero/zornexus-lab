/* ZORNOX Ops Console — Operator Auth Gate
 * Token lives in sessionStorage only — cleared on tab close, never logged.
 */
const AUTH = (() => {
  const _KEY = 'zx_ops_tok';

  function getToken() {
    return sessionStorage.getItem(_KEY) || '';
  }

  function _store(val) {
    sessionStorage.setItem(_KEY, val);
  }

  function clearToken() {
    sessionStorage.removeItem(_KEY);
  }

  function isAuthenticated() {
    return getToken() !== '';
  }

  /* ── Styles ───────────────────────────────────────────────────── */

  function _injectStyles() {
    const s = document.createElement('style');
    s.textContent = [
      '#auth-gate{position:fixed;inset:0;z-index:9999;background:rgba(10,10,18,.92);',
      'display:flex;align-items:center;justify-content:center}',
      '.auth-gate-box{background:#141420;border:1px solid #2a2a45;border-radius:8px;',
      'padding:32px 28px;width:100%;max-width:360px;display:flex;flex-direction:column;gap:12px}',
      '.auth-gate-title{font-family:monospace;font-size:14px;font-weight:700;',
      'color:#e0e0f0;letter-spacing:.08em;text-transform:uppercase}',
      '.auth-gate-desc{font-size:12px;color:#888;margin:0}',
      '.auth-gate-input{width:100%;box-sizing:border-box;background:#0d0d1a;',
      'border:1px solid #2a2a45;border-radius:4px;padding:9px 10px;',
      'color:#e0e0f0;font-family:monospace;font-size:13px;outline:none}',
      '.auth-gate-input:focus{border-color:#5555cc}',
      '.auth-gate-error{font-size:12px;color:#e05555;min-height:16px}',
      '.auth-gate-btn{background:#3a3acc;border:none;border-radius:4px;color:#fff;',
      'font-size:13px;font-weight:600;padding:9px;cursor:pointer;width:100%}',
      '.auth-gate-btn:hover{background:#4a4adc}',
      '#auth-lock-btn{position:fixed;top:12px;right:16px;z-index:9000;',
      'background:transparent;border:1px solid #2a2a45;border-radius:4px;',
      'color:#888;font-size:11px;padding:4px 10px;cursor:pointer;display:none}',
      '#auth-lock-btn:hover{color:#e0e0f0;border-color:#5555cc}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ── DOM injection ────────────────────────────────────────────── */

  function _injectGate() {
    _injectStyles();

    var overlay = document.createElement('div');
    overlay.id = 'auth-gate';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Operator authentication required');
    overlay.innerHTML =
      '<div class="auth-gate-box">' +
        '<div class="auth-gate-title">ZORNOX Ops Console</div>' +
        '<p class="auth-gate-desc">Operator token required to continue.</p>' +
        '<input type="password" id="auth-token-input" class="auth-gate-input"' +
        '       placeholder="Bearer token" autocomplete="off" spellcheck="false">' +
        '<div id="auth-gate-error" class="auth-gate-error" aria-live="polite"></div>' +
        '<button id="auth-submit-btn" class="auth-gate-btn">Unlock</button>' +
      '</div>';
    document.body.appendChild(overlay);

    var lockBtn = document.createElement('button');
    lockBtn.id = 'auth-lock-btn';
    lockBtn.textContent = 'Lock session';
    lockBtn.setAttribute('aria-label', 'Clear session token and lock console');
    document.body.appendChild(lockBtn);

    document.getElementById('auth-submit-btn').addEventListener('click', _handleSubmit);
    document.getElementById('auth-token-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') _handleSubmit();
    });
    lockBtn.addEventListener('click', function() {
      clearToken();
      _showGate('');
    });

    _updateVisibility();
  }

  function _handleSubmit() {
    var input = document.getElementById('auth-token-input');
    var errEl = document.getElementById('auth-gate-error');
    var val   = (input.value || '').trim();
    if (!val) { errEl.textContent = 'Token is required.'; return; }
    _store(val);
    input.value       = '';
    errEl.textContent = '';
    window.location.reload();
  }

  function _showGate(msg) {
    var gate  = document.getElementById('auth-gate');
    var btn   = document.getElementById('auth-lock-btn');
    var errEl = document.getElementById('auth-gate-error');
    var input = document.getElementById('auth-token-input');
    if (gate)  gate.style.display = 'flex';
    if (btn)   btn.style.display  = 'none';
    if (errEl && msg) errEl.textContent = msg;
    if (input) setTimeout(function() { input.focus(); }, 50);
  }

  function _updateVisibility() {
    var gate = document.getElementById('auth-gate');
    var btn  = document.getElementById('auth-lock-btn');
    if (isAuthenticated()) {
      if (gate) gate.style.display = 'none';
      if (btn)  btn.style.display  = 'block';
    } else {
      _showGate('');
    }
  }

  /* ── Public ──────────────────────────────────────────────────── */

  function onAuthError() {
    clearToken();
    _showGate('Incorrect token — try again.');
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _injectGate);
    } else {
      _injectGate();
    }
  }

  return { getToken, clearToken, isAuthenticated, onAuthError, init };
})();

AUTH.init();
