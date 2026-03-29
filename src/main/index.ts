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

function createWindow(): BrowserWindow {
  const lastState = config.store.lastWindowState;

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: lastState.width,
    height: lastState.height,
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "..", "build", "icon.png"),
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

  window.loadURL(host, { userAgent: CHROME_UA });

  return window;
}

function createTray(): Tray {
  const iconPath = path.join(__dirname, "..", "..", "build", "icon.png");
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

function setupNotificationForwarding(): void {
  ipcMain.on("show-notification", (event, data: unknown) => {
    if (mainWindow && event.senderFrame?.url && !startsWithAny(event.senderFrame.url, [host, ...otherAllowedHosts])) {
      return;
    }

    if (!data || typeof data !== "object") return;
    const { title, body } = data as Record<string, unknown>;
    if (typeof title !== "string" || typeof body !== "string") return;

    const notif = new Notification({
      title: title.slice(0, 256),
      body: body.slice(0, 1024),
      icon: path.join(__dirname, "..", "..", "build", "icon.png"),
    });

    notif.on("click", () => {
      mainWindow?.show();
      mainWindow?.focus();
    });

    notif.show();
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
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      details.requestHeaders["User-Agent"] = CHROME_UA;
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    });

    app.on("browser-window-created", (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    setupPermissions();
    setupNotificationForwarding();

    session.defaultSession.setUserAgent(CHROME_UA);
    mainWindow = createWindow();
    tray = createTray();

    app.on("before-quit", () => {
      isQuitting = true;
      saveWindowState();
    });
  });
}
