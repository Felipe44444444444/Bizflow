export function buildStyles(cfg) {
  const p   = cfg.primaryColor || '#00F5FF';
  const pos = cfg.position === 'bottom-left';
  const r   = cfg.borderRadius || '20px';
  const bg  = cfg.darkMode === false ? '#ffffff' : '#050510';
  const isDark = cfg.darkMode !== false;

  const msgBg      = isDark ? '#0D0D1F' : '#F8FAFC';
  const msgText    = isDark ? '#E2E8F0' : '#1E293B';
  const userBubble = p;
  const botBubble  = isDark ? '#13132A' : '#F1F5F9';
  const botText    = isDark ? '#E2E8F0' : '#1E293B';
  const inputBg    = isDark ? '#0D0D1F' : '#FFFFFF';
  const inputBorder = isDark ? `rgba(0,245,255,0.15)` : '#E2E8F0';
  const footerBorder = isDark ? `rgba(0,245,255,0.08)` : '#F1F5F9';
  const brandColor  = isDark ? '#4A5568' : '#CBD5E1';
  const placeholderColor = isDark ? '#4A5568' : '#94A3B8';

  return `
/* ── Google Fonts ────────────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');

/* ── Reset ───────────────────────────────────────── */
.cc-w *, .cc-w *::before, .cc-w *::after {
  box-sizing: border-box; margin: 0; padding: 0;
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* ── Launcher button ─────────────────────────────── */
#cc-launcher {
  position: fixed;
  ${pos ? 'left:24px' : 'right:24px'};
  bottom: 24px;
  width: 60px; height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, ${p}, ${p}99);
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 24px rgba(0,0,0,0.3), 0 0 0 0 ${p}44;
  display: flex; align-items: center; justify-content: center;
  z-index: 2147483646;
  transition: transform .25s cubic-bezier(.34,1.56,.64,1), box-shadow .25s;
  outline: none;
  animation: cc-launcher-in .6s cubic-bezier(.34,1.56,.64,1) 1s both;
}
@keyframes cc-launcher-in {
  from { opacity:0; transform:scale(0.4) translateY(20px); }
  to   { opacity:1; transform:scale(1)   translateY(0);    }
}
/* Pulse ring */
#cc-launcher::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid ${p}44;
  animation: cc-ring 2.5s ease-in-out infinite;
}
@keyframes cc-ring {
  0%, 100% { transform: scale(1);   opacity: .6; }
  50%       { transform: scale(1.15); opacity: 0; }
}
#cc-launcher:hover  { transform: scale(1.1); box-shadow: 0 8px 32px rgba(0,0,0,0.35), 0 0 24px ${p}44; }
#cc-launcher:active { transform: scale(0.95); }
#cc-launcher svg    { transition: transform .3s cubic-bezier(.34,1.56,.64,1), opacity .25s; color:#fff; }
#cc-launcher .cc-icon-close { position:absolute; opacity:0; transform:rotate(-90deg) scale(0.6); }
#cc-launcher.cc-open .cc-icon-chat  { opacity:0; transform:rotate(90deg) scale(0.6); }
#cc-launcher.cc-open .cc-icon-close { opacity:1; transform:rotate(0deg) scale(1); }

/* ── Proactive bubble ───────────────────────────── */
#cc-proactive {
  position: fixed;
  ${pos ? 'left:92px' : 'right:92px'};
  bottom: 32px;
  background: ${isDark ? '#0D0D1F' : '#fff'};
  border: 1px solid ${isDark ? 'rgba(0,245,255,0.2)' : '#E2E8F0'};
  border-radius: 16px ${pos ? '16px 16px 4px' : '4px 16px 16px'};
  padding: 12px 16px;
  max-width: 240px;
  font-size: 13px;
  color: ${msgText};
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
  z-index: 2147483645;
  animation: cc-slide-up .4s cubic-bezier(.34,1.56,.64,1);
  cursor: pointer;
  line-height: 1.5;
}
@keyframes cc-slide-up {
  from { opacity:0; transform:translateY(12px); }
  to   { opacity:1; transform:translateY(0); }
}
#cc-proactive:hover { border-color: ${p}44; }

/* ── Chat window ─────────────────────────────────── */
#cc-window {
  position: fixed;
  ${pos ? 'left:24px' : 'right:24px'};
  bottom: 96px;
  width: 380px; height: 580px;
  background: ${bg};
  border-radius: ${r};
  border: 1px solid ${isDark ? 'rgba(0,245,255,0.12)' : 'rgba(0,0,0,0.08)'};
  box-shadow: 0 24px 64px rgba(0,0,0,0.35), ${isDark ? '0 0 0 1px rgba(0,245,255,0.06)' : '0 0 0 1px rgba(0,0,0,0.04)'};
  display: flex; flex-direction: column;
  overflow: hidden;
  z-index: 2147483645;
  transform: scale(0.9) translateY(20px);
  transform-origin: ${pos ? 'left' : 'right'} bottom;
  opacity: 0;
  pointer-events: none;
  transition: transform .3s cubic-bezier(.34,1.56,.64,1), opacity .2s ease;
}
#cc-window.cc-visible {
  transform: scale(1) translateY(0);
  opacity: 1;
  pointer-events: all;
}

/* ── Header ──────────────────────────────────────── */
#cc-header {
  background: linear-gradient(135deg, ${isDark ? '#0D0D1F' : '#fff'} 0%, ${isDark ? '#0a0a1a' : '#f8fafc'} 100%);
  padding: 14px 16px 14px 16px;
  display: flex; align-items: center; gap: 12px;
  flex-shrink: 0;
  border-bottom: 1px solid ${isDark ? 'rgba(0,245,255,0.08)' : '#F1F5F9'};
  position: relative;
}
#cc-header::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, ${p}44, transparent);
}
#cc-avatar {
  width: 40px; height: 40px; border-radius: 50%;
  background: linear-gradient(135deg, ${p}30, ${p}10);
  border: 1.5px solid ${p}40;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; flex-shrink: 0;
  box-shadow: 0 0 12px ${p}30;
}
#cc-header-info { flex: 1; min-width: 0; }
#cc-agent-name  {
  font-size: 14px; font-weight: 600;
  color: ${isDark ? '#fff' : '#0f172a'};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#cc-status {
  font-size: 11px; color: #00FF88;
  display: flex; align-items: center; gap: 5px; margin-top: 2px;
}
#cc-status-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #00FF88; flex-shrink: 0;
  animation: cc-pulse 2s ease-in-out infinite;
  box-shadow: 0 0 6px #00FF8880;
}
@keyframes cc-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(0.8)} }
#cc-close-btn {
  background: none; border: none; cursor: pointer;
  color: ${isDark ? '#4A5568' : '#94A3B8'};
  padding: 6px; border-radius: 8px; line-height: 0;
  transition: background .15s, color .15s;
}
#cc-close-btn:hover {
  color: ${isDark ? '#fff' : '#1E293B'};
  background: ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'};
}

/* ── Messages ────────────────────────────────────── */
#cc-messages {
  flex: 1; overflow-y: auto; padding: 16px 14px;
  display: flex; flex-direction: column; gap: 8px;
  scroll-behavior: smooth;
  background: ${isDark ? `radial-gradient(ellipse at 20% 80%, rgba(0,245,255,0.02) 0%, transparent 60%),radial-gradient(ellipse at 80% 20%, rgba(123,47,255,0.02) 0%, transparent 60%), ${bg}` : bg};
}
#cc-messages::-webkit-scrollbar { width: 3px; }
#cc-messages::-webkit-scrollbar-thumb {
  background: ${isDark ? 'rgba(0,245,255,0.12)' : '#E2E8F0'};
  border-radius: 2px;
}

.cc-msg { display: flex; align-items: flex-end; gap: 6px; max-width: 90%; }
.cc-msg.cc-user  { margin-left: auto; flex-direction: row-reverse; }
.cc-msg.cc-agent { margin-right: auto; }

.cc-bubble-wrap { display:flex; flex-direction:column; gap:3px; }
.cc-user .cc-bubble-wrap { align-items:flex-end; }

.cc-bubble {
  padding: 10px 14px; word-wrap: break-word;
  font-size: 13.5px; line-height: 1.55;
  animation: cc-msg-in .3s cubic-bezier(.34,1.56,.64,1);
}
@keyframes cc-msg-in {
  from { opacity:0; transform:scale(0.85) translateY(6px); }
  to   { opacity:1; transform:scale(1)    translateY(0);   }
}
.cc-user .cc-bubble {
  background: linear-gradient(135deg, ${p}, ${p}cc);
  color: #fff;
  border-radius: 18px 18px 4px 18px;
  box-shadow: 0 2px 12px ${p}44;
}
.cc-agent .cc-bubble {
  background: ${botBubble};
  color: ${botText};
  border-radius: 18px 18px 18px 4px;
  border: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'};
}
.cc-bubble a          { color: ${p}; text-decoration: underline; }
.cc-user .cc-bubble a { color: rgba(255,255,255,0.9); }
.cc-bubble strong     { font-weight: 600; }
.cc-bubble code       {
  background: rgba(0,0,0,0.12); padding: 1px 6px;
  border-radius: 4px; font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
}
.cc-user .cc-bubble code { background: rgba(255,255,255,0.2); }
.cc-bubble ul  { padding-left: 16px; margin: 4px 0; }
.cc-bubble li  { margin: 2px 0; }

.cc-msg-time {
  font-size: 10px;
  color: ${isDark ? '#4A5568' : '#94A3B8'};
  padding: 0 4px;
}

/* ── Typing indicator ─────────────────────────────── */
#cc-typing { display: flex; align-items: center; gap: 4px; padding: 10px 14px; }
#cc-typing span {
  width: 6px; height: 6px; border-radius: 50%;
  background: ${isDark ? '#4A5568' : '#CBD5E1'};
  animation: cc-bounce 1.2s infinite ease-in-out;
}
#cc-typing span:nth-child(2) { animation-delay: .15s; }
#cc-typing span:nth-child(3) { animation-delay: .30s; }
@keyframes cc-bounce {
  0%,80%,100% { transform:scale(0.6); opacity:.4; }
  40%          { transform:scale(1);   opacity:1;  }
}

/* ── Welcome screen ───────────────────────────────── */
#cc-welcome {
  display: flex; flex-direction: column;
  align-items: flex-start; padding: 8px 2px;
  gap: 8px;
}
#cc-welcome-greeting {
  font-size: 22px; font-weight: 700;
  color: ${isDark ? '#fff' : '#0f172a'};
  margin-bottom: 2px;
}
.cc-welcome-bubble {
  background: ${botBubble};
  border: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'};
  border-radius: 18px 18px 18px 4px;
  padding: 10px 14px;
  font-size: 13.5px;
  color: ${botText};
  line-height: 1.55;
  max-width: 92%;
  animation: cc-msg-in .4s .2s cubic-bezier(.34,1.56,.64,1) both;
}

/* ── Quick replies ────────────────────────────────── */
#cc-quick-replies {
  display: flex; gap: 6px; flex-wrap: wrap;
  padding: 0 2px;
  animation: cc-fade-in .4s .5s both;
}
@keyframes cc-fade-in { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
.cc-quick-reply {
  padding: 6px 12px;
  border-radius: 20px;
  border: 1px solid ${p}44;
  background: ${p}0D;
  color: ${p};
  font-size: 12px; font-weight: 500;
  cursor: pointer;
  transition: background .15s, border-color .15s, transform .1s;
  white-space: nowrap;
  font-family: inherit;
}
.cc-quick-reply:hover  { background: ${p}20; border-color: ${p}80; transform: translateY(-1px); }
.cc-quick-reply:active { transform: scale(0.96); }

/* ── Input area ───────────────────────────────────── */
#cc-footer {
  border-top: 1px solid ${footerBorder};
  padding: 10px 12px;
  display: flex; align-items: flex-end; gap: 8px;
  flex-shrink: 0;
  background: ${inputBg};
}
#cc-input {
  flex: 1; border: 1px solid ${inputBorder};
  border-radius: 14px;
  padding: 9px 14px; font-size: 13.5px;
  color: ${msgText};
  background: ${isDark ? '#13132A' : '#F8FAFC'};
  outline: none; resize: none;
  max-height: 120px; min-height: 40px; line-height: 1.5;
  transition: border-color .2s, box-shadow .2s;
  font-family: inherit;
}
#cc-input:focus {
  border-color: ${p}60;
  box-shadow: 0 0 0 3px ${p}12;
}
#cc-input::placeholder { color: ${placeholderColor}; }
#cc-send {
  width: 38px; height: 38px; border-radius: 12px;
  background: linear-gradient(135deg, ${p}, ${p}cc);
  border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: filter .15s, transform .1s, box-shadow .2s; flex-shrink: 0;
  box-shadow: 0 2px 8px ${p}44;
}
#cc-send:hover   { filter: brightness(1.15); box-shadow: 0 4px 16px ${p}60; }
#cc-send:active  { transform: scale(0.93); }
#cc-send:disabled { opacity: .35; cursor: default; transform: none; box-shadow: none; }
#cc-send svg { color: #fff; }

/* ── Branding ─────────────────────────────────────── */
#cc-brand {
  text-align: center; padding: 6px 4px 8px;
  font-size: 10px; color: ${brandColor};
  letter-spacing: 0.02em;
  background: ${inputBg};
}
#cc-brand a { color: ${isDark ? '#4A5568' : '#94A3B8'}; text-decoration: none; }
#cc-brand a:hover { color: ${p}; text-decoration: none; }

/* ── Pre-chat form ────────────────────────────────── */
#cc-prechat {
  flex: 1; display: flex; flex-direction: column;
  padding: 24px 20px; gap: 14px; overflow-y: auto;
  background: ${bg};
}
#cc-prechat-title {
  font-size: 18px; font-weight: 700;
  color: ${isDark ? '#fff' : '#0f172a'};
}
#cc-prechat-subtitle {
  font-size: 13px; color: ${isDark ? '#A0AEC0' : '#64748B'};
  line-height: 1.5; margin-top: -6px;
}
#cc-prechat input {
  border: 1px solid ${inputBorder};
  border-radius: 12px;
  padding: 10px 14px; font-size: 13.5px;
  color: ${msgText};
  background: ${isDark ? '#13132A' : '#F8FAFC'};
  outline: none; width: 100%;
  transition: border-color .2s, box-shadow .2s;
  font-family: inherit;
}
#cc-prechat input:focus {
  border-color: ${p}60;
  box-shadow: 0 0 0 3px ${p}12;
}
#cc-prechat input::placeholder { color: ${placeholderColor}; }
#cc-prechat-start {
  margin-top: 4px; padding: 12px;
  background: linear-gradient(135deg, ${p}, ${p}cc);
  color: #fff; border: none;
  border-radius: 12px; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: filter .15s, transform .1s;
  box-shadow: 0 4px 16px ${p}44;
  font-family: inherit;
}
#cc-prechat-start:hover  { filter: brightness(1.1); }
#cc-prechat-start:active { transform: scale(0.98); }

/* ── Error message ────────────────────────────────── */
.cc-error {
  background: rgba(255,56,96,0.1);
  color: #FF3860;
  border: 1px solid rgba(255,56,96,0.2);
  border-radius: 12px; padding: 10px 14px;
  font-size: 12px; text-align: center;
}

/* ── Mobile ───────────────────────────────────────── */
@media (max-width: 480px) {
  #cc-window {
    left: 0 !important; right: 0 !important; bottom: 0 !important;
    width: 100% !important; height: 100% !important;
    border-radius: 0 !important;
    max-height: 100dvh;
    border: none !important;
  }
  #cc-launcher { ${pos ? 'left:16px' : 'right:16px'}; bottom: 16px; }
}
`;
}
