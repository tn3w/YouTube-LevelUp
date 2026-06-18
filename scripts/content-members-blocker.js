(() => {
    'use strict';

    const BADGE_SELECTOR = [
        '.badge.badge-style-type-members-only',
        '.badge[aria-label*="Members" i]',
        'ytd-badge-supported-renderer .badge-style-type-members-only',
        'ytd-badge-supported-renderer .badge[aria-label*="Members" i]',
        'p.style-scope.ytd-badge-supported-renderer',
        'yt-badge-view-model badge-shape',
        'yt-badge-view-model .yt-badge-shape__text',
        '.badge-shape-wiz__text',
        '.yt-badge-shape__text',
    ].join(',');

    const MEDIA_SELECTOR = [
        'ytd-rich-grid-media',
        'ytd-video-renderer',
        'ytd-compact-video-renderer',
        'ytd-grid-video-renderer',
        'yt-lockup-view-model',
        'ytd-reel-item-renderer',
    ].join(',');

    const WRAPPER_SELECTOR = ['ytd-rich-item-renderer', 'ytd-rich-grid-row', MEDIA_SELECTOR].join(
        ','
    );

    const MEMBERS_KEYWORDS = [
        'member',
        'mitglied',
        'miembro',
        'membre',
        'membri',
        'membro',
        'membru',
        'leden',
        'człon',
        'clen',
        'участник',
        'メンバー',
        '会員',
        '会员',
        '멤버',
        '회원',
        'uye',
        'anggota',
        'medlem',
        'jasen',
        'thanh vien',
        'สมาชิก',
        'सदस्य',
        'عضو',
        'اعضاء',
        'أعضاء',
    ];

    const normalize = (text) =>
        (text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

    const isMembersBadge = (node) => {
        if (node.classList?.contains('badge-style-type-members-only')) return true;

        const text = normalize(node.textContent);
        const label = normalize(node.getAttribute?.('aria-label'));

        return MEMBERS_KEYWORDS.some((word) => text.includes(word) || label.includes(word));
    };

    const findWrapper = (badge) => {
        return (
            badge.closest('yt-lockup-view-model') ||
            badge.closest('ytd-rich-item-renderer') ||
            badge.closest('ytd-rich-grid-row') ||
            badge.closest(MEDIA_SELECTOR)
        );
    };

    const hideWrapper = (wrapper) => {
        if (!wrapper || wrapper.dataset.membersHidden) return;
        wrapper.style.display = 'none';
        wrapper.dataset.membersHidden = 'true';
    };

    const hideMembersOnly = (scope = document) => {
        const root = scope.nodeType === 1 || scope.shadowRoot ? scope : document;
        const searchRoot = root.shadowRoot || root;
        const badges = searchRoot.querySelectorAll(BADGE_SELECTOR);

        for (const badge of badges) {
            if (!isMembersBadge(badge)) continue;
            hideWrapper(findWrapper(badge));
        }
    };

    const injectStyles = () => {
        if (document.getElementById('members-blocker-style')) return;
        if (!CSS?.supports?.('selector(:has(*))')) return;

        const style = document.createElement('style');
        style.id = 'members-blocker-style';
        style.textContent = `
            ytd-rich-grid-media:has(.badge-style-type-members-only),
            ytd-video-renderer:has(.badge-style-type-members-only),
            ytd-compact-video-renderer:has(.badge-style-type-members-only),
            ytd-grid-video-renderer:has(.badge-style-type-members-only),
            yt-lockup-view-model:has(.badge-style-type-members-only),
            ytd-reel-item-renderer:has(.badge-style-type-members-only) {
                display: none !important;
            }
        `;
        document.documentElement.appendChild(style);
    };

    const hide = () => {
        injectStyles();
        hideMembersOnly();
    };

    hide();

    new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    const scope = node.closest?.(WRAPPER_SELECTOR) || node;
                    hideMembersOnly(scope);
                    if (node.shadowRoot) hideMembersOnly(node.shadowRoot);
                }
            }
        }
    }).observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
    });

    window.addEventListener('yt-navigate-finish', () => {
        queueMicrotask(hideMembersOnly);
        setTimeout(hideMembersOnly, 250);
    });
})();
