# Fake Urgency Detector

This is a Chrome browser extension that automatically detects and marks fake urgency dark patterns on e-commerce and other websites - including countdown timers and limited-quantity indicators that may be manipulative or deceptive.

---

## What It Does

Many websites use psychological pressure tactics to push users into quick decisions. This extension detects two main categories:

**Countdown timers** - elements that visually count down to create a sense of time pressure (e.g. "Offer ends in 00:14:32"). The extension watches the DOM for numeric elements that actively decrease over time, then automatically tests whether the timer is genuine or fake.

**Limited quantity indicators** - text claiming scarcity (e.g. "Only 3 left in stock!", "12 people are viewing this"). The extension scans for these phrases in both English and Lithuanian and flags suspicious ones.

Once detected, each element is:
- **Highlighted on the page** with a colored dashed border (red for timers, orange for quantity indicators)
- **Saved to extension storage** so it can be reviewed in the popup
- **Automatically tested** in the background to determine if it's real, fake, or suspicious

### How Detection Works

**Timer detection** uses a MutationObserver to watch for DOM nodes that contain short numeric values (1–2 digits) and update over time. A candidate element is only flagged after a 3-second observation window confirms the numbers are actually decreasing. Split timers (where hours, minutes, and seconds are separate DOM nodes) are handled by climbing the DOM tree to find a shared parent.

**Quantity detection** uses regex pattern matching in both English and Lithuanian against a curated list of scarcity and social pressure phrases.

### How Testing Works

After detection, the background service worker runs up to five automated tests for each timer:

| Test | What it checks |
|---|---|
| **Persistence** | Does the timer still exist if the page is reloaded? |
| **Expiration** | Did the timer actually reach zero and stop, or did it reset? |
| **Cross-session** | Does the timer show a different (non-personalized) value in an Incognito window? |
| **Backend link** | Does the page make XHR/fetch network requests related to timing or pricing? |
| **Reappearance** | After the timer supposedly expires, does it reappear or reset? |

Tests run in hidden background tabs (with a `?fake_urgency_test=1` query parameter, which the content script ignores to avoid infinite loops). Up to 2 tests run in parallel. Each test is scored and weighted to produce a final **0–100 score** and one of three verdicts: **Real**, **Suspicious**, or **Fake (Deceptive)**.

---

## Files in This Repository

| File | Purpose |
|---|---|
| `manifest.json` | Extension manifest (MV3). Declares permissions, registers the content script and service worker. |
| `content.js` | Injected into every page. Watches the DOM for countdown timers and quantity indicators, marks them visually, and sends detections to the background. |
| `background.js` | Service worker. Receives detections, saves them to `chrome.storage.local`, and runs the automated authenticity tests in background tabs. |
| `popup.html` | HTML shell for the extension popup. |
| `popup.js` | Popup logic. Reads saved detections from storage and renders them grouped by site, with per-timer test results and classification scores. |
| `style.css` | Injected stylesheet. Adds dashed red/orange outlines to flagged elements on the page. |

---

## Installation

This extension is loaded as an **unpacked extension** directly from source - no build step or bundler is required.

### Prerequisites

- Google Chrome (or any Chromium-based browser such as Edge or Brave)
- No Node.js or other tooling needed

### Steps

1. **Download or clone this repository** to a folder on your computer.

2. **Open Chrome** and navigate to `chrome://extensions`.

3. **Enable Developer Mode** using the toggle in the top-right corner of the page.

4. Click **"Load unpacked"**.

5. **Select the folder** containing the extension files (the one with `manifest.json` in it).

6. The extension will appear in your list as **"Fake Urgency Detector"** and its icon will appear in the Chrome toolbar.

> If you make changes to any source file, go back to `chrome://extensions` and click the **refresh icon** on the extension card to reload it.

---

## Usage

1. Browse any website normally. The extension runs automatically in the background.
> Additional tabs in the browser may be opened for a moment, this is normal. These new tabs ar used by the extension for timer legitimacy testing and will be closed automaticaly

3. If a countdown timer or limited-quantity indicator is detected, it will be **visually highlighted on the page**:
   - Red dashed border → countdown timer
   - Orange dashed border → quantity/scarcity indicator

4. Click the **extension icon** in the toolbar to open the popup. It shows:
   - All detections on the **current page**, with timestamps and expiry info
   - Detections from **other previously visited sites**, grouped by hostname
   - The **test status and verdict** (Real / Suspicious / Fake) for each detection, with a score bar and the individual test results

5. Use the **"Highlight on Page"** button in the popup to scroll to and flash a specific detected element.

6. Click **"Clear All Saved"** to wipe the stored detection history.

---

## Permissions Used

| Permission | Why it's needed |
|---|---|
| `activeTab` | To highlight elements on the currently open tab |
| `scripting` | To inject the highlight script and run tests in background tabs |
| `tabs` | To open hidden background tabs for automated testing |
| `storage` | To persist detected timers across popup opens |
| `host_permissions: <all_urls>` | To run the content script on all websites |

---

## Notes

- The extension does **not** send any data externally. All detection, testing, and storage is local to your browser.
- The cross-session test requires that Chrome allows the extension in Incognito mode. You can enable this on the extension's detail page at `chrome://extensions`.
- Tests involving timer expiration (the reappearance test) may take up to ~20 seconds to complete after a detection.
- The extension includes pattern matching for both **English** and **Lithuanian** language sites.
