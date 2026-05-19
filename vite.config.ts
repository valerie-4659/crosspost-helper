import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import packageJson from "./package.json";

export default defineConfig({
  // Use relative asset paths so the built index.html works with Electron's
  // file:// protocol on all platforms (Windows requires "./" — absolute paths
  // like "/assets/xxx.js" resolve from the drive root and are never found).
  base: "./",
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@tauri-apps/api/core": fileURLToPath(new URL("./src/electron-shims/core.ts", import.meta.url)),
      "@tauri-apps/plugin-dialog": fileURLToPath(new URL("./src/electron-shims/dialog.ts", import.meta.url)),
      "@tauri-apps/plugin-opener": fileURLToPath(new URL("./src/electron-shims/opener.ts", import.meta.url)),
      "@tauri-apps/plugin-clipboard-manager": fileURLToPath(new URL("./src/electron-shims/clipboard.ts", import.meta.url)),
      "@tauri-apps/plugin-sql": fileURLToPath(new URL("./src/electron-shims/sql.ts", import.meta.url)),
    },
  },
  server: {
    strictPort: true,
    port: 5173,
  },
});
