(() => {
  'use strict';

  const CSS_RULES = [
    '#offer-module',
    '#promotion-shelf',
    '#masthead-ad',
    'ytd-ad-slot-renderer',
    'ytd-rich-item-renderer:has(ytd-ad-slot-renderer)',
    'ytd-search-pyv-renderer',
    '.ytd-merch-shelf-renderer',
    '.ytp-suggested-action-badge',
    '#shorts-inner-container .ytd-shorts:has(ytd-ad-slot-renderer)',
    '.ytReelMetapanelViewModelHost .ytShortsSuggestedActionViewModelStaticHost',
    '.ytp-ad-module',
    '.ytp-ad-overlay-container',
    '.ytp-ad-text-overlay',
    '.video-ads',
    '#player-ads',
    '.ytd-banner-promo-renderer',
    'ytd-in-feed-ad-layout-renderer',
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
    'ytmusic-mealbar-promo-renderer',
    '.ytmusic-mealbar-promo-renderer'
  ];

  const YOUTUBE_DOMAINS = [
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'youtube-nocookie.com',
    'www.youtube-nocookie.com'
  ];

  const SCRIPTLET_TARGETS = [
    'ytInitialPlayerResponse.adPlacements',
    'ytInitialPlayerResponse.adSlots',
    'ytInitialPlayerResponse.playerAds',
    'playerResponse.adPlacements',
    'playerResponse.adSlots',
    'playerResponse.playerAds'
  ];

  const isYouTubeDomain = () => {
    const host = location.hostname;
    return YOUTUBE_DOMAINS.some(d => host === d || host.endsWith('.' + d));
  };

  const isEmbed = () => /\/embed\//.test(location.pathname);

  const injectStyles = () => {
    const style = document.createElement('style');
    style.id = 'yt-adblock-styles';
    style.textContent = CSS_RULES.map(s => `${s}{display:none!important}`).join('');
    (document.head || document.documentElement).appendChild(style);
  };

  const pruneAdProperties = obj => {
    if (!obj || typeof obj !== 'object') return obj;
    const adKeys = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams'];
    
    const prune = target => {
      if (!target || typeof target !== 'object') return;
      adKeys.forEach(key => { if (key in target) delete target[key]; });
    };

    prune(obj);
    prune(obj.playerResponse);
    prune(obj.contents);
    
    return obj;
  };

  const interceptJSON = () => {
    const originalParse = JSON.parse;
    JSON.parse = function(text, reviver) {
      const result = originalParse.call(this, text, reviver);
      return pruneAdProperties(result);
    };
  };

  const interceptFetch = () => {
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const response = await originalFetch.apply(this, args);
      const url = String(args[0]?.url || args[0] || '');
      
      if (!/player|watch|playlist|browse/.test(url)) return response;
      
      const clone = response.clone();
      return new Proxy(response, {
        get(target, prop) {
          if (prop === 'json') {
            return async () => pruneAdProperties(await clone.json());
          }
          const value = target[prop];
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
    };
  };

  const interceptXHR = () => {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this._adblockUrl = url;
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function(...args) {
      if (/player|watch|playlist|browse/.test(this._adblockUrl || '')) {
        this.addEventListener('readystatechange', function() {
          if (this.readyState === 4) {
            try {
              const data = pruneAdProperties(JSON.parse(this.responseText));
              Object.defineProperty(this, 'responseText', { value: JSON.stringify(data) });
              Object.defineProperty(this, 'response', { value: JSON.stringify(data) });
            } catch {}
          }
        });
      }
      return originalSend.apply(this, args);
    };
  };

  const setConstant = (path, value) => {
    const parts = path.split('.');
    const last = parts.pop();
    
    const define = () => {
      let obj = window;
      for (const part of parts) {
        if (!(part in obj)) obj[part] = {};
        obj = obj[part];
        if (!obj) return;
      }
      try {
        Object.defineProperty(obj, last, {
          get: () => value === 'undefined' ? undefined : value,
          set: () => {},
          configurable: false
        });
      } catch {}
    };
    
    define();
    setTimeout(define, 0);
    setTimeout(define, 100);
  };

  const applyScriptlets = () => {
    SCRIPTLET_TARGETS.forEach(target => setConstant(target, 'undefined'));
    setConstant('google_ad_status', 1);
  };

  const skipAds = () => {
    const video = document.querySelector('video');
    if (!video) return;

    const skipBtn = document.querySelector(
      '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, ' +
      '[class*="skip-button"], .ytp-ad-skip-button-slot'
    );
    
    const adOverlay = document.querySelector(
      '.ytp-ad-player-overlay, .ad-showing, .ytp-ad-persistent-progress-bar-container'
    );
    
    const adText = document.querySelector('.ytp-ad-text, .ytp-ad-preview-container');
    
    if (skipBtn) {
      skipBtn.click();
      return;
    }
    
    if (adOverlay || adText || document.querySelector('.ad-interrupting')) {
      if (video.duration && video.currentTime < video.duration) {
        video.currentTime = video.duration;
      }
      video.playbackRate = 16;
    }
  };

  const removeAdElements = () => {
    const selector = CSS_RULES.join(',');
    document.querySelectorAll(selector).forEach(el => {
      el.style.display = 'none';
      el.remove();
    });
    
    document.querySelectorAll('.ad-showing').forEach(el => {
      el.classList.remove('ad-showing');
    });
  };

  const handleEmbedAds = () => {
    if (!isEmbed()) return;
    
    const params = new URLSearchParams(location.search);
    if (params.get('autoplay') === '1') {
      const video = document.querySelector('video');
      if (video) video.play().catch(() => {});
    }
  };

  const observeDOM = () => {
    let timeout;
    const observer = new MutationObserver(() => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        skipAds();
        removeAdElements();
        handleEmbedAds();
      }, 50);
    });
    
    const target = document.body || document.documentElement;
    observer.observe(target, { childList: true, subtree: true });
  };

  const init = () => {
    if (!isYouTubeDomain()) return;
    
    interceptJSON();
    interceptFetch();
    interceptXHR();
    applyScriptlets();
    
    const onReady = () => {
      injectStyles();
      observeDOM();
      skipAds();
      removeAdElements();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onReady);
    } else {
      onReady();
    }

    document.addEventListener('yt-navigate-finish', () => {
      skipAds();
      removeAdElements();
    });

    document.addEventListener('yt-page-data-updated', () => {
      skipAds();
      removeAdElements();
    });

    setInterval(skipAds, 500);
  };

  init();
})();
