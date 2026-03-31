import {
  BrowserWindow,
  Tray,
  Menu,
  Notification,
  app,
  shell,
  session,
  ipcMain,
  nativeImage,
} from "electron";
import * as path from "path";
import { optimizer } from "@electron-toolkit/utils";
import config from "./config";

const host = "https://calendar.notion.so";
const otherAllowedHosts = ["https://calendar-api.notion.so"];

const CHROME_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const startsWithAny = (haystack: string, needles: string[]): boolean =>
  needles.some((needle) => haystack.startsWith(needle));

const NOTIFICATION_PATCH_SCRIPT = `
(function () {
  if (window.__notionCalendarNotificationPatched) return;
  window.__notionCalendarNotificationPatched = true;
  var Native = window.Notification;
  function ForwardingNotification(title, options) {
    options = options || {};
    var body = options.body != null ? String(options.body) : "";
    if (window.notionCalendar && typeof window.notionCalendar.showNotification === "function") {
      window.notionCalendar.showNotification(String(title), body);
    }
    var fake = Object.create(Native.prototype);
    fake.title = String(title);
    fake.body = body;
    fake.tag = options.tag != null ? String(options.tag) : "";
    fake.silent = !!options.silent;
    fake.close = function () {};
    fake.onclick = null;
    fake.onerror = null;
    fake.onshow = null;
    fake.onclose = null;
    return fake;
  }
  ForwardingNotification.prototype = Native.prototype;
  Object.defineProperty(ForwardingNotification, "permission", {
    get: function () { return "granted"; },
  });
  ForwardingNotification.requestPermission = function () {
    return Promise.resolve("granted");
  };
  window.Notification = ForwardingNotification;
  try {
    var SWReg = window.ServiceWorkerRegistration;
    if (SWReg && SWReg.prototype && SWReg.prototype.showNotification) {
      var origShow = SWReg.prototype.showNotification;
      SWReg.prototype.showNotification = function (title, options) {
        options = options || {};
        var b = options.body != null ? String(options.body) : "";
        if (window.notionCalendar && typeof window.notionCalendar.showNotification === "function") {
          window.notionCalendar.showNotification(String(title), b);
        }
        return origShow.apply(this, arguments);
      };
    }
  } catch (e) {}
})();
`;

function getAppIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "build", "icon.png");
  }
  return path.join(__dirname, "..", "..", "build", "icon.png");
}

function setupAppMenu(): void {
  const viewMenu: Electron.MenuItemConstructorOptions = {
    label: "View",
    submenu: [
      { role: "reload" },
      { type: "separator" },
      {
        label: "Toggle Developer Tools",
        accelerator: "CmdOrCtrl+Shift+I",
        click: (_item, focusedWindow) => {
          if (focusedWindow) focusedWindow.webContents.toggleDevTools();
        },
      },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
    ],
  };

  const template: Electron.MenuItemConstructorOptions[] =
    process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
          viewMenu,
        ]
      : [
          {
            label: "File",
            submenu: [{ role: "quit" }],
          },
          viewMenu,
        ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): BrowserWindow {
  const lastState = config.store.lastWindowState;

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: lastState.width,
    height: lastState.height,
    show: false,
    autoHideMenuBar: true,
    icon: getAppIconPath(),
    title: "Notion Calendar",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
    },
  };

  if (lastState.x !== undefined && lastState.y !== undefined) {
    windowOptions.x = lastState.x;
    windowOptions.y = lastState.y;
  }

  const window = new BrowserWindow(windowOptions);

  window.webContents.on("before-input-event", (_event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F12" || (input.control && input.shift && input.key.toLowerCase() === "i")) {
      window.webContents.toggleDevTools();
    }
  });

  window.on("ready-to-show", () => {
    window.show();
  });

  window.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (!startsWithAny(url, [host, ...otherAllowedHosts])) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!startsWithAny(url, [host, ...otherAllowedHosts])) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  window.webContents.once("dom-ready", () => {
    window.webContents.executeJavaScript(NOTIFICATION_PATCH_SCRIPT, false).catch(() => {});
  });

  window.loadURL(host, { userAgent: CHROME_UA });

  return window;
}

function createTray(): Tray {
  const iconPath = getAppIconPath();
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 24, height: 24 });
  const appTray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show / Hide",
      click: () => {
        if (mainWindow?.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow?.show();
          mainWindow?.focus();
        }
      },
    },
    {
      label: "Developer Tools",
      click: () => {
        mainWindow?.webContents.toggleDevTools();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  appTray.setToolTip("Notion Calendar");
  appTray.setContextMenu(contextMenu);

  appTray.on("click", () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  return appTray;
}

function saveWindowState(): void {
  if (!mainWindow) return;
  const bounds = mainWindow.getNormalBounds();
  config.set("lastWindowState.width", bounds.width);
  config.set("lastWindowState.height", bounds.height);
  config.set("lastWindowState.x", bounds.x);
  config.set("lastWindowState.y", bounds.y);
}

function isTrustedNotificationSender(event: Electron.IpcMainEvent): boolean {
  const sender = event.sender;
  if (!sender || sender.isDestroyed()) return false;
  try {
    const url = sender.getURL();
    if (!url || url === "about:blank") return true;
    return startsWithAny(url, [host, ...otherAllowedHosts]);
  } catch {
    return false;
  }
}

function dispatchNativeNotification(data: unknown): void {
  if (!data || typeof data !== "object") return;
  const { title, body } = data as Record<string, unknown>;
  if (typeof title !== "string" || typeof body !== "string") return;

  if (!Notification.isSupported()) return;

  const notif = new Notification({
    title: title.slice(0, 256),
    body: body.slice(0, 1024),
    icon: getAppIconPath(),
    urgency: "critical",
  });

  notif.on("click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  notif.show();
}

function registerServiceWorkerPreload(sess: Electron.Session): void {
  const swPath = path.normalize(path.join(__dirname, "..", "preload", "sw.js"));
  sess.registerPreloadScript({
    type: "service-worker",
    filePath: swPath,
  });
}

function setupServiceWorkerNotificationBridge(sess: Electron.Session): void {
  const attachWorker = (worker: Electron.ServiceWorkerMain): void => {
    if (!worker.scope.startsWith(host)) return;
    worker.ipc.removeAllListeners("show-notification");
    worker.ipc.on("show-notification", (event, data: unknown) => {
      if (!event.serviceWorker.scope.startsWith(host)) return;
      dispatchNativeNotification(data);
    });
  };

  sess.serviceWorkers.on("registration-completed", async (_event, details) => {
    if (!details.scope.startsWith(host)) return;
    try {
      const worker = await sess.serviceWorkers.startWorkerForScope(details.scope);
      if (worker) attachWorker(worker);
    } catch {
      /* worker may already be running or scope unavailable */
    }
  });

  setTimeout(() => {
    try {
      const running = sess.serviceWorkers.getAllRunning();
      for (const versionId of Object.keys(running)) {
        const worker = sess.serviceWorkers.getWorkerFromVersionID(Number(versionId));
        if (worker) attachWorker(worker);
      }
    } catch {
      /* ignore */
    }
  }, 2000);
}

function setupNotificationForwarding(): void {
  ipcMain.on("show-notification", (event, data: unknown) => {
    if (!isTrustedNotificationSender(event)) return;
    dispatchNativeNotification(data);
  });
}

function setupPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === "notifications") {
      callback(true);
      return;
    }
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === "notifications") {
      return true;
    }
    return false;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    registerServiceWorkerPreload(session.defaultSession);

    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      details.requestHeaders["User-Agent"] = CHROME_UA;
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    });

    app.on("browser-window-created", (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    setupPermissions();
    setupNotificationForwarding();
    setupServiceWorkerNotificationBridge(session.defaultSession);
    setupAppMenu();

    session.defaultSession.setUserAgent(CHROME_UA);
    mainWindow = createWindow();
    tray = createTray();

    app.on("before-quit", () => {
      isQuitting = true;
      saveWindowState();
    });
  });
}
