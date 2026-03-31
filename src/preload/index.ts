import { contextBridge, ipcRenderer } from "electron";

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
