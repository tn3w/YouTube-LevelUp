(() => {
    'use strict';

    const preventBackgroundPause = () => {
        const visibilityEvents = ['visibilitychange', 'webkitvisibilitychange', 'blur', 'pagehide'];

        for (const eventName of visibilityEvents) {
            window.addEventListener(
                eventName,
                (event) => {
                    event.stopImmediatePropagation();
                },
                true
            );
        }
    };

    const overrideVisibilityProperties = () => {
        Object.defineProperty(document, 'hidden', {
            get: () => false,
            configurable: true,
        });

        Object.defineProperty(document, 'webkitHidden', {
            get: () => false,
            configurable: true,
        });

        Object.defineProperty(document, 'visibilityState', {
            get: () => 'visible',
            configurable: true,
        });

        Object.defineProperty(document, 'webkitVisibilityState', {
            get: () => 'visible',
            configurable: true,
        });
    };

    const preventAudioContextSuspension = () => {
        AudioContext.prototype.suspend = function () {
            return Promise.resolve();
        };

        AudioContext.prototype.close = function () {
            return Promise.resolve();
        };
    };

    const maintainVideoPlayback = () => {
        const observer = new MutationObserver(() => {
            const video = document.querySelector('video');
            if (!video) return;

            if (video.paused && video.readyState >= 2) {
                video.play().catch(() => {});
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        setInterval(() => {
            const video = document.querySelector('video');
            if (!video) return;

            if (video.paused && video.readyState >= 2) {
                video.play().catch(() => {});
            }
        }, 1000);
    };

    preventBackgroundPause();
    overrideVisibilityProperties();
    preventAudioContextSuspension();
    maintainVideoPlayback();
})();
