(() => {
    'use strict';

    const normalize = (text) => {
        if (!text) return '';
        return text
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .replace(/[\p{Emoji}]/gu, '')
            .trim()
            .toLowerCase();
    };

    const cache = new Map();
    const processed = new Set();
    const state = { videoId: null, audioId: null };

    const ORIGINAL_KEYWORDS = [
        'original',
        'оригинал',
        'オリジナル',
        '原始',
        '원본',
        'origineel',
        'originale',
        'oryginał',
        'původní',
        'αρχικό',
        'orijinal',
        '原創',
        'gốc',
        'asli',
        'מקורי',
        'أصلي',
        'मूल',
        'मूळ',
        'ਪ੍ਰਮਾਣਿਕ',
        'అసలు',
        'மூலம்',
        'মূল',
        'അസലി',
        'ต้นฉบับ',
    ];

    const isMobile = () => location.hostname === 'm.youtube.com';

    const getPlayer = () => {
        if (isMobile()) return document.querySelector('#player-container-id');
        if (location.pathname.startsWith('/shorts')) {
            return document.querySelector('#shorts-player');
        }
        if (location.pathname.startsWith('/embed')) {
            return document.querySelector('#movie_player');
        }
        return document.querySelector('ytd-player .html5-video-player');
    };

    const getVideoId = () => new URLSearchParams(location.search).get('v');

    const fetchTitle = async (videoId) => {
        if (cache.has(videoId)) return cache.get(videoId);
        try {
            const response = await fetch(
                `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}`
            );
            if (!response.ok) return null;
            const data = await response.json();
            const title = data.title || null;
            if (title) cache.set(videoId, title);
            return title;
        } catch {
            return null;
        }
    };

    const getOriginal = (tracks) => {
        if (!Array.isArray(tracks)) return null;

        let displayField = null;
        for (const track of tracks) {
            if (!track || typeof track !== 'object') continue;
            for (const [key, value] of Object.entries(track)) {
                if (value && typeof value === 'object' && value.name) {
                    displayField = key;
                    break;
                }
            }
            if (displayField) break;
        }

        const isOriginalTrack = (track) => {
            if (!track) return false;

            if (displayField && track[displayField]?.name) {
                const name = track[displayField].name.toLowerCase();
                if (ORIGINAL_KEYWORDS.some((keyword) => name.includes(keyword))) {
                    return true;
                }
            }

            if (!track.id || typeof track.id !== 'string') return false;
            const parts = track.id.split(';');
            if (parts.length < 2) return false;
            try {
                return atob(parts[1]).includes('original');
            } catch {
                return false;
            }
        };

        return tracks.find((track) => isOriginalTrack(track));
    };

    const untranslateAudio = async () => {
        const player = getPlayer();
        if (
            !player ||
            typeof player.getPlayerResponse !== 'function' ||
            typeof player.getAvailableAudioTracks !== 'function' ||
            typeof player.getAudioTrack !== 'function' ||
            typeof player.setAudioTrack !== 'function'
        )
            return;

        const response = player.getPlayerResponse();
        const tracks = await player.getAvailableAudioTracks();
        const current = await player.getAudioTrack();
        if (!response || !tracks || !current) return;

        const videoId = response.videoDetails?.videoId;
        if (!videoId) return;

        const key = `${videoId}+${current.id}`;
        if (state.audioId === key) return;

        const original = getOriginal(tracks);
        if (!original || original.id === current.id) {
            state.audioId = key;
            return;
        }

        const success = await player.setAudioTrack(original);
        if (success) state.audioId = `${videoId}+${original.id}`;
    };

    const untranslateDescription = () => {
        const player = getPlayer();
        if (!player || typeof player.getPlayerResponse !== 'function') return;

        const response = player.getPlayerResponse();
        const original = response?.videoDetails?.shortDescription;
        if (!original) return;

        const videoId = getVideoId();
        if (!videoId || state.videoId === videoId) return;

        const parentSel = isMobile()
            ? 'ytm-expandable-video-description-body-renderer'
            : '#description-inline-expander';
        const containerSel = isMobile() ? '#collapsed-string' : '#attributed-snippet-text';

        const parent = document.querySelector(parentSel);
        if (!parent) return;

        const container = parent.querySelector(containerSel);
        if (!container) return;

        const current = container.textContent?.trim();
        const first = original.split('\n')[0].trim();
        if (current?.startsWith(first)) {
            state.videoId = videoId;
            return;
        }

        const span = document.createElement('span');
        span.className =
            'yt-core-attributed-string yt-core-attributed-string--white-space-pre-wrap';
        span.dir = 'auto';

        const inner = document.createElement('span');
        inner.className = 'yt-core-attributed-string--link-inherit-color';
        inner.dir = 'auto';

        original.split('\n').forEach((line, i, arr) => {
            inner.appendChild(document.createTextNode(line));
            if (i < arr.length - 1) {
                inner.appendChild(document.createElement('br'));
            }
        });

        span.appendChild(inner);
        container.textContent = '';
        container.appendChild(span);
        state.videoId = videoId;
    };

    const untranslateMainTitle = async () => {
        if (!location.pathname.startsWith('/watch')) return;

        const videoId = getVideoId();
        if (!videoId) return;

        const selector = isMobile()
            ? 'h2.slim-video-information-title span.yt-core-attributed-string'
            : 'h1.ytd-watch-metadata > yt-formatted-string';

        const element = document.querySelector(selector);
        if (!element) return;

        const current = element.textContent?.trim();
        if (!current) return;

        const key = `${videoId}_${current}`;
        if (processed.has(key)) return;

        const original = await fetchTitle(videoId);
        if (!original) return;

        if (normalize(original) === normalize(current)) {
            processed.add(key);
            return;
        }

        element.textContent = original;
        element.removeAttribute('is-empty');

        const expectedTitle = `${original} - YouTube`;
        if (document.title !== expectedTitle) {
            document.title = expectedTitle;
        }

        processed.add(key);
    };

    const untranslateVideoList = async () => {
        const sel = isMobile()
            ? 'ytm-video-with-context-renderer, ytm-video-card-renderer'
            : 'ytd-video-renderer, ytd-rich-item-renderer, ' +
              'ytd-compact-video-renderer, ytd-grid-video-renderer';

        const videos = document.querySelectorAll(sel);

        for (const video of videos) {
            const titleSel = isMobile()
                ? 'h3.media-item-headline > span.yt-core-attributed-string, ' +
                  'h4.video-card-title > span.yt-core-attributed-string'
                : '#video-title';

            const titleEl = video.querySelector(titleSel);
            if (!titleEl) continue;

            const link = titleEl.closest('a');
            if (!link) continue;

            const href = link.href;
            if (!href || !href.includes('/watch?v=')) continue;

            if (href.includes('list=') && !href.includes('&index=')) {
                titleEl.removeAttribute('ynt');
                titleEl.removeAttribute('ynt-original');
                titleEl.removeAttribute('ynt-fail');
                continue;
            }

            const videoId = new URL(href).searchParams.get('v');
            if (!videoId) continue;

            if (titleEl.getAttribute('ynt') === videoId) continue;
            if (titleEl.getAttribute('ynt-original') === videoId) continue;

            const current = titleEl.textContent?.trim();
            if (!current) continue;

            const original = await fetchTitle(videoId);
            if (!original) {
                titleEl.removeAttribute('ynt');
                titleEl.removeAttribute('ynt-original');
                titleEl.setAttribute('ynt-fail', videoId);
                continue;
            }

            if (normalize(original) === normalize(current)) {
                titleEl.removeAttribute('ynt');
                titleEl.removeAttribute('ynt-fail');
                titleEl.setAttribute('ynt-original', videoId);
                continue;
            }

            titleEl.textContent = original;
            if (titleEl.title) titleEl.title = original;
            if (link.title) link.title = original;
            titleEl.removeAttribute('ynt-original');
            titleEl.removeAttribute('ynt-fail');
            titleEl.setAttribute('ynt', videoId);
        }
    };

    const matchLang = (code1, code2) => {
        if (!code1 || !code2) return false;
        return code1.split('-')[0] === code2.split('-')[0];
    };

    const untranslateSubtitles = () => {
        const player = getPlayer();
        if (!player || typeof player.getPlayerResponse !== 'function') return;

        try {
            const response = player.getPlayerResponse();
            const tracks = response.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (!tracks) return;

            const asrTrack = tracks.find((track) => track.kind === 'asr');
            if (!asrTrack) return;

            const original = tracks.find(
                (track) => matchLang(track.languageCode, asrTrack.languageCode) && !track.kind
            );

            if (original && typeof player.setOption === 'function') {
                player.setOption('captions', 'track', original);
            }
        } catch {}
    };

    const removeSyncLabel = () => {
        const labels = document.querySelectorAll(
            '.ytp-caption-window-rollup, ' + '.caption-window .ytp-caption-segment[style*="italic"]'
        );
        labels.forEach((label) => {
            const text = label.textContent?.trim().toLowerCase();
            if (
                text &&
                (text.includes('automatically') ||
                    text.includes('synchronized') ||
                    text.includes('auto-generated') ||
                    text.includes('自動'))
            ) {
                label.remove();
            }
        });
    };

    const update = () => {
        if (location.pathname.startsWith('/watch')) {
            untranslateAudio();
            untranslateDescription();
            untranslateMainTitle();
            untranslateSubtitles();
            removeSyncLabel();
        }
        untranslateVideoList();
    };

    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(update, 1500);
    update();
})();
