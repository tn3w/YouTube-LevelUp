function hide() {
    document
        .querySelectorAll(
            `
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
        ytd-notification-renderer:has([href^="/shorts/"])`
        )
        .forEach((el) => (el.style.display = 'none'));
}

hide();
new MutationObserver(hide).observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
});
