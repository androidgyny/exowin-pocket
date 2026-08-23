use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    Manager, Runtime,
};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "app.exodiumpocket.retroarch";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
    pub package_name: String,
    pub activity_name: String,
    pub rom: String,
    pub libretro: String,
    pub config_file: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LaunchResponse {
    pub launched: bool,
}

pub struct RetroArchLauncher<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> RetroArchLauncher<R> {
    pub fn launch(&self, request: LaunchRequest) -> Result<(), String> {
        let result = self
            .0
            .run_mobile_plugin::<LaunchResponse>("launch", request)
            .map_err(|e| e.to_string())?;
        if result.launched {
            Ok(())
        } else {
            Err("RetroArch launcher returned launched=false".to_string())
        }
    }
}

pub trait RetroArchLauncherExt<R: Runtime> {
    fn retroarch_launcher(&self) -> &RetroArchLauncher<R>;
}

impl<R: Runtime, T: Manager<R>> RetroArchLauncherExt<R> for T {
    fn retroarch_launcher(&self) -> &RetroArchLauncher<R> {
        self.state::<RetroArchLauncher<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("retroarch-launcher")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let handle = api.register_android_plugin(
                    PLUGIN_IDENTIFIER,
                    "RetroArchLauncherPlugin",
                )?;
                app.manage(RetroArchLauncher(handle));
            }
            Ok(())
        })
        .build()
}
