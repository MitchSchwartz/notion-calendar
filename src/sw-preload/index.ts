import { ipcRenderer } from "electron";

const send = ipcRenderer.send.bind(ipcRenderer);

function patchServiceWorkerShowNotification(): void {
  const SWReg = globalThis.ServiceWorkerRegistration as typeof ServiceWorkerRegistration | undefined;
  if (!SWReg?.prototype?.showNotification) return;

  const original = SWReg.prototype.showNotification;
  SWReg.prototype.showNotification = function (
    this: ServiceWorkerRegistration,
    title: string,
    options?: NotificationOptions
  ) {
    const body = options?.body != null ? String(options.body) : "";
    send("show-notification", {
      title: String(title).slice(0, 256),
      body: body.slice(0, 1024),
    });
    return original.apply(this, arguments as unknown as [string, NotificationOptions?]);
  };
}

patchServiceWorkerShowNotification();
