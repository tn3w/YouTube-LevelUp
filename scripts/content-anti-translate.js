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

    const state = { videoId: null, audioTrack: null };

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
        const defaults = { isOriginal: false, isDubbed: false };
        if (!track?.id || typeof track.id !== 'string') return defaults;
        const parts = track.id.split(';');
        if (parts.length < 2) return defaults;
        try {
            const decoded = atob(parts[1]);
            return {
                isOriginal: decoded.includes('original'),
                isDubbed: decoded.includes('dubbed'),
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
            if (i < arr.length - 1) container.appendChild(document.createElement('br'));
        });
        state.videoId = videoId;
    };

    const update = () => {
        if (!/\/watch/.test(location.pathname)) return;
        untranslateAudio();
        untranslateDescription();
    };

    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(update, 1000);
    update();
})();
