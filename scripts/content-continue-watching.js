(() => {
    const isMusic = location.hostname === 'music.youtube.com';
    const popupSelector = isMusic ? 'ytmusic-popup-container' : 'ytd-popup-container';
    const popupEventType = isMusic ? 'YTMUSIC-YOU-THERE-RENDERER' : 'YT-CONFIRM-DIALOG-RENDERER';

    let lastActivity = Date.now();

    ['mousedown', 'keydown'].forEach((event) =>
        document.addEventListener(event, () => (lastActivity = Date.now()))
    );

    document.addEventListener(
        'yt-popup-opened',
        (event) =>
            event.detail?.nodeName === popupEventType &&
            Date.now() - lastActivity > 3000 &&
            document.querySelector(popupSelector)?.click()
    );

    new MutationObserver(() => {
        const video = document.querySelector('video');
        if (video && !video._ynsOverridden) {
            video._ynsOverridden = video.pause;
            video.pause = () => Date.now() - lastActivity < 3000 && video._ynsOverridden();
        }
    }).observe(document.body, { childList: true, subtree: true });
})();
