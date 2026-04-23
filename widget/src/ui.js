// ── Icons ────────────────────────────────────────────────────────────────────
const ICON_CHAT = `<svg class="cc-icon-chat" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
const ICON_CLOSE = `<svg class="cc-icon-close" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const ICON_SEND  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
const ICON_X     = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

// ── Markdown parser ───────────────────────────────────────────────────────────
export function renderMarkdown(raw) {
  let t = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (``` ... ```)
  t = t.replace(/```[\s\S]*?```/g, (m) => {
    const code = m.slice(3, -3).replace(/^\n/, '');
    return `<pre style="background:rgba(0,0,0,0.06);border-radius:6px;padding:8px 10px;overflow-x:auto;font-size:12px;margin:4px 0"><code>${code}</code></pre>`;
  });

  // Inline code
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Bullet lists — collect consecutive lines starting with - or *
  t = t.replace(/((?:^[-*] .+\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map(l => `<li>${l.replace(/^[-*] /, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });

  // Line breaks
  t = t.replace(/\n/g, '<br>');

  return t;
}

// ── Timestamp helper ─────────────────────────────────────────────────────────
function timestamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── DOM creation ──────────────────────────────────────────────────────────────
export function createLauncher() {
  const btn = document.createElement('button');
  btn.id = 'cc-launcher';
  btn.setAttribute('aria-label', 'Abrir chat');
  btn.innerHTML = ICON_CHAT + ICON_CLOSE;
  return btn;
}

export function createWindow(cfg) {
  const win = document.createElement('div');
  win.id = 'cc-window';
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-label', 'Chat de soporte');

  win.innerHTML = `
    <div id="cc-header">
      <div id="cc-avatar">${cfg.agentAvatar || '🤖'}</div>
      <div id="cc-header-info">
        <div id="cc-agent-name">${cfg.agentName || 'Asistente IA'}</div>
        <div id="cc-status"><span id="cc-status-dot"></span>En línea</div>
      </div>
      <button id="cc-close-btn" aria-label="Cerrar">${ICON_X}</button>
    </div>

    <div id="cc-messages" aria-live="polite" aria-relevant="additions">
      <div id="cc-welcome">
        <div id="cc-welcome-avatar">${cfg.agentAvatar || '🤖'}</div>
        <div class="cc-welcome-bubble">${cfg.welcomeMessage || '¡Hola! ¿En qué puedo ayudarte hoy?'}</div>
      </div>
    </div>

    <div id="cc-footer">
      <textarea
        id="cc-input"
        rows="1"
        placeholder="${cfg.placeholder || 'Escribe un mensaje...'}"
        aria-label="Mensaje"
      ></textarea>
      <button id="cc-send" aria-label="Enviar" disabled>${ICON_SEND}</button>
    </div>

    <div id="cc-brand">Powered by <a href="https://conectachat.ai" target="_blank" rel="noopener">Conectachat</a></div>
  `;

  return win;
}

// ── Message bubble ────────────────────────────────────────────────────────────
export function appendMessage(container, { role, content, isError = false }) {
  // Remove welcome screen on first real message
  const welcome = container.querySelector('#cc-welcome');
  if (welcome) welcome.remove();

  const wrap = document.createElement('div');
  wrap.className = `cc-w cc-msg ${role === 'user' ? 'cc-user' : 'cc-agent'}`;

  const bubble = document.createElement('div');
  bubble.className = isError ? 'cc-bubble cc-error' : 'cc-bubble';

  if (role === 'user') {
    bubble.textContent = content;
  } else {
    bubble.innerHTML = renderMarkdown(content);
    // Open links in new tab
    bubble.querySelectorAll('a').forEach(a => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
  }

  const time = document.createElement('div');
  time.className = 'cc-msg-time';
  time.textContent = timestamp();

  const inner = document.createElement('div');
  inner.appendChild(bubble);
  inner.appendChild(time);

  wrap.appendChild(inner);
  container.appendChild(wrap);

  container.scrollTop = container.scrollHeight;
  return wrap;
}

// ── Typing indicator ──────────────────────────────────────────────────────────
export function showTyping(container) {
  const welcome = container.querySelector('#cc-welcome');
  if (welcome) welcome.remove();

  const wrap = document.createElement('div');
  wrap.className = 'cc-w cc-msg cc-agent';
  wrap.id = 'cc-typing-wrap';
  wrap.innerHTML = '<div class="cc-bubble" id="cc-typing"><span></span><span></span><span></span></div>';
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
  return wrap;
}

export function hideTyping() {
  document.getElementById('cc-typing-wrap')?.remove();
}

// ── Auto-resize textarea ──────────────────────────────────────────────────────
export function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}
