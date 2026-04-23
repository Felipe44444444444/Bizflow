import { Widget } from './widget.js';

let instance = null;

const ConectachatWidget = {
  /**
   * Initialize the widget.
   * @param {Object} config
   * @param {string} config.apiKey           — Required. cc_... API key
   * @param {string} [config.backendUrl]     — Backend URL (default: http://localhost:3000)
   * @param {string} [config.position]       — 'bottom-right' | 'bottom-left' (default: 'bottom-right')
   * @param {string} [config.primaryColor]   — Hex color (default: '#6366f1')
   * @param {string} [config.borderRadius]   — CSS value (default: '16px')
   * @param {string} [config.agentName]      — Agent display name
   * @param {string} [config.agentAvatar]    — Emoji or image URL
   * @param {string} [config.welcomeMessage] — Greeting message
   * @param {string} [config.placeholder]    — Input placeholder
   * @param {string} [config.errorMessage]   — Custom error message
   * @param {boolean}[config.openOnLoad]     — Auto-open on page load
   */
  init(config = {}) {
    if (!config.apiKey) {
      console.error('[Conectachat] apiKey is required');
      return;
    }

    if (instance) instance.destroy();

    // Wait for DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        instance = new Widget(config);
        if (config.openOnLoad) instance.open();
      });
    } else {
      instance = new Widget(config);
      if (config.openOnLoad) instance.open();
    }
  },

  open()    { instance?.open(); },
  close()   { instance?.close(); },
  toggle()  { instance?.toggle(); },
  destroy() { instance?.destroy(); instance = null; },
};

export { ConectachatWidget };
export default ConectachatWidget;
