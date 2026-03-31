import { contextBridge, ipcRenderer } from "electron";

const sendToMain = ipcRenderer.send.bind(ipcRenderer);

contextBridge.exposeInMainWorld("notionCalendar", {
  showNotification: (title: string, body: string) => {
    sendToMain("show-notification", {
      title: String(title).slice(0, 256),
      body: String(body).slice(0, 1024),
    });
  },
});
