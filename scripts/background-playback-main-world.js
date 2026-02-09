'use strict';

(() => {
    const originalHiddenDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    const originalVisibilityDesc = Object.getOwnPropertyDescriptor(
        Document.prototype,
        'visibilityState'
    );

    const CONFIG = {
        loopMin: 30000,
        loopMax: 60000,
        keys: [
            { code: 'ShiftLeft', key: 'Shift', keyCode: 16 },
            { code: 'ControlLeft', key: 'Control', keyCode: 17 },
            { code: 'AltLeft', key: 'Alt', keyCode: 18 },
        ],
        prePauseKickDelayMs: 40,
        prePauseKickBurst: 3,
        prePauseKickSpacingMs: 80,
    };

    let loopTimeout = null;
    let alternateFlip = false;
    let lastRealHidden = null;

    const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    const getRealHidden = () => {
        try {
            if (originalHiddenDesc && typeof originalHiddenDesc.get === 'function') {
                return !!originalHiddenDesc.get.call(document);
            }
        } catch {}
        return false;
    };

    const findVideoCandidate = () => {
        const videos = document.querySelectorAll('video');
        for (const v of videos) {
            if (!v) continue;
            if (v.ended) continue;
            if (v.readyState >= 2) return v;
        }
        return null;
    };

    const findPlayingVideo = () => {
        const videos = document.querySelectorAll('video');
        for (const v of videos) {
            if (!v) continue;
            if (!v.paused && !v.ended && v.readyState >= 2) return v;
        }
        return null;
    };

    const dispatchKeyboardKeepAlive = (targetEl) => {
        const keyObj = CONFIG.keys[getRandomInt(0, CONFIG.keys.length - 1)];
        const init = {
            bubbles: true,
            cancelable: true,
            key: keyObj.key,
            code: keyObj.code,
            keyCode: keyObj.keyCode,
            which: keyObj.keyCode,
        };

        const down = new KeyboardEvent('keydown', init);
        const up = new KeyboardEvent('keyup', init);

        const t = targetEl || document;
        t.dispatchEvent(down);
        setTimeout(() => t.dispatchEvent(up), 50);
    };

    const dispatchMouseKeepAlive = (targetEl) => {
        const t = targetEl || document;

        try {
            if (typeof PointerEvent !== 'undefined') {
                t.dispatchEvent(
                    new PointerEvent('pointermove', {
                        bubbles: true,
                        cancelable: false,
                        pointerType: 'mouse',
                        clientX: Math.random() * 100,
                        clientY: Math.random() * 100,
                    })
                );
                return;
            }
        } catch {}

        try {
            t.dispatchEvent(
                new MouseEvent('mousemove', {
                    bubbles: true,
                    cancelable: false,
                    clientX: Math.random() * 100,
                    clientY: Math.random() * 100,
                })
            );
        } catch {}
    };

    const dispatchKeepAlive = () => {
        const target = findPlayingVideo() || findVideoCandidate() || document;
        alternateFlip = !alternateFlip;

        if (alternateFlip) {
            dispatchKeyboardKeepAlive(target);
        } else {
            dispatchMouseKeepAlive(target);
        }
    };

    const shouldDispatchKeepAlive = () => {
        const realHidden = getRealHidden();
        if (!realHidden) return false;

        const v = findPlayingVideo() || findVideoCandidate();
        return !!v;
    };

    const clearLoop = () => {
        if (loopTimeout) {
            clearTimeout(loopTimeout);
            loopTimeout = null;
        }
    };

    const scheduleNext = () => {
        const nextRun = getRandomInt(CONFIG.loopMin, CONFIG.loopMax);
        loopTimeout = setTimeout(performKeepAliveTick, nextRun);
    };

    const performKeepAliveTick = () => {
        try {
            if (shouldDispatchKeepAlive()) {
                dispatchKeepAlive();
            }
        } catch {}
        scheduleNext();
    };

    const startLoop = () => {
        clearLoop();
        scheduleNext();
    };

    const schedulePrePauseKick = () => {
        setTimeout(() => {
            try {
                if (!getRealHidden()) return;

                for (let i = 0; i < CONFIG.prePauseKickBurst; i++) {
                    setTimeout(() => {
                        try {
                            if (!getRealHidden()) return;
                            dispatchKeepAlive();
                        } catch {}
                    }, i * CONFIG.prePauseKickSpacingMs);
                }
            } catch {}
        }, CONFIG.prePauseKickDelayMs);
    };

    Object.defineProperty(document, 'hidden', {
        configurable: true,
        enumerable: true,
        get() {
            return false;
        },
    });

    Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        enumerable: true,
        get() {
            return 'visible';
        },
    });

    const onVisChangeCapture = (evt) => {
        evt.stopImmediatePropagation();
        evt.preventDefault();

        const nowHidden = getRealHidden();
        if (lastRealHidden === null) lastRealHidden = nowHidden;

        if (nowHidden && lastRealHidden === false) {
            schedulePrePauseKick();
        }
        lastRealHidden = nowHidden;
    };

    document.addEventListener('visibilitychange', onVisChangeCapture, true);
    window.addEventListener('visibilitychange', onVisChangeCapture, true);

    startLoop();

    window.addEventListener('pagehide', clearLoop);
    window.addEventListener('unload', clearLoop);
})();
