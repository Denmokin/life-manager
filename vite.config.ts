import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = Number(process.env.PORT ?? 8787);

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // reachable from the phone on the same network
    proxy: { "/api": `http://localhost:${apiPort}` },
  },
});
