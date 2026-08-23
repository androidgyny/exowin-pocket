fn main() {
    tauri_plugin::Builder::new(&["status", "request"])
        .android_path("android")
        .try_build()
        .expect("failed to build Android storage permissions plugin");
}
