import { buildStyles } from './styles.js';
import { createLauncher, createWindow, appendMessage, showTyping, hideTyping, autoResize, showChat, hasPrechat, bindQuickReplies } from './ui.js';
import { sendMessage } from './api.js';

// ── Storage helpers ───────────────────────────────────────────────────────────
function storageKey(apiKey, suffix) {
  return `cc_${apiKey.slice(3, 11)}_${suffix}`;
}

function getVisitorId(apiKey) {
  const k = storageKey(apiKey, 'vid');
  let id = localStorage.getItem(k);
  if (!id) {
    id = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(k, id);
  }
  return id;
}

function getConversationId(apiKey) {
  return localStorage.getItem(storageKey(apiKey, 'cid')) || null;
}

function setConversationId(apiKey, id) {
  localStorage.setItem(storageKey(apiKey, 'cid'), id);
}

function getContactInfo(apiKey) {
  try {
    const raw = localStorage.getItem(storageKey(apiKey, 'contact'));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setContactInfo(apiKey, info) {
  localStorage.setItem(storageKey(apiKey, 'contact'), JSON.stringify(info));
}

// ── Widget class ──────────────────────────────────────────────────────────────
class Widget {
  constructor(cfg) {
    this.cfg = cfg;
    this.isOpen = false;
    this.isThinking = false;
    this.visitorId = getVisitorId(cfg.apiKey);
    this.conversationId = getConversationId(cfg.apiKey);
    this.contactInfo = getContactInfo(cfg.apiKey) || {};

    this._injectStyles();
    this._buildDOM();
    this._bindEvents();
  }

  _injectStyles() {
    if (document.getElementById('cc-styles')) return;
    const style = document.createElement('style');
    style.id = 'cc-styles';
    style.textContent = buildStyles(this.cfg);
    document.head.appendChild(style);
  }

  _buildDOM() {
    this.launcher = createLauncher();
    this.window   = createWindow(this.cfg);

    document.body.appendChild(this.launcher);
    document.body.appendChild(this.window);

    this.messagesEl = this.window.querySelector('#cc-messages');
    this.inputEl    = this.window.querySelector('#cc-input');
    this.sendBtn    = this.window.querySelector('#cc-send');

    // If contact info already collected (returning visitor), skip pre-chat
    if (hasPrechat(this.window) && (this.contactInfo.name || this.contactInfo.email || this.contactInfo.phone || this.conversationId)) {
      showChat(this.window);
    }

    // Bind quick reply buttons
    bindQuickReplies(this.window, (text) => {
      this.inputEl.value = text;
      this._submit();
    });
  }

  _bindEvents() {
    // Toggle on launcher click
    this.launcher.addEventListener('click', () => this.toggle());

    // Close button inside window
    this.window.querySelector('#cc-close-btn').addEventListener('click', () => this.close());

    // Pre-chat form "Iniciar chat" button
    const prechatStart = this.window.querySelector('#cc-prechat-start');
    if (prechatStart) {
      prechatStart.addEventListener('click', () => this._submitPrechat());
    }

    // Pre-chat: also allow Enter on last field
    const prechatPhone = this.window.querySelector('#cc-prechat-phone');
    if (prechatPhone) {
      prechatPhone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this._submitPrechat();
      });
    }

    // Send on button click
    this.sendBtn.addEventListener('click', () => this._submit());

    // Send on Enter (Shift+Enter = new line)
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._submit();
      }
    });

    // Enable/disable send + auto-resize
    this.inputEl.addEventListener('input', () => {
      const hasText = this.inputEl.value.trim().length > 0;
      this.sendBtn.disabled = !hasText || this.isThinking;
      autoResize(this.inputEl);
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
  }

  _submitPrechat() {
    const name  = (this.window.querySelector('#cc-prechat-name')?.value  || '').trim();
    const email = (this.window.querySelector('#cc-prechat-email')?.value || '').trim();
    const phone = (this.window.querySelector('#cc-prechat-phone')?.value || '').trim();

    this.contactInfo = { name: name || null, email: email || null, phone: phone || null };
    setContactInfo(this.cfg.apiKey, this.contactInfo);

    showChat(this.window);
    setTimeout(() => this.inputEl.focus(), 100);
  }

  async _submit() {
    const text = this.inputEl.value.trim();
    if (!text || this.isThinking) return;

    // Reset input
    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';
    this.sendBtn.disabled = true;

    // Show user message
    appendMessage(this.messagesEl, { role: 'user', content: text });

    // Show typing indicator
    this.isThinking = true;
    showTyping(this.messagesEl);

    try {
      const result = await sendMessage({
        apiKey:         this.cfg.apiKey,
        backendUrl:     this.cfg.backendUrl,
        message:        text,
        conversationId: this.conversationId,
        visitorId:      this.visitorId,
        contactName:    this.contactInfo.name  || undefined,
        contactEmail:   this.contactInfo.email || undefined,
        contactPhone:   this.contactInfo.phone || undefined,
      });

      // Persist conversation
      if (result.conversationId && result.conversationId !== this.conversationId) {
        this.conversationId = result.conversationId;
        setConversationId(this.cfg.apiKey, this.conversationId);
      }

      hideTyping();
      appendMessage(this.messagesEl, { role: 'agent', content: result.message });

      // If handed off to human, show notice
      if (result.handoffRequested) {
        appendMessage(this.messagesEl, {
          role: 'agent',
          content: '🙋 Un agente humano se unirá pronto a la conversación.',
        });
      }
    } catch (err) {
      hideTyping();
      appendMessage(this.messagesEl, {
        role: 'agent',
        content: this.cfg.errorMessage || 'Hubo un error al procesar tu mensaje. Por favor intenta de nuevo.',
        isError: true,
      });
    } finally {
      this.isThinking = false;
      this.sendBtn.disabled = this.inputEl.value.trim().length === 0;
      this.inputEl.focus();
    }
  }

  open() {
    this.isOpen = true;
    this.launcher.classList.add('cc-open');
    this.launcher.setAttribute('aria-label', 'Cerrar chat');
    this.window.classList.add('cc-visible');

    // Focus: pre-chat name field if visible, else input
    const prechatName = this.window.querySelector('#cc-prechat-name');
    const focusEl = prechatName && this.window.querySelector('#cc-prechat')?.style.display !== 'none'
      ? prechatName
      : this.inputEl;
    setTimeout(() => focusEl.focus(), 300);
  }

  close() {
    this.isOpen = false;
    this.launcher.classList.remove('cc-open');
    this.launcher.setAttribute('aria-label', 'Abrir chat');
    this.window.classList.remove('cc-visible');
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  destroy() {
    this.launcher.remove();
    this.window.remove();
    document.getElementById('cc-styles')?.remove();
  }
}

export { Widget };
