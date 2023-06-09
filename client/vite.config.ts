import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    minify: true,
    outDir: "../dist",
    emptyOutDir: true,
  },
  plugins: [react()],
});
