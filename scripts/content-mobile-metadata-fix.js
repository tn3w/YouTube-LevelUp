(() => {
    'use strict';

    const STYLE_ID = 'mobile-metadata-fix-style';

    const isMobile = () =>
        location.hostname === 'm.youtube.com';

    const injectStyles = () => {
        if (!isMobile()) return;
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            ytm-slim-video-metadata-section-renderer {
                position: relative !important;
                z-index: 2 !important;
            }
        `;
        document.documentElement.appendChild(style);
    };

    injectStyles();
})();
