fn main() {
    tauri_plugin::Builder::new(&["open"])
        .android_path("android")
        .try_build()
        .expect("failed to build Android document viewer plugin");
}
