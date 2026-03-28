(async () => {
    'use strict';

    const browserApi = typeof browser !== 'undefined' ? browser : chrome;
    const storageApi = browserApi.storage.local;

    const SETTING_DEFAULTS = {
        features: {
            dislikes: true,
            sponsors: true,
            shortsBlocker: true,
            membersBlocker: true,
            continueWatching: true,
            antiTranslate: true,
            backgroundPlayback: true,
        },
        categories: {
            sponsor: true,
            selfpromo: true,
            exclusive_access: false,
            interaction: false,
            poi_highlight: false,
            intro: false,
            outro: false,
            preview: false,
            filler: false,
            music_offtopic: false,
        },
        musicOnlySkip: false,
    };

    let settings = JSON.parse(JSON.stringify(SETTING_DEFAULTS));

    const mergeSettings = (stored) => {
        if (!stored) return;
        for (const [key, val] of Object.entries(stored)) {
            if (typeof val === 'object' && val !== null && settings[key]) {
                Object.assign(settings[key], val);
            } else {
                settings[key] = val;
            }
        }
    };

    try {
        const data = await storageApi.get('settings');
        mergeSettings(data.settings);
    } catch {}

    const applyBgPlayback = () => {
        if (!settings.features.backgroundPlayback) {
            document.documentElement.dataset.ytluBgOff = '1';
        } else {
            delete document.documentElement.dataset.ytluBgOff;
        }
    };
    applyBgPlayback();

    browserApi.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.settings) return;
        mergeSettings(changes.settings.newValue);
        applyBgPlayback();
    });

    const state = {
        cache: { dislikes: {}, sponsors: {} },
        current: {
            videoId: null,
            segments: [],
            processing: { dislikes: false },
        },
        lastActivity: Date.now(),
        antiTranslate: { videoId: null, audioTrack: null },
        vote: {
            attachedLikeButton: null,
            state: 0,
        },
    };

    try {
        state.cache.dislikes = JSON.parse(localStorage.ytdb_cache || '{}');
        const stored = JSON.parse(localStorage.sponsorblock_cache || '{}');
        state.cache.sponsors = Object.fromEntries(
            Object.entries(stored).filter(
                ([_, v]) => v.timestamp && Date.now() - v.timestamp < 3600000
            )
        );
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
        API_BASE: 'https://returnyoutubedislikeapi.com',
        lastDisplayedCount: null,

        getButtons: () => {
            if (isMobile()) {
                return (
                    document.querySelector('.slim-video-action-bar-actions .segmented-buttons') ||
                    document.querySelector('.slim-video-action-bar-actions')
                );
            }
            const menuContainer = document.getElementById('menu-container');
            if (menuContainer?.offsetParent === null) {
                return (
                    document.querySelector('ytd-menu-renderer.ytd-watch-metadata > div') ||
                    document.querySelector(
                        'ytd-menu-renderer.ytd-video-primary-info-renderer > div'
                    )
                );
            }
            return menuContainer?.querySelector('#top-level-buttons-computed');
        },

        getDislikeButton: () => {
            const buttons = dislikes.getButtons();
            if (!buttons) return null;

            const firstChild = buttons.children[0];
            if (firstChild?.tagName === 'YTD-SEGMENTED-LIKE-DISLIKE-BUTTON-RENDERER') {
                return (
                    document.querySelector('#segmented-dislike-button') || firstChild.children[1]
                );
            }
            if (buttons.querySelector('segmented-like-dislike-button-view-model')) {
                return buttons.querySelector('dislike-button-view-model');
            }
            if (isMobile()) {
                return buttons.children[0]?.querySelector('dislike-button-view-model') || null;
            }
            return buttons.children[1];
        },

        getLikeButton: () => {
            const buttons = dislikes.getButtons();
            if (!buttons) return null;

            const firstChild = buttons.children[0];
            const tag = 'YTD-SEGMENTED-LIKE-DISLIKE-BUTTON-RENDERER';
            if (firstChild?.tagName === tag) {
                return document.querySelector('#segmented-like-button') || firstChild.children[0];
            }
            const model = 'segmented-like-dislike-button-view-model';
            if (buttons.querySelector(model)) {
                return buttons.querySelector('like-button-view-model');
            }
            if (isMobile()) {
                return buttons.children[0]?.querySelector('like-button-view-model') || null;
            }
            return buttons.children[0];
        },

        getTextElement: (button) => {
            if (!button) return null;
            return button.querySelector(
                '#text, yt-formatted-string, .button-renderer-text, span[role="text"]'
            );
        },

        createTextElement: (button) => {
            const textSpan = document.createElement('span');
            textSpan.id = 'text';
            textSpan.style.marginLeft = '6px';
            const btn = button.querySelector('button');
            if (btn) {
                btn.appendChild(textSpan);
                btn.style.width = 'auto';
            }
            return textSpan;
        },

        show: (count) => {
            const dislikeButton = dislikes.getDislikeButton();
            if (!dislikeButton) return false;

            const formatted = new Intl.NumberFormat('en', {
                notation: 'compact',
                compactDisplay: 'short',
            }).format(count);

            let textElement = dislikes.getTextElement(dislikeButton);
            if (textElement && textElement.textContent === formatted) return true;

            if (!textElement) {
                textElement = dislikes.createTextElement(dislikeButton);
            }
            if (!textElement) return false;

            textElement.textContent = formatted;
            textElement.removeAttribute('is-empty');
            dislikes.lastDisplayedCount = count;
            return true;
        },

        isVideoLoaded: (videoId) => {
            if (!videoId) return false;
            if (isMobile()) {
                return document.getElementById('player')?.getAttribute('loading') === 'false';
            }
            return (
                document.querySelector(`ytd-watch-grid[video-id='${videoId}']`) !== null ||
                document.querySelector(`ytd-watch-flexy[video-id='${videoId}']`) !== null
            );
        },

        fetch: async (id) => {
            if (state.current.processing.dislikes || !id) return;

            state.current.processing.dislikes = true;

            try {
                const url = `${dislikes.API_BASE}/votes?videoId=`;
                const res = await fetch(url + id, {
                    signal: AbortSignal.timeout(5000),
                });
                const data = await res.json();

                if (data?.dislikes) {
                    state.cache.dislikes[id] = data.dislikes;
                    localStorage.ytdb_cache = JSON.stringify(state.cache.dislikes);
                    if (id === state.current.videoId) {
                        dislikes.show(data.dislikes);
                    }
                }
            } catch {}

            state.current.processing.dislikes = false;
        },

        update: (id) => {
            if (!dislikes.getButtons() || !dislikes.getDislikeButton()) return;
            if (!dislikes.isVideoLoaded(id)) return;

            if (state.cache.dislikes[id]) {
                if (dislikes.lastDisplayedCount !== state.cache.dislikes[id]) {
                    dislikes.show(state.cache.dislikes[id]);
                }
                return;
            }

            dislikes.fetch(id);
        },

        generateUserId: () => {
            const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + 'abcdefghijklmnopqrstuvwxyz0123456789';
            const values = crypto.getRandomValues(new Uint32Array(36));
            return Array.from(values, (v) => charset[v % charset.length]).join('');
        },

        getUserId: () => {
            const stored = localStorage.getItem('ytdb_userId');
            if (stored) return stored;
            const userId = dislikes.generateUserId();
            localStorage.setItem('ytdb_userId', userId);
            return userId;
        },

        countLeadingZeroes: (bytes) => {
            let count = 0;
            for (const byte of bytes) {
                if (byte === 0) {
                    count += 8;
                    continue;
                }
                count += Math.clz32(byte) - 24;
                break;
            }
            return count;
        },

        solvePuzzle: async (puzzle) => {
            const challenge = Uint8Array.from(atob(puzzle.challenge), (character) =>
                character.charCodeAt(0)
            );
            const buffer = new ArrayBuffer(20);
            const byteView = new Uint8Array(buffer);
            const counterView = new Uint32Array(buffer);
            const maxIterations = Math.pow(2, puzzle.difficulty) * 3;
            for (let i = 4; i < 20; i++) {
                byteView[i] = challenge[i - 4];
            }
            for (let i = 0; i < maxIterations; i++) {
                counterView[0] = i;
                const hash = await crypto.subtle.digest('SHA-512', buffer);
                const zeroes = dislikes.countLeadingZeroes(new Uint8Array(hash));
                if (zeroes < puzzle.difficulty) continue;
                return btoa(String.fromCharCode(...byteView.slice(0, 4)));
            }
            return null;
        },

        register: async () => {
            const userId = dislikes.getUserId();
            const url =
                `${dislikes.API_BASE}/puzzle/registration` +
                `?userId=${encodeURIComponent(userId)}`;
            try {
                const puzzle = await fetch(url, {
                    headers: {
                        Accept: 'application/json',
                    },
                }).then((r) => r.json());
                const solution = await dislikes.solvePuzzle(puzzle);
                if (!solution) return false;
                const result = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ solution }),
                }).then((r) => r.json());
                if (result === true) {
                    localStorage.setItem('ytdb_registered', 'true');
                    return true;
                }
            } catch {}
            return false;
        },

        ensureRegistered: async () => {
            const registered = localStorage.getItem('ytdb_registered');
            if (registered === 'true') return true;
            return dislikes.register();
        },

        submitVote: async (videoId, vote, retried = false) => {
            if (!(await dislikes.ensureRegistered())) {
                return;
            }
            const userId = dislikes.getUserId();
            try {
                const response = await fetch(`${dislikes.API_BASE}/interact/vote`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        userId,
                        videoId,
                        value: vote,
                    }),
                });
                if (response.status === 401 && !retried) {
                    localStorage.removeItem('ytdb_registered');
                    if (await dislikes.register()) {
                        return dislikes.submitVote(videoId, vote, true);
                    }
                    return;
                }
                if (!response.ok) return;
                const puzzle = await response.json();
                const solution = await dislikes.solvePuzzle(puzzle);
                if (!solution) return;
                await fetch(`${dislikes.API_BASE}` + '/interact/confirmVote', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        solution,
                        userId,
                        videoId,
                    }),
                });
            } catch {}
        },

        isButtonPressed: (buttonContainer) => {
            if (!buttonContainer) return false;
            const button = buttonContainer.querySelector('button');
            return button?.getAttribute('aria-pressed') === 'true';
        },

        detectVoteState: () => {
            if (dislikes.isButtonPressed(dislikes.getLikeButton())) {
                return 1;
            }
            if (dislikes.isButtonPressed(dislikes.getDislikeButton())) {
                return -1;
            }
            return 0;
        },

        handleLikeClick: () => {
            if (!state.current.videoId) return;
            state.vote.state = state.vote.state === 1 ? 0 : 1;
            dislikes.submitVote(state.current.videoId, state.vote.state);
        },

        handleDislikeClick: () => {
            if (!state.current.videoId) return;
            state.vote.state = state.vote.state === -1 ? 0 : -1;
            dislikes.submitVote(state.current.videoId, state.vote.state);
        },

        attachVoteListeners: () => {
            const likeButton = dislikes.getLikeButton();
            if (!likeButton) return;
            if (state.vote.attachedLikeButton === likeButton) {
                return;
            }
            const dislikeButton = dislikes.getDislikeButton();
            if (!dislikeButton) return;
            state.vote.state = dislikes.detectVoteState();
            likeButton.addEventListener('click', dislikes.handleLikeClick);
            dislikeButton.addEventListener('click', dislikes.handleDislikeClick);
            state.vote.attachedLikeButton = likeButton;
        },
    };

    const sponsors = {
        SKIP_BUFFER: 0.003,
        END_TIME_SKIP_BUFFER: 0.5,
        CACHE_TTL: 3600000,
        pendingList: {},
        lastSkipTime: 0,
        skippedSegments: new Set(),
        renderTimeout: null,

        hashVideoId: async (id) => {
            const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
            return Array.from(new Uint8Array(buffer))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('')
                .slice(0, 4);
        },

        getEnabledCategories: () => {
            const cats = Object.entries(settings.categories)
                .filter(([_, v]) => v)
                .map(([k]) => k);
            if (settings.musicOnlySkip && !isMusic()) {
                const idx = cats.indexOf('music_offtopic');
                if (idx !== -1) cats.splice(idx, 1);
            }
            return cats;
        },

        fetch: async (id) => {
            if (sponsors.pendingList[id]) return await sponsors.pendingList[id];
            if (!id) return;

            const cached = state.cache.sponsors[id];
            if (cached && Date.now() - cached.timestamp < sponsors.CACHE_TTL) {
                return cached.segments;
            }

            const enabledCats = sponsors.getEnabledCategories();
            if (!enabledCats.length) return [];

            const pendingData = (async () => {
                try {
                    const hash = await sponsors.hashVideoId(id);
                    const cats = JSON.stringify(enabledCats);
                    const url =
                        'https://sponsor.ajay.app/api/skipSegments/' +
                        `${hash}?categories=${cats}` +
                        '&actionTypes=["skip"]';
                    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });

                    if (res.ok) {
                        const data = await res.json();
                        const videoData = data.find((v) => v.videoID === id);
                        const filtered =
                            videoData?.segments
                                ?.filter(
                                    (s) =>
                                        enabledCats.includes(s.category) &&
                                        s.actionType === 'skip' &&
                                        s.segment?.length === 2 &&
                                        s.segment[1] > s.segment[0]
                                )
                                .sort((a, b) => a.segment[0] - b.segment[0]) || [];

                        state.cache.sponsors[id] = { segments: filtered, timestamp: Date.now() };
                        localStorage.sponsorblock_cache = JSON.stringify(state.cache.sponsors);
                        return filtered;
                    }
                } catch {}
                return [];
            })();

            sponsors.pendingList[id] = pendingData;
            try {
                return await pendingData;
            } finally {
                delete sponsors.pendingList[id];
            }
        },

        getVideo: () => {
            const videos = [...document.querySelectorAll('video')].filter(
                (v) => v.offsetWidth > 0 && v.offsetHeight > 0
            );
            return videos[0];
        },

        skip: () => {
            if (!settings.features.sponsors) return;
            const video = sponsors.getVideo();
            if (!video || !state.current.segments.length) return;

            const enabledCats = sponsors.getEnabledCategories();
            const { currentTime, duration } = video;

            for (const segment of state.current.segments) {
                if (!enabledCats.includes(segment.category)) continue;
                const [start, end] = segment.segment;

                if (currentTime < start - sponsors.SKIP_BUFFER || currentTime >= end) continue;
                if (Date.now() - sponsors.lastSkipTime < 500) continue;

                const clampedEnd = Math.min(end, duration);
                let skipTo = clampedEnd;

                if (video.loop && duration > 1 && clampedEnd >= duration - 1) {
                    skipTo = 0;
                } else if (
                    duration > 1 &&
                    Math.abs(clampedEnd - duration) < sponsors.END_TIME_SKIP_BUFFER
                ) {
                    skipTo = duration - 0.001;
                }

                if (currentTime !== skipTo) {
                    video.currentTime = skipTo;
                    sponsors.lastSkipTime = Date.now();
                    sponsors.skippedSegments.add(segment.UUID);
                    break;
                }
            }
        },

        getProgressBar: () => {
            const bars = document.querySelectorAll('.ytp-progress-bar');
            return [...bars].find((bar) => bar.offsetWidth > 0) || bars[0];
        },

        timeToPercentage: (time, duration, progressBar) => {
            const chapters = progressBar?.parentElement?.querySelector('.ytp-chapters-container');
            if (!chapters || chapters.children.length <= 1) {
                return (time / duration) * 100;
            }
            return (time / duration) * 100;
        },

        renderMarkers: () => {
            const progressBar = sponsors.getProgressBar();
            if (!progressBar) return;

            const video = sponsors.getVideo();
            if (!video?.duration) return;

            document.querySelectorAll('.skip-segment-marker').forEach((m) => m.remove());

            const enabledCats = sponsors.getEnabledCategories();
            const duration = video.duration;
            state.current.segments
                .filter((s) => enabledCats.includes(s.category))
                .forEach((segment) => {
                    const [startTime, endTime] = segment.segment;
                    if (endTime <= startTime) return;

                    const marker = document.createElement('div');
                    marker.className = 'skip-segment-marker';
                    const leftPos = sponsors.timeToPercentage(startTime, duration, progressBar);
                    const rightPos = sponsors.timeToPercentage(endTime, duration, progressBar);
                    marker.style.cssText = `
                    position: absolute;
                    left: ${leftPos}%;
                    width: ${rightPos - leftPos}%;
                    top: 0;
                    height: 100%;
                    background: rgba(0, 255, 0, 0.6);
                    z-index: 10;
                    pointer-events: none;
                `;
                    progressBar.appendChild(marker);
                });
        },

        scheduleRender: () => {
            clearTimeout(sponsors.renderTimeout);
            sponsors.renderTimeout = setTimeout(sponsors.renderMarkers, 100);
        },

        update: (id) => {
            sponsors.skippedSegments.clear();

            const cached = state.cache.sponsors[id];
            state.current.segments =
                cached && Date.now() - cached.timestamp < sponsors.CACHE_TTL ? cached.segments : [];

            if (!cached || Date.now() - cached.timestamp >= sponsors.CACHE_TTL) {
                sponsors.fetch(id).then((segs) => {
                    state.current.segments = segs || [];
                    sponsors.renderMarkers();
                });
            } else {
                sponsors.scheduleRender();
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

        cache: new Map(),
        processed: new Set(),

        normalize: (text) => {
            if (!text) return '';
            return text
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\s+/g, ' ')
                .replace(/[\p{Emoji}]/gu, '')
                .trim()
                .toLowerCase();
        },

        getPlayer: () => {
            if (isMobile()) return document.querySelector('#player-container-id');
            if (location.pathname.startsWith('/shorts')) {
                return document.querySelector('#shorts-player');
            }
            if (location.pathname.startsWith('/embed')) {
                return document.querySelector('#movie_player');
            }
            return document.querySelector('ytd-player .html5-video-player');
        },

        fetchTitle: async (videoId) => {
            if (antiTranslate.cache.has(videoId)) {
                return antiTranslate.cache.get(videoId);
            }
            try {
                const res = await fetch(
                    `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}`
                );
                if (!res.ok) return null;
                const data = await res.json();
                const title = data.title || null;
                if (title) antiTranslate.cache.set(videoId, title);
                return title;
            } catch {
                return null;
            }
        },

        getOriginal: (tracks) => {
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
                    if (antiTranslate.ORIGINAL_KEYWORDS.some((kw) => name.includes(kw))) {
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

            const original = antiTranslate.getOriginal(tracks);
            if (!original || original.id === current.id) {
                state.antiTranslate.audioTrack = key;
                return;
            }

            const success = await player.setAudioTrack(original);
            if (success) state.antiTranslate.audioTrack = `${videoId}+${original.id}`;
        },

        untranslateDescription: () => {
            const player = antiTranslate.getPlayer();
            if (!player || typeof player.getPlayerResponse !== 'function') return;

            const response = player.getPlayerResponse();
            const original = response?.videoDetails?.shortDescription;
            if (!original) return;

            const videoId = getVideoId();
            if (!videoId || state.antiTranslate.videoId === videoId) return;

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
                state.antiTranslate.videoId = videoId;
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
            state.antiTranslate.videoId = videoId;
        },

        untranslateMainTitle: async () => {
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
            if (antiTranslate.processed.has(key)) return;

            const original = await antiTranslate.fetchTitle(videoId);
            if (!original) return;

            if (antiTranslate.normalize(original) === antiTranslate.normalize(current)) {
                antiTranslate.processed.add(key);
                return;
            }

            element.textContent = original;
            element.removeAttribute('is-empty');

            const expectedTitle = `${original} - YouTube`;
            if (document.title !== expectedTitle) {
                document.title = expectedTitle;
            }

            antiTranslate.processed.add(key);
        },

        untranslateVideoList: async () => {
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

                const original = await antiTranslate.fetchTitle(videoId);
                if (!original) {
                    titleEl.removeAttribute('ynt');
                    titleEl.removeAttribute('ynt-original');
                    titleEl.setAttribute('ynt-fail', videoId);
                    continue;
                }

                if (antiTranslate.normalize(original) === antiTranslate.normalize(current)) {
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
        },

        matchLang: (code1, code2) => {
            if (!code1 || !code2) return false;
            return code1.split('-')[0] === code2.split('-')[0];
        },

        untranslateSubtitles: () => {
            const player = antiTranslate.getPlayer();
            if (!player || typeof player.getPlayerResponse !== 'function') return;

            try {
                const response = player.getPlayerResponse();
                const tracks = response.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                if (!tracks) return;

                const asrTrack = tracks.find((track) => track.kind === 'asr');
                if (!asrTrack) return;

                const original = tracks.find(
                    (track) =>
                        antiTranslate.matchLang(track.languageCode, asrTrack.languageCode) &&
                        !track.kind
                );

                if (original && typeof player.setOption === 'function') {
                    player.setOption('captions', 'track', original);
                }
            } catch {}
        },

        removeSyncLabel: () => {
            const labels = document.querySelectorAll(
                '.ytp-caption-window-rollup, ' +
                    '.caption-window .ytp-caption-segment[style*="italic"]'
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
        },

        update: () => {
            if (location.pathname.startsWith('/watch')) {
                antiTranslate.untranslateAudio();
                antiTranslate.untranslateDescription();
                antiTranslate.untranslateMainTitle();
                antiTranslate.untranslateSubtitles();
                antiTranslate.removeSyncLabel();
            }
            antiTranslate.untranslateVideoList();
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

    const membersBlocker = {
        BADGE_SELECTOR: [
            '.badge.badge-style-type-members-only',
            '.badge[aria-label*="Members" i]',
            'ytd-badge-supported-renderer .badge-style-type-members-only',
            'ytd-badge-supported-renderer .badge[aria-label*="Members" i]',
            'p.style-scope.ytd-badge-supported-renderer',
            'yt-badge-view-model badge-shape',
            'yt-badge-view-model .yt-badge-shape__text',
            '.badge-shape-wiz__text',
            '.yt-badge-shape__text',
        ].join(','),

        MEDIA_SELECTOR: [
            'ytd-rich-grid-media',
            'ytd-video-renderer',
            'ytd-compact-video-renderer',
            'ytd-grid-video-renderer',
            'yt-lockup-view-model',
            'ytd-reel-item-renderer',
        ].join(','),

        MEMBERS_PATTERNS: [
            /members\s*only/i,
            /members\s*first/i,
            /for\s+members/i,
            /available\s+to\s+members/i,
        ],

        isMembersBadge: (node) => {
            if (node.closest?.('yt-badge-view-model')) {
                const text = (node.textContent || '').trim();
                if (membersBlocker.MEMBERS_PATTERNS.some((p) => p.test(text))) return true;
            }

            const text = (node.textContent || '').trim();
            const label = node.getAttribute?.('aria-label') || '';

            if (node.classList?.contains('badge-style-type-members-only')) return true;
            if (membersBlocker.MEMBERS_PATTERNS.some((p) => p.test(label))) return true;
            if (membersBlocker.MEMBERS_PATTERNS.some((p) => p.test(text))) return true;

            return false;
        },

        findWrapper: (badge) => {
            return (
                badge.closest('yt-lockup-view-model') ||
                badge.closest('ytd-rich-item-renderer') ||
                badge.closest('ytd-rich-grid-row') ||
                badge.closest(membersBlocker.MEDIA_SELECTOR) ||
                badge.closest('#contents > *')
            );
        },

        hideWrapper: (wrapper) => {
            if (!wrapper || wrapper.dataset.membersHidden) return;
            wrapper.style.display = 'none';
            wrapper.dataset.membersHidden = 'true';
        },

        hideMembersOnly: (scope = document) => {
            const root = scope.nodeType === 1 || scope.shadowRoot ? scope : document;
            const searchRoot = root.shadowRoot || root;
            const badges = searchRoot.querySelectorAll(membersBlocker.BADGE_SELECTOR);

            for (const badge of badges) {
                if (!membersBlocker.isMembersBadge(badge)) continue;
                membersBlocker.hideWrapper(membersBlocker.findWrapper(badge));
            }
        },

        injectStyles: () => {
            if (document.getElementById('members-blocker-style')) return;
            if (!CSS?.supports?.('selector(:has(*))')) return;

            const style = document.createElement('style');
            style.id = 'members-blocker-style';
            style.textContent = `
                ytd-rich-grid-media:has(.badge-style-type-members-only),
                ytd-video-renderer:has(.badge-style-type-members-only),
                ytd-compact-video-renderer:has(.badge-style-type-members-only),
                ytd-grid-video-renderer:has(.badge-style-type-members-only),
                yt-lockup-view-model:has(.badge-style-type-members-only),
                ytd-reel-item-renderer:has(.badge-style-type-members-only),
                yt-lockup-view-model:has(yt-badge-view-model .yt-badge-shape__text) {
                    display: none !important;
                }
            `;
            document.documentElement.appendChild(style);
        },

        init: () => {
            membersBlocker.injectStyles();
            membersBlocker.hideMembersOnly();

            const wrapperSelector = [
                'ytd-rich-item-renderer',
                'ytd-rich-grid-row',
                membersBlocker.MEDIA_SELECTOR,
            ].join(',');

            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type !== 'childList') continue;
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType !== 1) continue;
                        const scope = node.closest?.(wrapperSelector) || node;
                        membersBlocker.hideMembersOnly(scope);
                        if (node.shadowRoot) membersBlocker.hideMembersOnly(node.shadowRoot);
                    }
                }
            });

            observer.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true,
            });

            window.addEventListener('yt-navigate-finish', () => {
                queueMicrotask(() => membersBlocker.hideMembersOnly());
                setTimeout(() => membersBlocker.hideMembersOnly(), 250);
            });
        },
    };

    const mobileMetadataFix = {
        STYLE_ID: 'mobile-metadata-fix-style',

        injectStyles: () => {
            if (!isMobile()) return;
            if (document.getElementById(mobileMetadataFix.STYLE_ID)) return;

            const style = document.createElement('style');
            style.id = mobileMetadataFix.STYLE_ID;
            style.textContent = `
                ytm-slim-video-metadata-section-renderer {
                    position: relative !important;
                    z-index: 2 !important;
                }
            `;
            document.documentElement.appendChild(style);
        },

        init: () => {
            mobileMetadataFix.injectStyles();
        },
    };

    const onNavigate = () => {
        state.current.videoId = null;
        dislikes.lastDisplayedCount = null;
        state.vote.attachedLikeButton = null;
        state.vote.state = 0;
        sponsors.skippedSegments.clear();
        document.querySelectorAll('.skip-segment-marker').forEach((m) => m.remove());
        setTimeout(update, 100);
    };

    const update = () => {
        if (!isWatchPage()) {
            state.current.segments = [];
            sponsors.skippedSegments.clear();
            document.querySelectorAll('.skip-segment-marker').forEach((m) => m.remove());
            return;
        }

        const id = getVideoId();
        if (!id) return;

        const isNewVideo = id !== state.current.videoId;

        if (isNewVideo) {
            state.current.videoId = id;
            dislikes.lastDisplayedCount = null;
            if (settings.features.sponsors) sponsors.update(id);
        }

        if (settings.features.dislikes) {
            dislikes.update(id);
            dislikes.attachVoteListeners();
        }
        if (settings.features.sponsors) sponsors.skip();
        if (settings.features.antiTranslate) {
            antiTranslate.update();
        }
    };

    if (settings.features.continueWatching) continueWatching.init();
    if (settings.features.shortsBlocker) shortsBlocker.init();
    if (settings.features.membersBlocker) membersBlocker.init();
    mobileMetadataFix.init();

    window.addEventListener('yt-navigate-finish', onNavigate, true);
    setInterval(update, 500);
    setInterval(sponsors.skip, 100);

    const observer = new MutationObserver(() => {
        update();
        sponsors.scheduleRender();
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    update();
})();
