import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // The lazily loaded EChart chunk (~630 kB) is already tree-shaken in
    // src/lib/echarts.ts and only loads on pages that draw charts.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Keep large third-party libraries out of the main bundle so it stays
        // under the 500 kB warning and they cache independently of app code.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return "vendor-react";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (/[\\/]node_modules[\\/](framer-motion|motion|motion-dom|motion-utils)[\\/]/.test(id)) return "vendor-motion";
          if (id.includes("@phosphor-icons") || id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("@tanstack")) return "vendor-tanstack";
          if (id.includes("@remixicon")) return "vendor-remixicon";
          if (/[\\/]node_modules[\\/](react-aria|react-aria-components|react-stately|@react-aria|@react-stately|@react-types|@internationalized)[\\/]/.test(id)) return "vendor-aria";
          if (/[\\/]node_modules[\\/](date-fns|react-day-picker)[\\/]/.test(id)) return "vendor-date";
          return undefined;
        },
      },
    },
  },
  optimizeDeps: {
    include: ["thinking-orbs", "glimm"],
  },
}));
