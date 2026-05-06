import { app } from "electron";
import * as path from "path";

// Run before electron-store touches disk. Bundled `import Store` can be reordered
// ahead of this block; `require` stays sequential in the output.
if (process.platform === "linux") {
  app.setName("notion-calendar");
}
app.setPath("userData", path.join(app.getPath("appData"), "notion-calendar-electron-wrapper"));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- must follow setPath above
const Store = require("electron-store") as typeof import("electron-store").default;

export type StoreType = {
  lastWindowState: {
    width: number;
    height: number;
    x: number | undefined;
    y: number | undefined;
  };
  /** When true, the main window stays hidden on launch (tray only) until shown. */
  startMinimizedToTray: boolean;
};

const store = new Store<StoreType>({
  defaults: {
    startMinimizedToTray: false,
  },
  migrations: {
    "0.2.0": (st) => {
      st.set("lastWindowState.width", 900);
      st.set("lastWindowState.height", 670);
    },
  },
  schema: {
    lastWindowState: {
      type: "object",
      properties: {
        width: { type: "number" },
        height: { type: "number" },
        x: { type: "number" },
        y: { type: "number" },
      },
    },
    startMinimizedToTray: {
      type: "boolean",
      default: false,
    },
  },
});

export default store;
