import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// The desktop app ships this single file as a resource and runs it with
// Node's permission model, which only grants read access to this one path.
await build({
  entryPoints: [fileURLToPath(new URL("../src/main.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("../dist/sidecar.mjs", import.meta.url)),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  legalComments: "none",
  logLevel: "warning",
});
