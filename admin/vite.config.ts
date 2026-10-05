/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The admin app reuses the shared CMS rules in ../src/domain (roles, D-036
// workflow, readiness and checklist), the same code the Cloud Functions
// enforce. Those files import zod; dedupe resolves it from this package, so
// admin/ installs and builds on its own.
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["zod", "react", "react-dom"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: { allow: [here("."), here("../src/domain")] },
  },
  preview: { host: "127.0.0.1", port: 4173 },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
    // An internal tool: one bundle, most of it the Firebase SDK.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    // One worker: the suite is small and the dev machine is shared.
    pool: "threads",
    fileParallelism: false,
    testTimeout: 20000,
  },
});
