(() => {
    'use strict';

    const YOUTUBE_SITES = ['youtube.com', 'youtube-nocookie.com', 'music.youtube.com'];

    const DEFAULTS = {
        enabled: true,
        blockVisibilityEvents: true,
        keepAlive: true,
        keepAliveMethod: 'keyboard',
    };

    function getStorageApi() {
        if (typeof browser !== 'undefined') return browser;
        if (typeof chrome !== 'undefined') return chrome;
        return null;
    }

    function isYouTubeSite() {
        const hostname = window.location.hostname || '';
        return YOUTUBE_SITES.some((site) => hostname === site || hostname.endsWith(`.${site}`));
    }

    function setAttribute(name, value) {
        try {
            document.documentElement?.setAttribute(name, value);
        } catch {}
    }

    function applySettings(settings) {
        setAttribute('data-yt-bg-enabled', settings.enabled ? '1' : '0');
        setAttribute('data-yt-bg-block-events', settings.blockVisibilityEvents ? '1' : '0');
        setAttribute('data-yt-bg-keepalive', settings.keepAlive ? '1' : '0');
        setAttribute('data-yt-bg-method', settings.keepAliveMethod);
    }

    async function loadSettings() {
        const api = getStorageApi();
        if (!api?.storage?.local) return DEFAULTS;

        try {
            const keys = Object.keys(DEFAULTS);
            const result = await new Promise((resolve) => {
                api.storage.local.get(keys, (data) => resolve(data || {}));
            });

            return {
                enabled: result.enabled !== false,
                blockVisibilityEvents: result.blockVisibilityEvents !== false,
                keepAlive: result.keepAlive !== false,
                keepAliveMethod: result.keepAliveMethod || 'keyboard',
            };
        } catch {
            return DEFAULTS;
        }
    }

    function injectMainWorldScript() {
        const script = document.createElement('script');
        script.textContent = `
(function() {
  'use strict';

  function getAttr(name) {
    return document.documentElement.getAttribute(name);
  }

  function isEnabled() {
    return getAttr('data-yt-bg-enabled') === '1';
  }

  function shouldBlockEvents() {
    return getAttr('data-yt-bg-block-events') === '1';
  }

  function shouldKeepAlive() {
    return getAttr('data-yt-bg-keepalive') === '1';
  }

  function getMethod() {
    return getAttr('data-yt-bg-method') || 'keyboard';
  }

  function blockVisibilityEvents() {
    const events = [
      'visibilitychange',
      'webkitvisibilitychange',
      'blur',
      'pagehide'
    ];

    events.forEach(eventName => {
      window.addEventListener(eventName, event => {
        if (isEnabled() && shouldBlockEvents()) {
          event.stopImmediatePropagation();
        }
      }, true);
    });
  }

  function spoofVisibilityProperties() {
    Object.defineProperty(document, 'hidden', {
      get: () => isEnabled() ? false : 
        Object.getOwnPropertyDescriptor(Document.prototype, 'hidden')
          ?.get?.call(document) ?? false,
      configurable: true
    });

    Object.defineProperty(document, 'webkitHidden', {
      get: () => isEnabled() ? false : 
        Object.getOwnPropertyDescriptor(Document.prototype, 'webkitHidden')
          ?.get?.call(document) ?? false,
      configurable: true
    });

    Object.defineProperty(document, 'visibilityState', {
      get: () => isEnabled() ? 'visible' : 
        Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')
          ?.get?.call(document) ?? 'visible',
      configurable: true
    });

    Object.defineProperty(document, 'webkitVisibilityState', {
      get: () => isEnabled() ? 'visible' : 
        Object.getOwnPropertyDescriptor(
          Document.prototype, 
          'webkitVisibilityState'
        )?.get?.call(document) ?? 'visible',
      configurable: true
    });
  }

  function simulateKeyboard() {
    const video = document.querySelector('video');
    if (!video) return;

    const event = new KeyboardEvent('keydown', {
      key: 'Shift',
      code: 'ShiftLeft',
      keyCode: 16,
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(event);
  }

  function simulateMouse() {
    const video = document.querySelector('video');
    if (!video) return;

    const rect = video.getBoundingClientRect();
    const event = new MouseEvent('mousemove', {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      bubbles: true,
      cancelable: true
    });
    video.dispatchEvent(event);
  }

  function startKeepAlive() {
    let useKeyboard = true;

    setInterval(() => {
      if (!isEnabled() || !shouldKeepAlive()) return;

      const method = getMethod();

      if (method === 'keyboard') {
        simulateKeyboard();
      } else if (method === 'mouse') {
        simulateMouse();
      } else if (method === 'alternate') {
        if (useKeyboard) {
          simulateKeyboard();
        } else {
          simulateMouse();
        }
        useKeyboard = !useKeyboard;
      }
    }, 30000);
  }

  function maintainPlayback() {
    const observer = new MutationObserver(() => {
      if (!isEnabled()) return;

      const video = document.querySelector('video');
      if (!video) return;

      if (video.paused && video.readyState >= 2) {
        video.play().catch(() => {});
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setInterval(() => {
      if (!isEnabled()) return;

      const video = document.querySelector('video');
      if (!video) return;

      if (video.paused && video.readyState >= 2) {
        video.play().catch(() => {});
      }
    }, 1000);
  }

  blockVisibilityEvents();
  spoofVisibilityProperties();
  startKeepAlive();
  maintainPlayback();
})();
`;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
    }

    async function initialize() {
        if (!isYouTubeSite()) return;

        const settings = await loadSettings();
        applySettings(settings);

        setAttribute('data-yt-bg-loaded', '1');
        setAttribute('data-yt-bg-loaded-at', String(Date.now()));

        injectMainWorldScript();

        const api = getStorageApi();
        if (api?.storage?.onChanged) {
            api.storage.onChanged.addListener((changes, area) => {
                if (area !== 'local') return;

                const updated = { ...settings };
                if (changes.enabled) {
                    updated.enabled = changes.enabled.newValue !== false;
                }
                if (changes.blockVisibilityEvents) {
                    updated.blockVisibilityEvents =
                        changes.blockVisibilityEvents.newValue !== false;
                }
                if (changes.keepAlive) {
                    updated.keepAlive = changes.keepAlive.newValue !== false;
                }
                if (changes.keepAliveMethod) {
                    updated.keepAliveMethod = changes.keepAliveMethod.newValue;
                }

                applySettings(updated);
            });
        }
    }

    initialize();
})();
