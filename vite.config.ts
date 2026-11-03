import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/api/mobile": {
        target: "https://meaningful-plushies-fulfilment.vercel.app",
        changeOrigin: true,
      },
    },
  },
});
