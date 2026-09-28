import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Stamped once per build. The map-editor iframe hangs this off its URL so a new
// deploy is a new URL -- see MapEditor.tsx for why a plain refresh isn't enough.
const buildId = Date.now().toString(36);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __EOMAP_BUILD_ID__: JSON.stringify(buildId),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: false,
      },
    },
  },
});
