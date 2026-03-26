'use strict';

const api = typeof browser !== 'undefined' ? browser : chrome;
const store = api.storage.local;

const luminance = (color) => {
    if (!color) return 200;
    let r, g, b;
    if (Array.isArray(color)) {
        [r, g, b] = color;
    } else if (typeof color === 'string') {
        const m = color.match(/\d+/g);
        if (!m || m.length < 3) return 200;
        [r, g, b] = m.map(Number);
    } else {
        return 200;
    }
    return (r * 299 + g * 587 + b * 114) / 1000;
};

const detectTheme = async () => {
    try {
        if (api.theme?.getCurrent) {
            const theme = await api.theme.getCurrent();
            const bg = theme?.colors?.popup || theme?.colors?.frame || theme?.colors?.toolbar;
            if (bg) return luminance(bg) < 128 ? 'dark' : 'light';
        }
    } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

detectTheme().then((theme) => {
    document.documentElement.dataset.theme = theme;
});

const DEFAULTS = {
    features: {
        dislikes: true,
        sponsors: true,
        shortsBlocker: true,
        membersBlocker: true,
        continueWatching: true,
        antiTranslate: true,
        backgroundPlayback: true,
    },
    categories: {
        sponsor: true,
        selfpromo: true,
        exclusive_access: false,
        interaction: false,
        poi_highlight: false,
        intro: false,
        outro: false,
        preview: false,
        filler: false,
        music_offtopic: false,
    },
    musicOnlySkip: false,
};

const FEATURES = [
    { id: 'dislikes', name: 'Return Dislikes' },
    { id: 'sponsors', name: 'Sponsor Skip' },
    { id: 'shortsBlocker', name: 'Block Shorts' },
    { id: 'membersBlocker', name: 'Block Members-Only' },
    { id: 'continueWatching', name: 'Auto Continue' },
    { id: 'antiTranslate', name: 'Anti-Translate' },
    { id: 'backgroundPlayback', name: 'Background Playback' },
];

const CATEGORIES = [
    { id: 'sponsor', name: 'Sponsor' },
    { id: 'selfpromo', name: 'Self Promotion' },
    { id: 'exclusive_access', name: 'Exclusive Access' },
    { id: 'interaction', name: 'Interaction Reminder' },
    { id: 'poi_highlight', name: 'Highlight' },
    { id: 'intro', name: 'Intro/Intermission' },
    { id: 'outro', name: 'Endcards/Credits' },
    { id: 'preview', name: 'Preview/Recap' },
    { id: 'filler', name: 'Tangents/Jokes' },
    { id: 'music_offtopic', name: 'Non-Music Section' },
];

let settings = JSON.parse(JSON.stringify(DEFAULTS));

const save = () =>
    store.set({
        settings: JSON.parse(JSON.stringify(settings)),
    });

const merge = (stored) => {
    if (!stored) return;
    for (const [key, val] of Object.entries(stored)) {
        if (typeof val === 'object' && val !== null && settings[key]) {
            Object.assign(settings[key], val);
        } else {
            settings[key] = val;
        }
    }
};

const makeToggle = (checked, onChange) => {
    const label = document.createElement('label');
    label.className = 'toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => {
        onChange(input.checked);
        save();
    });
    const track = document.createElement('span');
    track.className = 'track';
    label.append(input, track);
    return label;
};

const makeRow = (name, checked, onChange) => {
    const el = document.createElement('div');
    el.className = 'row';
    const n = document.createElement('span');
    n.className = 'name';
    n.textContent = name;
    el.append(n, makeToggle(checked, onChange));
    return el;
};

const build = () => {
    const fc = document.getElementById('features');
    for (const f of FEATURES) {
        fc.appendChild(
            makeRow(f.name, settings.features[f.id], (v) => {
                settings.features[f.id] = v;
            })
        );
    }

    const cc = document.getElementById('categories');
    for (const c of CATEGORIES) {
        cc.appendChild(
            makeRow(c.name, settings.categories[c.id], (v) => {
                settings.categories[c.id] = v;
            })
        );
    }
    cc.appendChild(
        makeRow('Music: skip only on YT Music', settings.musicOnlySkip, (v) => {
            settings.musicOnlySkip = v;
        })
    );

    const toggle = document.getElementById('sp-toggle');
    const body = document.getElementById('categories');
    toggle.addEventListener('click', () => {
        toggle.classList.toggle('open');
        body.classList.toggle('open');
    });
};

document.getElementById('version').textContent = api.runtime.getManifest().version;

store.get('settings').then((data) => {
    merge(data.settings);
    build();
});
