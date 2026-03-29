import { ipcRenderer } from "electron";

function overrideNotifications(): void {
  const NativeNotification = window.Notification;

  const ProxiedNotification = function (
    this: Notification,
    title: string,
    options?: NotificationOptions
  ) {
    const instance = new NativeNotification(title, options);

    ipcRenderer.send("show-notification", {
      title,
      body: options?.body ?? "",
    });

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
