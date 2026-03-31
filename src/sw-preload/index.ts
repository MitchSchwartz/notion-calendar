import { ipcRenderer } from "electron";

const send = ipcRenderer.send.bind(ipcRenderer);

function serializeData(data: unknown): string | undefined {
  if (data === undefined || data === null) return undefined;
  if (typeof data === "string") return data.slice(0, 16384);
  try {
    return JSON.stringify(data).slice(0, 16384);
  } catch {
    return undefined;
  }
}

function serializeActions(options?: NotificationOptions): Array<{ action: string; title: string }> | undefined {
  const raw = options && "actions" in options ? (options as { actions?: Array<{ action: string; title: string }> }).actions : undefined;
  if (!raw || !Array.isArray(raw)) return undefined;
  return raw.map((a) => ({
    action: String(a.action).slice(0, 128),
    title: String(a.title).slice(0, 128),
  }));
}

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
      body: body.slice(0, 8192),
      data: serializeData(options?.data as unknown),
      actions: serializeActions(options),
    });
    return original.apply(this, arguments as unknown as [string, NotificationOptions?]);
  };
}

patchServiceWorkerShowNotification();
