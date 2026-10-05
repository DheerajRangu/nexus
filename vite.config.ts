import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiProxy = {
  target: "http://127.0.0.1:8787",
  changeOrigin: true,
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": apiProxy },
  },
  preview: {
    port: 4173,
    proxy: { "/api": apiProxy },
  },
});
