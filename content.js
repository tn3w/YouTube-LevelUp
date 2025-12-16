(() => {
    'use strict';

    const state = {
        cache: { dislikes: {}, sponsors: {} },
        current: {
            videoId: null,
            segments: [],
            processing: { dislikes: false, sponsors: false },
        },
        lastActivity: Date.now(),
        antiTranslate: { videoId: null, audioTrack: null },
    };

    try {
        state.cache.dislikes = JSON.parse(localStorage.ytdb_cache || '{}');
        state.cache.sponsors = JSON.parse(localStorage.sponsorblock_cache || '{}');
    } catch {}

    const isMobile = () => location.hostname === 'm.youtube.com';
    const isMusic = () => location.hostname === 'music.youtube.com';
    const isWatchPage = () => /\/watch/.test(location.pathname);

    const getVideoId = () => {
        const url = new URL(location.href);
        if (url.pathname.startsWith('/clip')) {
            const meta = document.querySelector(
                "meta[itemprop='videoId'], meta[itemprop='identifier']"
            );
            return meta?.content;
        }
        return url.searchParams.get('v');
    };

    const dislikes = {
        getButtons: () => {
            if (isMobile()) {
                return (
                    document.querySelector('.slim-video-action-bar-actions .segmented-buttons') ||
                    document.querySelector('.slim-video-action-bar-actions')
                );
            }
            return (
                document.querySelector('#top-level-buttons-computed') ||
                document.querySelector('ytd-menu-renderer.ytd-watch-metadata > div')
            );
        },

        getDislikeButton: () => {
            const btns = dislikes.getButtons();
            if (!btns) return null;

            const isSegmented =
                btns.children[0]?.tagName === 'YTD-SEGMENTED-LIKE-DISLIKE-BUTTON-RENDERER';

            if (isSegmented) {
                return (
                    document.querySelector('#segmented-dislike-button') ||
                    btns.children[0].children[1]
                );
            }

            if (btns.querySelector('segmented-like-dislike-button-view-model')) {
                return btns.querySelector('dislike-button-view-model');
            }

            return btns.children[1];
        },

        getTextElement: (btn) => {
            if (!btn) return null;

            let text = btn.querySelector(
                '#text, yt-formatted-string, ' + '.button-renderer-text, span[role="text"]'
            );

            if (!text) {
                text = document.createElement('span');
                text.id = 'text';
                text.style.marginLeft = '6px';
                const button = btn.querySelector('button');
                if (button) {
                    button.appendChild(text);
                    button.style.width = 'auto';
                }
            }
            return text;
        },

        show: (count) => {
            const btn = dislikes.getDislikeButton();
            const text = dislikes.getTextElement(btn);
            if (text) {
                const formatter = new Intl.NumberFormat('en', {
                    notation: 'compact',
                    compactDisplay: 'short',
                });
                text.textContent = formatter.format(count);
                text.removeAttribute('is-empty');
            }
        },

        fetch: async (id) => {
            if (state.current.processing.dislikes || !id || state.cache.dislikes[id]) {
                return;
            }

            state.current.processing.dislikes = true;

            try {
                const url = 'https://returnyoutubedislikeapi.com/votes?videoId=';
                const res = await fetch(url + id, {
                    signal: AbortSignal.timeout(5000),
                });
                const data = await res.json();

                if (data?.dislikes) {
                    state.cache.dislikes[id] = data.dislikes;
                    localStorage.ytdb_cache = JSON.stringify(state.cache.dislikes);
                    dislikes.show(data.dislikes);
                }
            } catch {}

            state.current.processing.dislikes = false;
        },

        update: (id) => {
            if (state.cache.dislikes[id]) {
                dislikes.show(state.cache.dislikes[id]);
            } else if (dislikes.getButtons() && dislikes.getDislikeButton()) {
                dislikes.fetch(id);
            }
        },
    };

    const sponsors = {
        hashVideoId: async (id) => {
            const encoder = new TextEncoder();
            const data = encoder.encode(id);
            const buffer = await crypto.subtle.digest('SHA-256', data);
            const bytes = Array.from(new Uint8Array(buffer));
            return bytes
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('')
                .slice(0, 4);
        },

        fetch: async (id) => {
            if (state.current.processing.sponsors || !id || state.cache.sponsors[id]) {
                return;
            }

            state.current.processing.sponsors = true;

            try {
                const hash = await sponsors.hashVideoId(id);
                const url =
                    'https://sponsor.ajay.app/api/skipSegments/' +
                    hash +
                    '?categories=["sponsor","selfpromo"]' +
                    '&actionTypes=["skip"]';

                const res = await fetch(url, {
                    signal: AbortSignal.timeout(5000),
                });

                if (res.ok) {
                    const data = await res.json();
                    const video = data.find((v) => v.videoID === id);
                    const filtered =
                        video?.segments?.filter(
                            (s) =>
                                (s.category === 'sponsor' || s.category === 'selfpromo') &&
                                s.actionType === 'skip'
                        ) || [];

                    state.cache.sponsors[id] = filtered;
                    localStorage.sponsorblock_cache = JSON.stringify(state.cache.sponsors);
                    state.current.segments = filtered;
                }
            } catch {}

            state.current.processing.sponsors = false;
        },

        skip: () => {
            const video = document.querySelector('video');
            if (!video || !state.current.segments.length || video.ended) return;

            const { currentTime, duration } = video;

            for (const segment of state.current.segments) {
                const [start, end] = segment.segment;
                if (currentTime >= start - 0.003 && currentTime < end) {
                    const skipTo = duration > 1 && end >= duration - 0.5 ? duration - 0.001 : end;
                    video.currentTime = skipTo;
                    break;
                }
            }
        },

        update: (id) => {
            state.current.segments = state.cache.sponsors[id] || [];
            if (!state.cache.sponsors[id]) {
                sponsors.fetch(id);
            }
        },
    };

    const continueWatching = {
        init: () => {
            const popupSelector = isMusic() ? 'ytmusic-popup-container' : 'ytd-popup-container';

            const popupEventType = isMusic()
                ? 'YTMUSIC-YOU-THERE-RENDERER'
                : 'YT-CONFIRM-DIALOG-RENDERER';

            const trackActivity = () => {
                state.lastActivity = Date.now();
            };

            ['mousedown', 'keydown'].forEach((event) => {
                document.addEventListener(event, trackActivity, { passive: true });
            });

            document.addEventListener('yt-popup-opened', (event) => {
                const isTargetPopup = event.detail?.nodeName === popupEventType;
                const isIdle = Date.now() - state.lastActivity > 3000;

                if (isTargetPopup && isIdle) {
                    document.querySelector(popupSelector)?.click();
                }
            });

            const observer = new MutationObserver(() => {
                const video = document.querySelector('video');
                if (video && !video._ynsOverridden) {
                    video._ynsOverridden = video.pause;
                    video.pause = () => {
                        const isActive = Date.now() - state.lastActivity < 3000;
                        return isActive && video._ynsOverridden();
                    };
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
            });
        },
    };

    const antiTranslate = {
        ORIGINAL_KEYWORDS: [
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
        ],

        getPlayer: () => {
            if (isMobile()) return document.querySelector('#player-container-id');
            if (location.pathname.startsWith('/embed')) {
                return document.querySelector('#movie_player');
            }
            return document.querySelector('ytd-player .html5-video-player');
        },

        getTrackInfo: (track) => {
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
        },

        isOriginalTrack: (track, langField) => {
            if (!track) return false;
            if (langField && track[langField]?.name) {
                const name = track[langField].name.toLowerCase();
                for (const kw of antiTranslate.ORIGINAL_KEYWORDS) {
                    if (name.includes(kw.toLowerCase())) return true;
                }
            }
            return antiTranslate.getTrackInfo(track).isOriginal;
        },

        getOriginalTrack: (tracks) => {
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
                if (antiTranslate.isOriginalTrack(track, langField)) return track;
            }
            return null;
        },

        untranslateAudio: async () => {
            const player = antiTranslate.getPlayer();
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
            if (state.antiTranslate.audioTrack === key) return;

            const original = antiTranslate.getOriginalTrack(tracks);
            if (!original) return;

            if (original.id === current.id) {
                state.antiTranslate.audioTrack = key;
                return;
            }

            const success = await player.setAudioTrack(original);
            if (success) {
                state.antiTranslate.audioTrack = `${videoId}+${original.id}`;
            }
        },

        untranslateDescription: () => {
            const player = antiTranslate.getPlayer();
            if (!player || typeof player.getPlayerResponse !== 'function') return;

            const response = player.getPlayerResponse();
            const original = response?.videoDetails?.shortDescription;
            if (!original) return;

            const id = getVideoId();
            if (state.antiTranslate.videoId === id) return;

            const desktopSel =
                '#description-inline-expander yt-attributed-string, ' +
                '#description-inline-expander .yt-core-attributed-string, ' +
                'ytd-expander#description yt-formatted-string';
            const mobileSel =
                '.expandable-video-description-body-main, ' +
                '.expandable-video-description-container';
            const container = document.querySelector(isMobile() ? mobileSel : desktopSel);
            if (!container) return;

            const currentText = container.textContent?.trim();
            const firstLine = original.split('\n')[0].trim();
            if (currentText?.startsWith(firstLine)) {
                state.antiTranslate.videoId = id;
                return;
            }

            container.textContent = '';
            original.split('\n').forEach((line, i, arr) => {
                container.appendChild(document.createTextNode(line));
                if (i < arr.length - 1) container.appendChild(document.createElement('br'));
            });
            state.antiTranslate.videoId = id;
        },

        update: () => {
            antiTranslate.untranslateAudio();
            antiTranslate.untranslateDescription();
        },
    };

    const shortsBlocker = {
        selectors: `
            ytd-guide-entry-renderer a[title="Shorts"],
            ytd-mini-guide-entry-renderer a[title="Shorts"],
            ytm-pivot-bar-item-renderer a[href="/shorts"],
            ytm-pivot-bar-item-renderer:has(.pivot-shorts),
            ytd-reel-shelf-renderer,
            ytd-rich-shelf-renderer:has([href*="/shorts/"]),
            ytm-reel-shelf-renderer,
            ytm-rich-section-renderer:has([href^="/shorts/"]),
            grid-shelf-view-model:has([href^="/shorts/"]),
            ytd-rich-grid-group:has([href^="/shorts/"]),
            [href^="/shorts/"],
            ytd-reel-item-renderer,
            ytm-reel-item-renderer,
            ytm-shorts-lockup-view-model,
            ytd-rich-item-renderer:has([href^="/shorts/"]),
            ytd-video-renderer:has([href^="/shorts/"]),
            ytd-grid-video-renderer:has([href^="/shorts/"]),
            ytd-compact-video-renderer:has([href^="/shorts/"]),
            ytm-rich-item-renderer:has([href^="/shorts/"]),
            ytm-video-with-context-renderer:has([href^="/shorts/"]),
            ytm-grid-video-renderer:has([href^="/shorts/"]),
            ytd-notification-renderer:has([href^="/shorts/"])
        `,

        hide: () => {
            const elements = document.querySelectorAll(shortsBlocker.selectors);
            elements.forEach((el) => (el.style.display = 'none'));
        },

        init: () => {
            shortsBlocker.hide();
            const observer = new MutationObserver(shortsBlocker.hide);
            const target = document.body || document.documentElement;
            observer.observe(target, {
                childList: true,
                subtree: true,
            });
        },
    };

    const update = () => {
        if (!isWatchPage()) {
            state.current.segments = [];
            return;
        }

        const id = getVideoId();
        if (!id) return;

        const hasChanged = id !== state.current.videoId;
        const dislikeBtn = dislikes.getDislikeButton();
        const needsDislikeUpdate = id === state.current.videoId && !dislikeBtn?.textContent;

        if (hasChanged) {
            state.current.videoId = id;
            dislikes.update(id);
            sponsors.update(id);
        } else if (needsDislikeUpdate) {
            dislikes.update(id);
        }

        sponsors.skip();
        antiTranslate.update();
    };

    continueWatching.init();
    shortsBlocker.init();

    setInterval(update, 500);
    setInterval(sponsors.skip, 100);

    const observer = new MutationObserver(update);
    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    update();
})();
