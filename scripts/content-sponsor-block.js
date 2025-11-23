(() => {
    const API = 'https://sponsor.ajay.app/api/skipSegments/';
    let cache = {};
    let currentId = null;
    let segments = [];
    let processing = false;

    try {
        cache = JSON.parse(localStorage.sponsorblock_cache) || {};
    } catch {}

    const getVideoId = () => {
        const url = new URL(location.href);
        if (url.pathname.startsWith('/clip')) {
            return document.querySelector("meta[itemprop='videoId'], meta[itemprop='identifier']")
                ?.content;
        }
        return url.searchParams.get('v');
    };

    const getVideo = () => document.querySelector('video');

    const skip = (segment) => {
        const video = getVideo();
        if (!video) return;

        const [start, end] = segment.segment;
        const { currentTime, duration } = video;

        if (currentTime >= start - 0.003 && currentTime < end && !video.ended) {
            video.currentTime = duration > 1 && end >= duration - 0.5 ? duration - 0.001 : end;
        }
    };

    const hashVideoId = async (id) => {
        const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
        return Array.from(new Uint8Array(buffer))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
            .slice(0, 4);
    };

    const fetchSegments = async (id) => {
        if (processing || !id || cache[id]) return;
        processing = true;

        try {
            const hash = await hashVideoId(id);
            const res = await fetch(
                `${API}${hash}?categories=["sponsor","selfpromo"]&actionTypes=["skip"]`,
                {
                    signal: AbortSignal.timeout(5000),
                }
            );

            if (res.ok) {
                const data = await res.json();
                const filtered =
                    data
                        .find((v) => v.videoID === id)
                        ?.segments?.filter(
                            (s) =>
                                (s.category === 'sponsor' || s.category === 'selfpromo') &&
                                s.actionType === 'skip'
                        ) || [];

                cache[id] = filtered;
                localStorage.sponsorblock_cache = JSON.stringify(cache);
                segments = filtered;
            }
        } catch {}

        processing = false;
    };

    const update = () => {
        if (!/\/watch/.test(location.pathname)) {
            segments = [];
            return;
        }

        const id = getVideoId();
        if (!id) return;

        if (id !== currentId) {
            currentId = id;
            segments = cache[id] || [];
            if (!cache[id]) fetchSegments(id);
        }

        segments.forEach(skip);
    };

    setInterval(update, 100);
    new MutationObserver(update).observe(document.body, { childList: true, subtree: true });
    update();
})();
