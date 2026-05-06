# Bug: Notifications stop firing after the app has been open for a while

**Issue:** untracked
**Status:** Approved
**Created:** 2026-04-09

## Problem Statement

**Actual:** Notifications work when the app first launches but eventually stop entirely. Restarting the app restores them.

**Expected:** Notifications should fire reliably for the lifetime of the app session, including while the window is hidden in the tray.

**Root cause:** Two independent issues compound to break notifications over time:

### 1. `backgroundThrottling: app.isPackaged` starves renderer timers when the window is hidden

`backgroundThrottling` is `true` in production builds (line 196). When the user closes the window to the tray, Chromium treats the renderer as a background/hidden tab and aggressively throttles `setTimeout`/`setInterval` (up to 1-minute resolution for long-hidden tabs). Notion Calendar likely uses client-side timers to schedule notification triggers for upcoming events. Throttled timers mean those checks fire late or not at all.

This is the primary cause: a tray app that must fire time-sensitive notifications cannot have its renderer throttled when hidden.

### 2. `once("dom-ready")` means the notification patch is not re-injected after page reloads

The `NOTIFICATION_PATCH_SCRIPT` (which replaces `window.Notification` with the IPC-forwarding version) is injected via `window.webContents.once("dom-ready", ...)` (line 240). `.once()` consumes the handler after the first fire. If Notion Calendar does any full navigation — session refresh, auth redirect, app update, error recovery — `dom-ready` fires again but the handler is gone, so `window.Notification` reverts to the native (non-forwarding) constructor. After that, renderer-initiated notifications are silently swallowed by Electron's built-in `Notification` (which does not produce desktop notifications on Linux without extra setup).

The same issue applies to `did-finish-load` for the CSS inset (line 244), though that is cosmetic.

## Acceptance Criteria

| # | Criterion | Test Type |
|---|-----------|-----------|
| 1 | Notifications fire while the window is hidden in the tray for at least 2 hours in a packaged build | Manual |
| 2 | After a page reload (F5 or Ctrl+R), notifications continue to fire via `notify-send` | Manual |
| 3 | `backgroundThrottling` is `false` unconditionally so renderer timers are never starved | Unit |
| 4 | The notification patch script is re-injected on every `dom-ready`, not just the first | Unit |
| 5 | The CSS inset is re-applied on every `did-finish-load` | Unit |
| 6 | The `__notionCalendarNotificationPatched` guard in the injected script prevents double-patching within a single page lifecycle | Unit |

## Non-Goals

- Not redesigning the notification path (e.g. moving to push-based SW notifications managed by the main process timer)
- Not adding automated integration tests for notification timing (manual verification is sufficient)

## Security Considerations

- **Impact:** None. `backgroundThrottling: false` does not weaken the security model; it only prevents Chromium from deprioritizing the renderer. Re-injecting the patch script on every `dom-ready` is safe because the script's own guard (`__notionCalendarNotificationPatched`) prevents duplicate patching within a single page load, and `dom-ready` after a navigation starts a fresh JS context.

## Technical Notes

**Files involved:**

- `src/main/index.ts` — two changes:
  1. **Line 196:** Change `backgroundThrottling: app.isPackaged` → `backgroundThrottling: false`
  2. **Line 240:** Change `.once("dom-ready", ...)` → `.on("dom-ready", ...)`
  3. **Line 244:** Change `.once("did-finish-load", ...)` → `.on("did-finish-load", ...)` (consistency)

**Reproduction:**
1. Build with `npm run build:linux`, install the `.deb`
2. Open app, verify a notification fires for an upcoming event
3. Close to tray, wait 30+ minutes
4. Observe that scheduled notifications no longer appear
5. Alternatively: with `npm run dev`, press F5 to reload the page, then wait for a notification — it won't fire via `notify-send`
