(() => {
    const API = 'https://sponsor.ajay.app/api/skipSegments/';
    const SKIP_BUFFER = 0.003;
    const END_TIME_SKIP_BUFFER = 0.5;
    const CACHE_TTL = 3600000;

    let cache = {};
    let currentId = null;
    let segments = [];
    let pendingList = {};
    let lastSkipTime = 0;
    let skippedSegments = new Set();

    try {
        const stored = JSON.parse(localStorage.sponsorblock_cache) || {};
        cache = Object.fromEntries(
            Object.entries(stored).filter(([_, v]) => Date.now() - v.timestamp < CACHE_TTL)
        );
    } catch {}

    const getVideoId = () => {
        const url = new URL(location.href);
        if (url.pathname.startsWith('/clip')) {
            return document.querySelector("meta[itemprop='videoId'], meta[itemprop='identifier']")
                ?.content;
        }
        return url.searchParams.get('v');
    };

    const getVideo = () => {
        const videos = [...document.querySelectorAll('video')].filter(
            (v) => v.offsetWidth > 0 && v.offsetHeight > 0
        );
        return videos[0];
    };

    const skip = (segment) => {
        const video = getVideo();
        if (!video) return;

        const [start, end] = segment.segment;
        const { currentTime, duration } = video;

        if (currentTime < start - SKIP_BUFFER || currentTime >= end) return;
        if (Date.now() - lastSkipTime < 500) return;

        const clampedEnd = Math.min(end, duration);
        let skipTo = clampedEnd;

        if (video.loop && duration > 1 && clampedEnd >= duration - 1) {
            skipTo = 0;
        } else if (duration > 1 && Math.abs(clampedEnd - duration) < END_TIME_SKIP_BUFFER) {
            skipTo = duration - 0.001;
        }

        if (currentTime !== skipTo) {
            video.currentTime = skipTo;
            lastSkipTime = Date.now();
            skippedSegments.add(segment.UUID);
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
        if (pendingList[id]) return await pendingList[id];
        if (!id) return;

        const cached = cache[id];
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.segments;
        }

        const pendingData = (async () => {
            try {
                const hash = await hashVideoId(id);
                const res = await fetch(
                    `${API}${hash}?categories=["sponsor","selfpromo"]&actionTypes=["skip"]`,
                    { signal: AbortSignal.timeout(5000) }
                );

                if (res.ok) {
                    const data = await res.json();
                    const videoData = data.find((v) => v.videoID === id);
                    const filtered =
                        videoData?.segments
                            ?.filter(
                                (s) =>
                                    (s.category === 'sponsor' || s.category === 'selfpromo') &&
                                    s.actionType === 'skip' &&
                                    s.segment?.length === 2 &&
                                    s.segment[1] > s.segment[0]
                            )
                            .sort((a, b) => a.segment[0] - b.segment[0]) || [];

                    cache[id] = { segments: filtered, timestamp: Date.now() };
                    localStorage.sponsorblock_cache = JSON.stringify(cache);
                    return filtered;
                }
            } catch {}
            return [];
        })();

        pendingList[id] = pendingData;
        try {
            return await pendingData;
        } finally {
            delete pendingList[id];
        }
    };

    const getProgressBar = () => {
        const bars = document.querySelectorAll('.ytp-progress-bar');
        return [...bars].find((bar) => bar.offsetWidth > 0) || bars[0];
    };

    const timeToPercentage = (time, duration, progressBar) => {
        const chapters = progressBar?.parentElement?.querySelector('.ytp-chapters-container');
        if (!chapters || chapters.children.length <= 1) {
            return (time / duration) * 100;
        }
        return (time / duration) * 100;
    };

    const renderMarkers = () => {
        const progressBar = getProgressBar();
        if (!progressBar) return;

        const video = getVideo();
        if (!video?.duration) return;

        document.querySelectorAll('.skip-segment-marker').forEach((m) => m.remove());

        const duration = video.duration;
        segments.forEach((segment) => {
            const [startTime, endTime] = segment.segment;
            if (endTime <= startTime) return;

            const marker = document.createElement('div');
            marker.className = 'skip-segment-marker';
            const leftPos = timeToPercentage(startTime, duration, progressBar);
            const rightPos = timeToPercentage(endTime, duration, progressBar);
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
    };

    const update = () => {
        if (!/\/watch/.test(location.pathname)) {
            segments = [];
            skippedSegments.clear();
            return;
        }

        const id = getVideoId();
        if (!id) return;

        if (id !== currentId) {
            currentId = id;
            skippedSegments.clear();

            const cached = cache[id];
            segments = cached && Date.now() - cached.timestamp < CACHE_TTL ? cached.segments : [];

            if (!cached || Date.now() - cached.timestamp >= CACHE_TTL) {
                fetchSegments(id).then((segs) => {
                    segments = segs || [];
                    renderMarkers();
                });
            }
        }

        segments.forEach(skip);
    };

    let renderTimeout;
    const scheduleRender = () => {
        clearTimeout(renderTimeout);
        renderTimeout = setTimeout(renderMarkers, 100);
    };

    setInterval(update, 100);

    const observer = new MutationObserver(() => {
        update();
        scheduleRender();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('yt-navigate-finish', () => {
        currentId = null;
        update();
    });

    update();
})();
