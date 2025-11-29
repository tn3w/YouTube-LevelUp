# YouTube LevelUp 🚀

**The Ultimate All-in-One YouTube Enhancement Extension**

Transform your YouTube experience with the most comprehensive upgrade extension available. YouTube LevelUp combines five essential improvements into a single, lightweight browser extension that makes YouTube work the way it should have from the beginning.

## Features

### Ad Blocker
- Blocks video ads, banner ads, and overlay ads
- Works on all YouTube domains: youtube.com, music.youtube.com, youtube-nocookie.com, and embeds
- Network-level blocking prevents ad requests from loading
- Intercepts and prunes ad data from YouTube's API responses
- Auto-skips any ads that slip through
- Hides promotional content, merch shelves, and sponsored elements

### Shorts Blocker
- Removes Shorts tabs from navigation
- Hides Shorts shelves from feeds and search results
- Works across desktop, mobile, and YouTube Music

### Dislike Counter Restoration 
- Shows real dislike counts using Return YouTube Dislike API
- Integrates seamlessly with existing like/dislike buttons
- Caches results locally for faster loading

### Smart Sponsor Skipping
- Automatically skips sponsor segments using SponsorBlock database
- Uses hashed video IDs for privacy protection
- Sub-second accuracy with community-submitted timings

### Auto-Continue Watching
- Bypasses "Are you still watching?" popups automatically
- Only works when actively using the browser
- Prevents unwanted pausing during active sessions

## Supported Domains

- `youtube.com` - Main desktop site
- `www.youtube.com` - Main desktop site
- `m.youtube.com` - Mobile site
- `music.youtube.com` - YouTube Music
- `youtube-nocookie.com` - Privacy-enhanced embeds
- `www.youtube-nocookie.com` - Privacy-enhanced embeds
- All embedded players on third-party sites

## Installation

### Chrome/Edge/Brave (Manifest V3)
1. Download or clone this repository
2. Rename `manifest_chrome.json` to `manifest.json` (backup the original)
3. Go to `chrome://extensions/`
4. Enable Developer mode
5. Click "Load unpacked" and select the extension folder

### Firefox (Manifest V2)
1. Download or clone this repository  
2. Go to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select `manifest.json`

## Privacy

- No tracking or analytics
- Local storage only for caches
- Minimal API usage (Return YouTube Dislike and SponsorBlock only)
- Open source - all code is auditable
- Only accesses necessary YouTube domains
- Ad blocking happens locally, no external ad-block services

## How It Works

### Ad Blocking
The extension uses a multi-layered approach:
1. **Network blocking** - Blocks ad-related URLs at the network level using declarativeNetRequest (Chrome) or webRequest (Firefox)
2. **JSON interception** - Intercepts `JSON.parse`, `fetch`, and `XMLHttpRequest` to remove ad data from API responses
3. **DOM hiding** - CSS rules hide any ad elements that make it through
4. **Auto-skip** - Detects and clicks skip buttons, or fast-forwards through unskippable ads

### Other Features
- DOM selectors hide Shorts elements
- Integrates with community APIs for dislikes and sponsor data
- Monitors user activity to handle popups intelligently

## Files

- `manifest.json` - Firefox manifest (MV2)
- `manifest_chrome.json` - Chrome/Edge manifest (MV3)
- `adblock.js` - Ad blocking content script (runs at document_start)
- `content.js` - Main features content script (runs at document_end)
- `background.js` - Firefox background script for network blocking
- `rules.json` - Chrome declarativeNetRequest rules

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
