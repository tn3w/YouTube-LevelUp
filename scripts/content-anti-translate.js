(() => {
    'use strict';

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

    const cache = new Map();
    const state = { videoId: null, audioTrack: null, titleCache: {} };

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

    const getTrackInfo = (track) => {
        const defaults = { isOriginal: false, isDubbed: false, isAI: false };
        if (!track?.id || typeof track.id !== 'string') return defaults;
        const parts = track.id.split(';');
        if (parts.length < 2) return defaults;
        try {
            const decoded = atob(parts[1]);
            const isAI = decoded.includes('dubbed-auto');
            return {
                isOriginal: decoded.includes('original'),
                isDubbed: decoded.includes('dubbed') || isAI,
                isAI,
            };
        } catch {
            return defaults;
        }
    };

    const isOriginalTrack = (track, langField) => {
        if (!track) return false;
        if (langField && track[langField]?.name) {
            const name = track[langField].name.toLowerCase();
            for (const kw of ORIGINAL_KEYWORDS) {
                if (name.includes(kw.toLowerCase())) return true;
            }
        }
        return getTrackInfo(track).isOriginal;
    };

    const getOriginalTrack = (tracks) => {
        if (!Array.isArray(tracks)) return null;
        let langField = null;
        for (const track of tracks) {
            if (!track || typeof track !== 'object') continue;
            for (const [key, val] of Object.entries(track)) {
                if (val && typeof val === 'object' && val.name) {
                    langField = key;
                    break;
                }
            }
            if (langField) break;
        }
        if (!langField) return null;
        for (const track of tracks) {
            if (isOriginalTrack(track, langField)) return track;
        }
        return null;
    };

    const fetchTitle = async (videoId) => {
        const cacheKey = `title_${videoId}`;
        if (cache.has(cacheKey)) return cache.get(cacheKey);

        const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}`;
        try {
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            const title = data.title || null;
            cache.set(cacheKey, title);
            return title;
        } catch {
            return null;
        }
    };

    const normalizeText = (text) => {
        if (!text) return '';
        return text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
    };

    const textsEqual = (a, b) => normalizeText(a) === normalizeText(b);

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
        if (state.audioTrack === key) return;

        const original = getOriginalTrack(tracks);
        if (!original) return;

        if (original.id === current.id) {
            state.audioTrack = key;
            return;
        }

        const success = await player.setAudioTrack(original);
        if (success) {
            state.audioTrack = `${videoId}+${original.id}`;
        }
    };

    const untranslateDescription = () => {
        const player = getPlayer();
        if (!player || typeof player.getPlayerResponse !== 'function') return;

        const response = player.getPlayerResponse();
        const original = response?.videoDetails?.shortDescription;
        if (!original) return;

        const videoId = new URL(location.href).searchParams.get('v');
        if (state.videoId === videoId) return;

        const desktopSel =
            '#description-inline-expander yt-attributed-string, ' +
            '#description-inline-expander .yt-core-attributed-string, ' +
            'ytd-expander#description yt-formatted-string';
        const mobileSel =
            '.expandable-video-description-body-main, ' + '.expandable-video-description-container';
        const container = document.querySelector(isMobile() ? mobileSel : desktopSel);
        if (!container) return;

        const currentText = container.textContent?.trim();
        const firstLine = original.split('\n')[0].trim();
        if (currentText?.startsWith(firstLine)) {
            state.videoId = videoId;
            return;
        }

        container.textContent = '';
        original.split('\n').forEach((line, i, arr) => {
            container.appendChild(document.createTextNode(line));
            if (i < arr.length - 1) {
                container.appendChild(document.createElement('br'));
            }
        });
        state.videoId = videoId;
    };

    const untranslateCurrentVideo = async () => {
        if (!location.pathname.startsWith('/watch')) return;

        const videoId = new URL(location.href).searchParams.get('v');
        if (!videoId) return;

        const selector = isMobile()
            ? 'ytm-video-description-header-renderer .title > span.yt-core-attributed-string'
            : '#title > h1 > yt-formatted-string, .slim-video-information-title .yt-core-attributed-string';

        const titleElement = document.querySelector(selector);
        if (!titleElement) return;

        const currentTitle = titleElement.textContent?.trim();
        if (!currentTitle) return;

        const cacheKey = `${videoId}_${currentTitle}`;
        if (state.titleCache[cacheKey]) return;

        const originalTitle = await fetchTitle(videoId);
        if (!originalTitle) return;

        if (textsEqual(originalTitle, currentTitle)) {
            state.titleCache[cacheKey] = true;
            return;
        }

        titleElement.textContent = originalTitle;
        state.titleCache[cacheKey] = true;

        if (document.title.includes(currentTitle)) {
            document.title = document.title.replace(currentTitle, originalTitle);
        }
    };

    const untranslateVideoList = async () => {
        const selector = isMobile()
            ? 'ytm-compact-video-renderer, ytm-rich-item-renderer, ytm-video-with-context-renderer'
            : 'ytd-video-renderer, ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer';

        const videos = document.querySelectorAll(selector);

        for (const video of videos) {
            if (video.dataset.untranslated) continue;

            const linkSelector = isMobile()
                ? 'a.media-item-thumbnail-container, a'
                : 'a#video-title-link, a#thumbnail';
            const titleSelector = isMobile()
                ? '.video-card-title .yt-core-attributed-string, .compact-media-item-headline .yt-core-attributed-string'
                : '#video-title';

            const link = video.querySelector(linkSelector);
            const titleElement = video.querySelector(titleSelector);

            if (!link || !titleElement) continue;

            const href = link.href;
            if (!href || !href.includes('/watch?v=')) continue;

            const videoId = new URL(href).searchParams.get('v');
            if (!videoId) continue;

            const currentTitle = titleElement.textContent?.trim();
            if (!currentTitle) continue;

            const originalTitle = await fetchTitle(videoId);
            if (!originalTitle) continue;

            if (textsEqual(originalTitle, currentTitle)) {
                video.dataset.untranslated = 'true';
                continue;
            }

            titleElement.textContent = originalTitle;
            if (titleElement.title) titleElement.title = originalTitle;
            if (link.title) link.title = originalTitle;

            video.dataset.untranslated = 'true';
        }
    };

    const update = () => {
        if (location.pathname.startsWith('/watch')) {
            untranslateAudio();
            untranslateDescription();
            untranslateCurrentVideo();
        }
        untranslateVideoList();
    };

    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(update, 1000);
    update();
})();
