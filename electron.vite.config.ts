import path from "node:path";
import { defineConfig, externalizeDepsPlugin, swcPlugin } from "electron-vite";

const projectRoot = process.cwd();

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), swcPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: path.join(projectRoot, "src/preload/index.ts"),
          sw: path.join(projectRoot, "src/sw-preload/index.ts"),
        },
      },
    },
  },
});
