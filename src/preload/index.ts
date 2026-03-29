import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("notionCalendar", {
  showNotification: (title: string, body: string) => {
    ipcRenderer.send("show-notification", {
      title: String(title).slice(0, 256),
      body: String(body).slice(0, 1024),
    });
  },
});

function overrideNotifications(): void {
  const NativeNotification = window.Notification;

  const ProxiedNotification = function (
    this: Notification,
    title: string,
    options?: NotificationOptions
  ) {
    const instance = new NativeNotification(title, options);

    (window as any).notionCalendar.showNotification(title, options?.body ?? "");

    return instance;
  } as unknown as typeof Notification;

  ProxiedNotification.prototype = NativeNotification.prototype;

  Object.defineProperty(ProxiedNotification, "permission", {
    get: () => "granted" as NotificationPermission,
  });

  ProxiedNotification.requestPermission = () =>
    Promise.resolve("granted" as NotificationPermission);

  window.Notification = ProxiedNotification;
}

window.addEventListener("DOMContentLoaded", overrideNotifications);
