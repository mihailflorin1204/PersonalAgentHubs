/**
 * Node arguments the desktop shell uses to start the sidecar. The Rust
 * launcher in apps/desktop/src-tauri/src/sidecar.rs must pass the same list.
 * The permission model denies child processes, workers, native addons, and
 * file access other than reading the sidecar script itself.
 */
export function sidecarNodeArgs(scriptPath: string): string[] {
  return [
    "--permission",
    `--allow-fs-read=${scriptPath}`,
    "--no-addons",
    "--disallow-code-generation-from-strings",
    scriptPath,
  ];
}
