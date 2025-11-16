(() => {
    const API = 'https://returnyoutubedislikeapi.com/votes?videoId=';
    let cache = {};
    let currentId = null;
    let processing = false;

    try {
        cache = JSON.parse(localStorage.ytdb_cache) || {};
    } catch {}

    const isMobile = () => location.hostname === 'm.youtube.com';

    const getVideoId = () => {
        const url = new URL(location.href);
        if (url.pathname.startsWith('/clip')) {
            return document.querySelector("meta[itemprop='videoId'], meta[itemprop='identifier']")
                ?.content;
        }
        return url.searchParams.get('v');
    };

    const getButtons = () =>
        isMobile()
            ? document.querySelector('.slim-video-action-bar-actions .segmented-buttons') ||
              document.querySelector('.slim-video-action-bar-actions')
            : document.querySelector('#top-level-buttons-computed') ||
              document.querySelector('ytd-menu-renderer.ytd-watch-metadata > div');

    const getDislikeButton = () => {
        const btns = getButtons();
        if (!btns) return null;

        const isSegmented =
            btns.children[0]?.tagName === 'YTD-SEGMENTED-LIKE-DISLIKE-BUTTON-RENDERER';

        if (isSegmented) {
            return (
                document.querySelector('#segmented-dislike-button') || btns.children[0].children[1]
            );
        }

        if (btns.querySelector('segmented-like-dislike-button-view-model')) {
            return btns.querySelector('dislike-button-view-model');
        }

        return btns.children[1];
    };

    const getTextElement = (btn) => {
        if (!btn) return null;

        let text = btn.querySelector(
            '#text, yt-formatted-string, .button-renderer-text, span[role="text"]'
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
    };

    const showDislikeCount = (count) => {
        const text = getTextElement(getDislikeButton());
        if (text) {
            const formatter = new Intl.NumberFormat('en', {
                notation: 'compact',
                compactDisplay: 'short',
            });
            text.textContent = formatter.format(count);
            text.removeAttribute('is-empty');
        }
    };

    const fetchDislikes = async (id) => {
        if (processing || !id || cache[id]) return;
        processing = true;

        try {
            const res = await fetch(API + id, { signal: AbortSignal.timeout(5000) });
            const data = await res.json();

            if (data?.dislikes) {
                cache[id] = data.dislikes;
                localStorage.ytdb_cache = JSON.stringify(cache);
                showDislikeCount(data.dislikes);
            }
        } catch {}

        processing = false;
    };

    const update = () => {
        if (!/\/watch/.test(location.pathname)) return;

        const id = getVideoId();
        if (!id) return;

        const hasChanged = id !== currentId;
        const needsUpdate = id === currentId && !getDislikeButton()?.textContent;

        if (hasChanged || needsUpdate) {
            currentId = id;

            if (cache[id]) {
                showDislikeCount(cache[id]);
            } else if (getButtons() && getDislikeButton()) {
                fetchDislikes(id);
            }
        }
    };

    setInterval(update, 500);
    new MutationObserver(update).observe(document.body, { childList: true, subtree: true });
    update();
})();
