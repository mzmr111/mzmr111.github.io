import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/japan-places-map/",
  plugins: [react()],
  build: {
    minify: false,
    sourcemap: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: (assetInfo) =>
          assetInfo.names?.some((name) => name.endsWith(".css"))
            ? "assets/styles.css"
            : "assets/[name][extname]",
      },
    },
  },
});
