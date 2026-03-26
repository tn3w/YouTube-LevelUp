# YouTube LevelUp 🚀

**The Ultimate All-in-One YouTube Enhancement Extension**

Transform your YouTube experience with the most comprehensive upgrade extension available. YouTube LevelUp combines six essential improvements into a single, lightweight browser extension that makes YouTube work the way it should have from the beginning.

[![Mozilla Add-on Rating](https://img.shields.io/amo/rating/youtube-levelup?style=for-the-badge&logo=firefox&logoSize=auto&label=Get%20for%20Firefox%20%7C%7C%20Rating%3A&color=orange)](https://addons.mozilla.org/firefox/addon/youtube-levelup/)

## Features

**Shorts Blocker**

- Removes Shorts tabs from navigation
- Hides Shorts shelves from feeds and search results
- Works across desktop, mobile, and YouTube Music

**Members-Only Content Blocker**

- Hides members-only videos from feeds and recommendations
- Detects both legacy and new YouTube badge layouts
- Removes clutter from channels you're not subscribed to

**Dislike Counter Restoration**

- Shows real dislike counts using Return YouTube Dislike API
- Integrates seamlessly with existing like/dislike buttons
- Caches results locally for faster loading

**Smart Sponsor Skipping**

- Automatically skips sponsor segments using SponsorBlock database
- Uses hashed video IDs for privacy protection
- Sub-second accuracy with community-submitted timings

**Auto-Continue Watching**

- Bypasses "Are you still watching?" popups automatically
- Only works when actively using the browser
- Prevents unwanted pausing during active sessions

**Anti-Translate**

- Restores original audio tracks on dubbed videos
- Shows original video descriptions instead of auto-translated text
- Works on desktop and mobile YouTube

**Background Playback**

- Keeps videos playing when tab is in background
- Prevents automatic pausing when switching tabs or windows
- Overrides visibility detection and audio context suspension
- Works on both YouTube and YouTube Music

## Manual Installation

**Chrome/Edge/Brave:**

1. Download or clone this repository
2. Go to chrome://extensions/
3. Enable Developer mode
4. Click "Load unpacked" and select the extension folder

**Firefox:**

1. Download or clone this repository
2. Go to about:debugging#/runtime/this-firefox
3. Click "Load Temporary Add-on"
4. Select manifest.json

## Settings

Click the extension toolbar icon to open the settings popup:

- **Feature toggles** - Enable/disable each feature individually (dislikes, sponsor skip, shorts blocker, members blocker, auto continue, anti-translate, background playback)
- **SponsorBlock categories** - Choose which segment types to auto-skip: Sponsor, Self Promotion, Exclusive Access, Interaction Reminder, Highlight, Intermission/Intro, Endcards/Credits, Preview/Recap, Tangents/Jokes, Non-Music Sections
- **Music options** - Restrict non-music section skipping to music.youtube.com only

Automatically adapts to your browser's light/dark theme.

## Privacy

- No tracking or analytics
- Local storage only for caches
- Minimal API usage (Return YouTube Dislike and SponsorBlock only)
- Open source - all code is auditable
- Only accesses necessary YouTube domains

## How It Works

The extension uses DOM selectors to hide Shorts elements, integrates with community APIs for dislikes and sponsor data, and monitors user activity to handle popups intelligently. All features work together seamlessly without conflicts.

## License

Copyright 2025 TN3W

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
