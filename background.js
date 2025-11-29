(() => {
  'use strict';

  const api = typeof browser !== 'undefined' ? browser : chrome;

  const BLOCK_PATTERNS = [
    '*://*.youtube.com/pagead/*',
    '*://*.youtube.com/youtubei/v1/player/ad_break*',
    '*://*.youtube.com/get_midroll_*',
    '*://*.youtube-nocookie.com/pagead/*',
    '*://*.youtube-nocookie.com/youtubei/v1/player/ad_break*',
    '*://*.googlesyndication.com/*',
    '*://googleads.g.doubleclick.net/*',
    '*://*.doubleclick.net/*',
    '*://*.doubleclick.com/*',
    '*://*.google.com/pagead/*',
    '*://*.youtube.com/api/stats/ads*',
    '*://*.youtube.com/ptracking*',
    '*://*.youtube.com/pagead/interaction/*',
    '*://*.youtube.com/error_204*',
    '*://*.youtube.com/get_video_info*adunit*',
    '*://*.youtube.com/generate_204*ad*'
  ];

  const RESOURCE_TYPES = [
    'script',
    'xmlhttprequest',
    'image',
    'sub_frame',
    'media',
    'object',
    'ping',
    'beacon'
  ];

  const blockRequest = () => ({ cancel: true });

  try {
    api.webRequest.onBeforeRequest.addListener(
      blockRequest,
      { urls: BLOCK_PATTERNS, types: RESOURCE_TYPES },
      ['blocking']
    );

    api.webRequest.onBeforeRequest.addListener(
      (details) => {
        const url = details.url;
        if (url.includes('googlevideo.com') && url.includes('&oad=')) {
          return { cancel: true };
        }
        if (url.includes('adunit') || url.includes('/pagead/')) {
          return { cancel: true };
        }
        return {};
      },
      { urls: ['*://*.googlevideo.com/*'], types: ['xmlhttprequest', 'media'] },
      ['blocking']
    );
  } catch (e) {
    console.error('YouTube LevelUp: Failed to register webRequest listeners', e);
  }
})();
