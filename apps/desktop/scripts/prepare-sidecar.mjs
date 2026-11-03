import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Stages the two files the Tauri bundle ships for the local runtime:
//   src-tauri/binaries/agenthub-node-<target triple>[.exe]  (externalBin)
//   src-tauri/resources/local-runtime/sidecar.mjs          (resource)
// The Rust launcher only ever starts these two paths.

const TRIPLES = {
  "win32-x64": "x86_64-pc-windows-msvc",
  "win32-arm64": "aarch64-pc-windows-msvc",
  "darwin-x64": "x86_64-apple-darwin",
  "darwin-arm64": "aarch64-apple-darwin",
  "linux-x64": "x86_64-unknown-linux-gnu",
  "linux-arm64": "aarch64-unknown-linux-gnu",
};

function fail(message) {
  console.error(`prepare-sidecar: ${message}`);
  process.exit(1);
}

function targetTriple() {
  const fromTauri = process.env.TAURI_ENV_TARGET_TRIPLE;
  if (fromTauri !== undefined && fromTauri !== "") {
    if (!/^[a-z0-9_]+(-[a-z0-9_]+){2,3}$/.test(fromTauri)) {
      fail("TAURI_ENV_TARGET_TRIPLE is invalid");
    }
    return fromTauri;
  }
  const triple = TRIPLES[`${process.platform}-${process.arch}`];
  if (!triple) {
    fail(`unsupported host ${process.platform}-${process.arch}`);
  }
  return triple;
}

if (!process.allowedNodeEnvironmentFlags.has("--permission")) {
  fail(`Node ${process.version} lacks the stable --permission flag; use Node 22.13 or newer`);
}

const srcTauri = fileURLToPath(new URL("../src-tauri/", import.meta.url));
const triple = targetTriple();
const extension = triple.includes("windows") ? ".exe" : "";

let sidecarSource;
try {
  sidecarSource = fileURLToPath(import.meta.resolve("@agenthub/local-runtime/sidecar"));
} catch {
  fail("cannot resolve @agenthub/local-runtime/sidecar");
}
if (!existsSync(sidecarSource)) {
  fail("apps/local-runtime/dist/sidecar.mjs is missing; run pnpm --filter @agenthub/local-runtime build");
}

const nodeTarget = join(srcTauri, "binaries", `agenthub-node-${triple}${extension}`);
const sidecarTarget = join(srcTauri, "resources", "local-runtime", "sidecar.mjs");

for (const target of [nodeTarget, sidecarTarget]) {
  mkdirSync(dirname(target), { recursive: true });
}
copyFileSync(process.execPath, nodeTarget);
copyFileSync(sidecarSource, sidecarTarget);

console.log(`prepare-sidecar: node ${process.version} -> ${nodeTarget}`);
console.log(`prepare-sidecar: sidecar -> ${sidecarTarget}`);
