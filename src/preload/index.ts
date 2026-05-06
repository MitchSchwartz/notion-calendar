import { contextBridge, ipcRenderer } from "electron";

// Main-world overrides before any page script runs. Notion's bundle checks
// /electron/i.test(navigator.userAgent); feature gates may also use
// navigator.platform, vendor, appVersion, webdriver, and Client Hints.
// `navigator.platform` is not reliably overridable on the instance — use
// Navigator.prototype. Spoof userAgentData so JS APIs align with the macOS
// UA we send on the wire (see main process + disable-blink-features).
(function injectNavigatorOverrides() {
  const SPOOF_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
  const brands = [
    { brand: "Chromium", version: "135" },
    { brand: "Google Chrome", version: "135" },
    { brand: "Not;A=Brand", version: "99" },
  ];
  const script = document.createElement("script");
  script.textContent = `(function(){
    if (window.__notionCalendarNavSpoofApplied) return;
    window.__notionCalendarNavSpoofApplied = true;
    try {
      if (typeof process !== "undefined" && process.versions) {
        delete process.versions.electron;
      }
    } catch (e) {}
    var UA = ${JSON.stringify(SPOOF_UA)};
    var brands = ${JSON.stringify(brands)};
    var fake = {
      brands: brands,
      mobile: false,
      platform: "macOS",
      toJSON: function () {
        return { brands: brands, mobile: false, platform: "macOS" };
      },
      getHighEntropyValues: function () {
        return Promise.resolve({
          architecture: "x86",
          bitness: "64",
          brands: brands,
          fullVersionList: [
            { brand: "Chromium", version: "135.0.0.0" },
            { brand: "Google Chrome", version: "135.0.0.0" },
            { brand: "Not;A=Brand", version: "99.0.0.0" },
          ],
          mobile: false,
          model: "",
          platform: "macOS",
          platformVersion: "15.0.0",
          uaFullVersion: "135.0.0.0",
          wow64: false,
        });
      },
    };
    try {
      Object.defineProperty(Navigator.prototype, "userAgent", {
        get: function () { return UA; },
        configurable: true,
      });
    } catch (e) {}
    try {
      Object.defineProperty(Navigator.prototype, "platform", {
        get: function () { return "MacIntel"; },
        configurable: true,
      });
    } catch (e) {}
    try {
      Object.defineProperty(Navigator.prototype, "userAgentData", {
        get: function () { return fake; },
        configurable: true,
      });
    } catch (e) {}
    var appVer = "5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
    try {
      Object.defineProperty(Navigator.prototype, "appVersion", {
        get: function () { return appVer; },
        configurable: true,
      });
    } catch (e) {}
    try {
      Object.defineProperty(Navigator.prototype, "vendor", {
        get: function () { return "Google Inc."; },
        configurable: true,
      });
    } catch (e) {}
    try {
      Object.defineProperty(Navigator.prototype, "webdriver", {
        get: function () { return false; },
        configurable: true,
      });
    } catch (e) {}
    try {
      Object.defineProperty(Navigator.prototype, "maxTouchPoints", {
        get: function () { return 0; },
        configurable: true,
      });
    } catch (e) {}
  })();`;
  const run = (): void => {
    if (!document.documentElement) return;
    document.documentElement.prepend(script);
    script.remove();
  };
  run();
  if (!document.documentElement) {
    const onReady = (): void => {
      if (document.readyState === "loading") return;
      document.removeEventListener("readystatechange", onReady);
      run();
    };
    document.addEventListener("readystatechange", onReady);
  }
})();

const sendToMain = ipcRenderer.send.bind(ipcRenderer);

type NotionCalendarNotificationPayload = {
  title: string;
  body: string;
  data?: string;
  actions?: Array<{ action: string; title: string }>;
};

contextBridge.exposeInMainWorld("notionCalendar", {
  showNotification: (payload: NotionCalendarNotificationPayload) => {
    sendToMain("show-notification", {
      title: String(payload.title).slice(0, 256),
      body: String(payload.body ?? "").slice(0, 8192),
      data: payload.data,
      actions: payload.actions?.map((a) => ({
        action: String(a.action).slice(0, 128),
        title: String(a.title).slice(0, 128),
      })),
    });
  },
});
