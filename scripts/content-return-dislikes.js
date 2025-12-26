(() => {
    const API_URL = 'https://returnyoutubedislikeapi.com/votes?videoId=';
    const cache = loadCache();
    let currentVideoId = null;
    let isFetching = false;
    let lastDisplayedCount = null;

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
            const response = await fetch(API_URL + videoId, {
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
        if (cache[videoId]) {
            if (lastDisplayedCount !== cache[videoId]) {
                displayDislikeCount(cache[videoId]);
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
        setTimeout(processVideo, 100);
    }

    window.addEventListener('yt-navigate-finish', onNavigate, true);
    setInterval(processVideo, 500);
    processVideo();
})();
