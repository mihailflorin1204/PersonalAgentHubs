fn main() {
    // Declaring the app commands makes each one deny-by-default; a capability
    // must grant `allow-<command>` before the webview can call it.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["sidecar_status"])),
    )
    .expect("failed to run tauri-build");
}
