// Bundles the processor and the shared code it imports (scripts/media,
// src/domain) into dist/server.js with every dependency inlined, so the
// runtime image needs only Node and ffmpeg. Dependencies resolve from this
// package's node_modules (the Docker build has no root node_modules).
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  nodePaths: [fileURLToPath(new URL("node_modules", import.meta.url))],
  logLevel: "info",
});
