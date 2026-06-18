(() => {
    'use strict';

    const API_BASE = 'https://returnyoutubedislikeapi.com';
    const VOTES_URL = `${API_BASE}/votes?videoId=`;
    const cache = loadCache();
    let currentVideoId = null;
    let isFetching = false;
    let lastDisplayedCount = null;
    let attachedLikeButton = null;
    let voteState = 0;

    function loadCache() {
        try {
            return JSON.parse(localStorage.ytdb_cache) || {};
        } catch {
            return {};
        }
    }

    function saveCache() {
        localStorage.ytdb_cache = JSON.stringify(cache);
    }

    function isMobile() {
        return location.hostname === 'm.youtube.com';
    }

    function getVideoId() {
        const url = new URL(location.href);
        if (url.pathname.startsWith('/clip')) {
            const meta = document.querySelector(
                "meta[itemprop='videoId'], meta[itemprop='identifier']"
            );
            return meta?.content;
        }
        if (url.pathname.startsWith('/shorts')) {
            return url.pathname.slice(8);
        }
        return url.searchParams.get('v');
    }

    function getButtons() {
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
                document.querySelector('ytd-menu-renderer.ytd-video-primary-info-renderer > div')
            );
        }
        return menuContainer?.querySelector('#top-level-buttons-computed');
    }

    function getDislikeButton() {
        const buttons = getButtons();
        if (!buttons) {
            return null;
        }
        const firstChild = buttons.children[0];
        if (firstChild?.tagName === 'YTD-SEGMENTED-LIKE-DISLIKE-BUTTON-RENDERER') {
            return document.querySelector('#segmented-dislike-button') || firstChild.children[1];
        }
        if (buttons.querySelector('segmented-like-dislike-button-view-model')) {
            return buttons.querySelector('dislike-button-view-model');
        }
        return buttons.children[1];
    }

    function getLikeButton() {
        const buttons = getButtons();
        if (!buttons) {
            return null;
        }
        const firstChild = buttons.children[0];
        const tag = 'YTD-SEGMENTED-LIKE-DISLIKE-BUTTON-RENDERER';
        if (firstChild?.tagName === tag) {
            return document.querySelector('#segmented-like-button') || firstChild.children[0];
        }
        const model = 'segmented-like-dislike-button-view-model';
        if (buttons.querySelector(model)) {
            return buttons.querySelector('like-button-view-model');
        }
        return buttons.querySelector('like-button-view-model') || buttons.children[0];
    }

    function getTextElement(dislikeButton) {
        if (!dislikeButton) {
            return null;
        }
        return dislikeButton.querySelector(
            '#text, yt-formatted-string, .button-renderer-text, span[role="text"]'
        );
    }

    function createTextElement(dislikeButton) {
        const textSpan = document.createElement('span');
        textSpan.id = 'text';
        textSpan.style.marginLeft = '6px';
        const button = dislikeButton.querySelector('button');
        if (button) {
            button.appendChild(textSpan);
            button.style.width = 'auto';
        }
        return textSpan;
    }

    function formatNumber(count) {
        return new Intl.NumberFormat('en', {
            notation: 'compact',
            compactDisplay: 'short',
        }).format(count);
    }

    function displayDislikeCount(count) {
        const dislikeButton = getDislikeButton();
        if (!dislikeButton) {
            return false;
        }
        const formatted = formatNumber(count);
        let textElement = getTextElement(dislikeButton);
        if (textElement && textElement.textContent === formatted) {
            return true;
        }
        if (!textElement) {
            textElement = createTextElement(dislikeButton);
        }
        if (!textElement) {
            return false;
        }
        textElement.textContent = formatted;
        textElement.removeAttribute('is-empty');
        lastDisplayedCount = count;
        return true;
    }

    async function fetchDislikes(videoId) {
        if (isFetching || !videoId) {
            return;
        }
        isFetching = true;
        try {
            const response = await fetch(VOTES_URL + videoId, {
                signal: AbortSignal.timeout(5000),
            });
            const data = await response.json();
            if (data?.dislikes) {
                cache[videoId] = data.dislikes;
                saveCache();
                if (videoId === currentVideoId) {
                    displayDislikeCount(data.dislikes);
                }
            }
        } catch {
            // Silently fail
        }
        isFetching = false;
    }

    function generateUserId() {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + 'abcdefghijklmnopqrstuvwxyz0123456789';
        const values = crypto.getRandomValues(new Uint32Array(36));
        return Array.from(values, (v) => charset[v % charset.length]).join('');
    }

    function getUserId() {
        const stored = localStorage.getItem('ytdb_userId');
        if (stored) {
            return stored;
        }
        const userId = generateUserId();
        localStorage.setItem('ytdb_userId', userId);
        return userId;
    }

    function countLeadingZeroes(bytes) {
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
    }

    async function solvePuzzle(puzzle) {
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
            if (countLeadingZeroes(new Uint8Array(hash)) < puzzle.difficulty) {
                continue;
            }
            return btoa(String.fromCharCode(...byteView.slice(0, 4)));
        }
        return null;
    }

    async function register() {
        const userId = getUserId();
        const url = `${API_BASE}/puzzle/registration` + `?userId=${encodeURIComponent(userId)}`;
        try {
            const puzzle = await fetch(url, {
                headers: { Accept: 'application/json' },
            }).then((response) => response.json());
            const solution = await solvePuzzle(puzzle);
            if (!solution) {
                return false;
            }
            const result = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ solution }),
            }).then((response) => response.json());
            if (result === true) {
                localStorage.setItem('ytdb_registered', 'true');
                return true;
            }
        } catch {}
        return false;
    }

    async function ensureRegistered() {
        const registered = localStorage.getItem('ytdb_registered');
        if (registered === 'true') {
            return true;
        }
        return register();
    }

    async function submitVote(videoId, vote, retried = false) {
        if (!(await ensureRegistered())) {
            return;
        }
        const userId = getUserId();
        try {
            const response = await fetch(`${API_BASE}/interact/vote`, {
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
                if (await register()) {
                    return submitVote(videoId, vote, true);
                }
                return;
            }
            if (!response.ok) {
                return;
            }
            const puzzle = await response.json();
            const solution = await solvePuzzle(puzzle);
            if (!solution) {
                return;
            }
            await fetch(`${API_BASE}/interact/confirmVote`, {
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
    }

    function isButtonPressed(buttonContainer) {
        if (!buttonContainer) {
            return false;
        }
        const button = buttonContainer.querySelector('button');
        return button?.getAttribute('aria-pressed') === 'true';
    }

    function detectVoteState() {
        if (isButtonPressed(getLikeButton())) {
            return 1;
        }
        if (isButtonPressed(getDislikeButton())) {
            return -1;
        }
        return 0;
    }

    function handleLikeClick() {
        if (!currentVideoId) {
            return;
        }
        voteState = voteState === 1 ? 0 : 1;
        submitVote(currentVideoId, voteState);
    }

    function handleDislikeClick() {
        if (!currentVideoId) {
            return;
        }
        voteState = voteState === -1 ? 0 : -1;
        submitVote(currentVideoId, voteState);
    }

    function attachVoteListeners() {
        const likeButton = getLikeButton();
        if (!likeButton) {
            return;
        }
        if (attachedLikeButton === likeButton) {
            return;
        }
        const dislikeButton = getDislikeButton();
        if (!dislikeButton) {
            return;
        }
        voteState = detectVoteState();
        likeButton.addEventListener('click', handleLikeClick);
        dislikeButton.addEventListener('click', handleDislikeClick);
        attachedLikeButton = likeButton;
    }

    function isVideoLoaded() {
        const videoId = getVideoId();
        if (!videoId) {
            return false;
        }
        if (isMobile()) {
            return document.getElementById('player')?.getAttribute('loading') === 'false';
        }
        return (
            document.querySelector(`ytd-watch-grid[video-id='${videoId}']`) !== null ||
            document.querySelector(`ytd-watch-flexy[video-id='${videoId}']`) !== null
        );
    }

    function processVideo() {
        if (!/\/(watch|shorts)/.test(location.pathname)) {
            return;
        }
        const videoId = getVideoId();
        if (!videoId || !getButtons() || !getDislikeButton() || !isVideoLoaded()) {
            return;
        }
        const isNewVideo = videoId !== currentVideoId;
        if (isNewVideo) {
            currentVideoId = videoId;
            lastDisplayedCount = null;
        }
        attachVoteListeners();
        if (cache[videoId]) {
            const cached = cache[videoId];
            if (lastDisplayedCount !== cached || !getTextElement(getDislikeButton())) {
                displayDislikeCount(cached);
            }
            return;
        }
        if (isNewVideo) {
            fetchDislikes(videoId);
        }
    }

    function onNavigate() {
        currentVideoId = null;
        lastDisplayedCount = null;
        attachedLikeButton = null;
        voteState = 0;
        setTimeout(processVideo, 100);
    }

    window.addEventListener('yt-navigate-finish', onNavigate, true);
    setInterval(processVideo, 500);
    processVideo();
})();
