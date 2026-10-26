import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 7000,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:7001",
        changeOrigin: true
      },
      "/ws": {
        target: "ws://127.0.0.1:7001",
        ws: true
      }
    }
  }
});
