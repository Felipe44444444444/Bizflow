export function buildStyles(cfg) {
  const p = cfg.primaryColor || '#6366f1';
  const pos = cfg.position === 'bottom-left';
  const r = cfg.borderRadius || '16px';

  return `
/* ── Reset ───────────────────────────────────── */
.cc-w *, .cc-w *::before, .cc-w *::after {
  box-sizing: border-box; margin: 0; padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* ── Launcher button ─────────────────────────── */
#cc-launcher {
  position: fixed;
  ${pos ? 'left:20px' : 'right:20px'};
  bottom: 20px;
  width: 56px; height: 56px;
  border-radius: 50%;
  background: ${p};
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 24px rgba(0,0,0,0.25), 0 0 0 0 ${p}66;
  display: flex; align-items: center; justify-content: center;
  z-index: 2147483646;
  transition: transform .2s cubic-bezier(.34,1.56,.64,1), box-shadow .2s;
  outline: none;
}
#cc-launcher:hover  { transform: scale(1.1); box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
#cc-launcher:active { transform: scale(0.95); }
#cc-launcher svg    { transition: transform .3s, opacity .3s; }
#cc-launcher .cc-icon-close { position:absolute; opacity:0; transform:rotate(-90deg); }
#cc-launcher.cc-open .cc-icon-chat  { opacity:0; transform:rotate(90deg); }
#cc-launcher.cc-open .cc-icon-close { opacity:1; transform:rotate(0deg); }

/* ── Chat window ─────────────────────────────── */
#cc-window {
  position: fixed;
  ${pos ? 'left:20px' : 'right:20px'};
  bottom: 88px;
  width: 380px; height: 560px;
  background: #fff;
  border-radius: ${r};
  box-shadow: 0 20px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06);
  display: flex; flex-direction: column;
  overflow: hidden;
  z-index: 2147483645;
  transform: scale(0.92) translateY(16px);
  transform-origin: ${pos ? 'left' : 'right'} bottom;
  opacity: 0;
  pointer-events: none;
  transition: transform .25s cubic-bezier(.34,1.56,.64,1), opacity .2s;
}
#cc-window.cc-visible {
  transform: scale(1) translateY(0);
  opacity: 1;
  pointer-events: all;
}

/* ── Header ──────────────────────────────────── */
#cc-header {
  background: ${p};
  padding: 16px 20px;
  display: flex; align-items: center; gap: 12px;
  flex-shrink: 0;
}
#cc-avatar {
  width: 40px; height: 40px; border-radius: 50%;
  background: rgba(255,255,255,0.2);
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; flex-shrink: 0;
}
#cc-header-info { flex: 1; min-width: 0; }
#cc-agent-name  { font-size: 15px; font-weight: 600; color: #fff; }
#cc-status      { font-size: 11px; color: rgba(255,255,255,0.85); display: flex; align-items: center; gap: 5px; margin-top:2px; }
#cc-status-dot  { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; flex-shrink:0; animation: cc-pulse 2s infinite; }
@keyframes cc-pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
#cc-close-btn   { background:none; border:none; cursor:pointer; color:rgba(255,255,255,0.7); padding:4px; border-radius:6px; line-height:0; }
#cc-close-btn:hover { color:#fff; background:rgba(255,255,255,0.15); }

/* ── Messages ────────────────────────────────── */
#cc-messages {
  flex: 1; overflow-y: auto; padding: 20px 16px;
  display: flex; flex-direction: column; gap: 10px;
  scroll-behavior: smooth;
}
#cc-messages::-webkit-scrollbar { width: 4px; }
#cc-messages::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 2px; }

.cc-msg { display: flex; align-items: flex-end; gap: 8px; max-width: 88%; }
.cc-msg.cc-user { margin-left: auto; flex-direction: row-reverse; }
.cc-msg.cc-agent { margin-right: auto; }

.cc-bubble {
  padding: 10px 14px; border-radius: 18px;
  font-size: 14px; line-height: 1.5; word-wrap: break-word;
}
.cc-user  .cc-bubble { background: ${p}; color: #fff; border-bottom-right-radius: 4px; }
.cc-agent .cc-bubble { background: #f1f5f9; color: #1e293b; border-bottom-left-radius: 4px; }

.cc-bubble a          { color: ${p}; text-decoration: underline; }
.cc-user .cc-bubble a { color: rgba(255,255,255,0.9); }
.cc-bubble strong     { font-weight: 600; }
.cc-bubble code       { background: rgba(0,0,0,0.08); padding: 1px 5px; border-radius: 4px; font-size: 12px; font-family: monospace; }
.cc-user .cc-bubble code { background: rgba(255,255,255,0.2); }
.cc-bubble ul { padding-left: 16px; margin: 4px 0; }
.cc-bubble li { margin: 2px 0; }

.cc-msg-time { font-size: 10px; color: #94a3b8; margin-top: 2px; text-align: right; }

/* ── Typing indicator ────────────────────────── */
#cc-typing { display: flex; align-items: center; gap: 4px; padding: 10px 14px; }
#cc-typing span {
  width: 7px; height: 7px; border-radius: 50%; background: #94a3b8;
  animation: cc-bounce 1.2s infinite ease-in-out;
}
#cc-typing span:nth-child(2) { animation-delay: .15s; }
#cc-typing span:nth-child(3) { animation-delay: .3s; }
@keyframes cc-bounce { 0%,80%,100%{transform:scale(0.6);opacity:.4} 40%{transform:scale(1);opacity:1} }

/* ── Welcome / empty state ───────────────────── */
#cc-welcome {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 32px 24px; text-align: center; gap: 12px;
}
#cc-welcome-avatar { font-size: 40px; }
#cc-welcome h3 { font-size: 17px; font-weight: 700; color: #0f172a; }
#cc-welcome p  { font-size: 13px; color: #64748b; line-height: 1.5; }
.cc-welcome-bubble {
  background: #f1f5f9; border-radius: 16px; border-bottom-left-radius: 4px;
  padding: 12px 16px; font-size: 14px; color: #1e293b; text-align: left;
  align-self: flex-start; max-width: 90%; margin-top: 4px;
}

/* ── Input area ──────────────────────────────── */
#cc-footer {
  border-top: 1px solid #f1f5f9;
  padding: 12px 16px;
  display: flex; align-items: flex-end; gap: 10px;
  flex-shrink: 0;
}
#cc-input {
  flex: 1; border: 1px solid #e2e8f0; border-radius: 12px;
  padding: 9px 14px; font-size: 14px; color: #1e293b;
  background: #f8fafc; outline: none; resize: none;
  max-height: 120px; min-height: 40px; line-height: 1.5;
  transition: border-color .2s;
  font-family: inherit;
}
#cc-input:focus { border-color: ${p}; background: #fff; }
#cc-input::placeholder { color: #94a3b8; }
#cc-send {
  width: 38px; height: 38px; border-radius: 10px;
  background: ${p}; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background .15s, transform .1s; flex-shrink: 0;
}
#cc-send:hover   { filter: brightness(1.1); }
#cc-send:active  { transform: scale(0.94); }
#cc-send:disabled { opacity: .45; cursor: default; transform: none; }
#cc-send svg { color: #fff; }

/* ── Branding ────────────────────────────────── */
#cc-brand {
  text-align: center; padding: 6px; font-size: 10px;
  color: #cbd5e1; letter-spacing: 0.02em;
}
#cc-brand a { color: #94a3b8; text-decoration: none; }
#cc-brand a:hover { text-decoration: underline; }

/* ── Error message ───────────────────────────── */
.cc-error {
  background: #fef2f2; color: #dc2626;
  border: 1px solid #fecaca;
  border-radius: 10px; padding: 8px 12px;
  font-size: 12px; text-align: center;
}

/* ── Mobile ──────────────────────────────────── */
@media (max-width: 480px) {
  #cc-window {
    left: 0 !important; right: 0 !important; bottom: 0 !important;
    width: 100% !important; height: 100% !important;
    border-radius: 0 !important;
    max-height: 100dvh;
  }
  #cc-launcher { ${pos ? 'left:16px' : 'right:16px'}; bottom: 16px; }
}
`;
}
