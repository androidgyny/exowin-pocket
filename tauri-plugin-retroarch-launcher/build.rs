fn main() {
    tauri_plugin::Builder::new(&["launch"])
        .android_path("android")
        .try_build()
        .expect("failed to build RetroArch launcher plugin");
}
