// Bundles the functions into lib/index.js. The bundle inlines the shared
// domain code from ../src/domain (checklist, search tokens, media keys, CMS
// rules) and its zod dependency, so the deployed package only needs the
// runtime dependencies listed in package.json.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "lib/index.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  external: ["firebase-admin", "firebase-functions", "@aws-sdk/*"],
  logLevel: "info",
});
