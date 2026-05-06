# Bug: Calendar shows blank page after Notion bundle update detects Electron

**Issue:** untracked
**Status:** Approved
**Created:** 2026-05-06

## Problem Statement

**Actual:** The app opens to a blank page. The Notion login or download page opens in the system browser instead of staying in-app. In the console: `[NC] will-navigate -> https://www.notion.com/product/calendar/download BLOCKED->external` fires twice before `did-finish-load https://calendar.notion.so/`.

**Expected:** The calendar web app loads normally inside the Electron window. Login (email/password) stays in-app.

**Root cause (updated after diagnosis):** Notion redeployed the calendar bundle on May 5 2026. The app steers unofficial Electron wrappers to `https://www.notion.com/product/calendar/download` (URL not present as a literal in the static bundle — likely Statsig / remote config). Our hostname allowlist blocks that navigation, so the shell stays on `calendar.notion.so` with an empty `#main`.

Evidence from a live run: `navigator.userAgent` in the renderer already matched the macOS spoof string (no `Electron` token), but **`navigator.platform` remained `Linux x86_64`** — Chromium does not allow reliably overriding `platform` on the `navigator` instance. Feature gates may also use **Client Hints** (`Sec-CH-UA-Platform: "Linux"`) on outbound requests even when `User-Agent` is macOS-shaped. Separately, Notion’s **HTML CSP** allows `script-src` only from `'self'` (no `'unsafe-inline'`), so the preload’s **inline** main-world injection was **blocked** — the shell HTML loads but the bundle never runs (`#main` stays empty). Reload could then hit code paths that still saw Electron / Linux and triggered the download redirect.

A separate bug: **`attachWebNavigationGuards` was registered twice** (both in `createWindow` and `browser-window-created`), which doubled `will-navigate` logging.

**Fix (implemented):** (1) Strip `Content-Security-Policy` (and report-only) from **HTML** responses for `https://calendar.notion.so/*` so the preload’s inline main-world spoof is not blocked by `script-src` (no `'unsafe-inline'`). (2) Spoof macOS **Client Hints** on every outgoing request. (3) Preload `Navigator.prototype` spoof with idempotent `window.__notionCalendarNavSpoofApplied` and a `readystatechange` fallback if `<html>` is not ready yet. (4) Single `attachWebNavigationGuards` registration.

## Acceptance Criteria

| # | Criterion | Test Type |
|---|-----------|-----------|
| 1 | Launching the app loads `calendar.notion.so` without any `will-navigate` to `notion.com/product/calendar/download` | Manual |
| 2 | `navigator.userAgent` inside the renderer does NOT contain the string `Electron` | Manual (DevTools console) |
| 3 | `navigator.userAgent` inside the renderer does NOT contain `Linux` (secondary detection) | Manual (DevTools console) |
| 4 | Email/password login flow stays inside the app window (no external browser opens) | Manual |
| 5 | After login, either the calendar renders on `calendar.notion.so`, or you can return with **View → Open Notion Calendar (home)** once the session cookie exists (Notion may redirect to main Notion; see limitations) | Manual |
| 6 | Navigation to external URLs (e.g. Google OAuth, marketing pages) still opens in system browser | Manual |

## Non-Goals

- Not fixing OAuth / social sign-in (pre-existing known limitation)
- Not reverse-engineering what Statsig gate Notion uses — focus on preventing the detection from firing
- Not modifying Notion's bundle or intercepting Statsig API responses

## Security Considerations

- **Impact:** Minimal. The UA override is a presentation-layer spoof to an external site that already knows we're Linux. No auth, PII, or privilege surface affected.
- The `isAllowedUrl` change (accepting non-http schemes) should be reviewed: `blob:` and `about:` returning `true` is correct for navigation guards but broadens what `isTrustedNotificationSender` would accept if not for its explicit `about:blank` guard. Currently safe; worth a comment.

## Technical Notes

**Files involved:**
- `src/main/index.ts` — `CHROME_UA`, `applyMacClientHints`, `session.setUserAgent`, `onBeforeSendHeaders`, navigation guards
- `src/preload/index.ts` — main-world `Navigator.prototype` spoof

**Key discovery from bundle analysis:**
```javascript
const h = /electron/i.test(navigator.userAgent);  // isElectron flag
// h=true → R() returns "electron", L() returns "web-electron"
// bundle also checks window.electron?.platform (official app API we don't expose)
// download URL not literal in bundle — likely from Statsig or runtime construction
```

**Fix approach (implemented):**
1. Spoof macOS **Client Hints** on every outgoing request (`applyMacClientHints` in `onBeforeSendHeaders`) so Statsig / backend gates do not see `Sec-CH-UA-Platform: "Linux"`.
2. Preload injects a synchronous main-world script that overrides **`Navigator.prototype`** for `userAgent`, `platform`, and `userAgentData` before deferred bundle JS runs.
3. Register **`attachWebNavigationGuards` only from `browser-window-created`** (removed duplicate call from `createWindow`).

**Reproduction:**
1. `./node_modules/.bin/electron out/main/index.js --no-sandbox`
2. Observe `[NC] will-navigate` to `notion.com/product/calendar/download` before `did-finish-load`
3. App window shows blank dark page
