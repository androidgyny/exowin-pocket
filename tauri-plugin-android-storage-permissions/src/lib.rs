use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    Manager, Runtime,
};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "app.exodiumpocket.storage";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoragePermissionStatus {
    pub platform: String,
    pub sdk_int: i32,
    pub granted: bool,
    pub legacy_granted: bool,
    pub all_files_granted: bool,
    pub can_request_runtime: bool,
    pub needs_settings: bool,
    pub detail: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoragePermissionRequestResult {
    pub opened_settings: bool,
    pub status: StoragePermissionStatus,
}

pub struct AndroidStoragePermissions<R: Runtime>(Option<PluginHandle<R>>);

impl<R: Runtime> AndroidStoragePermissions<R> {
    pub fn status(&self) -> Result<StoragePermissionStatus, String> {
        #[cfg(target_os = "android")]
        {
            let handle = self
                .0
                .as_ref()
                .ok_or_else(|| "Android storage permission plugin is not registered".to_string())?;
            return handle
                .run_mobile_plugin::<StoragePermissionStatus>("status", ())
                .map_err(|e| e.to_string());
        }

        #[cfg(not(target_os = "android"))]
        {
            Ok(StoragePermissionStatus {
                platform: std::env::consts::OS.to_string(),
                sdk_int: 0,
                granted: true,
                legacy_granted: true,
                all_files_granted: true,
                can_request_runtime: false,
                needs_settings: false,
                detail: "Desktop storage access is handled by the operating system file picker."
                    .to_string(),
            })
        }
    }

    pub fn request(&self) -> Result<StoragePermissionRequestResult, String> {
        #[cfg(target_os = "android")]
        {
            let handle = self
                .0
                .as_ref()
                .ok_or_else(|| "Android storage permission plugin is not registered".to_string())?;
            return handle
                .run_mobile_plugin::<StoragePermissionRequestResult>("request", ())
                .map_err(|e| e.to_string());
        }

        #[cfg(not(target_os = "android"))]
        {
            Ok(StoragePermissionRequestResult {
                opened_settings: false,
                status: self.status()?,
            })
        }
    }
}

pub trait AndroidStoragePermissionsExt<R: Runtime> {
    fn android_storage_permissions(&self) -> &AndroidStoragePermissions<R>;
}

impl<R: Runtime, T: Manager<R>> AndroidStoragePermissionsExt<R> for T {
    fn android_storage_permissions(&self) -> &AndroidStoragePermissions<R> {
        self.state::<AndroidStoragePermissions<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("android-storage-permissions")
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            {
                let handle =
                    _api.register_android_plugin(PLUGIN_IDENTIFIER, "AndroidStoragePermissionsPlugin")?;
                app.manage(AndroidStoragePermissions(Some(handle)));
            }

            #[cfg(not(target_os = "android"))]
            app.manage(AndroidStoragePermissions::<R>(None));

            Ok(())
        })
        .build()
}
