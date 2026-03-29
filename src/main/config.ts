import Store from "electron-store";

export type StoreType = {
  lastWindowState: {
    width: number;
    height: number;
    x: number | undefined;
    y: number | undefined;
  };
};

const store = new Store<StoreType>({
  migrations: {
    "0.2.0": (store) => {
      store.set("lastWindowState.width", 900);
      store.set("lastWindowState.height", 670);
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
  },
});

export default store;
