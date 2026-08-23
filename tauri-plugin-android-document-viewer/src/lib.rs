use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    Manager, Runtime,
};

const PLUGIN_IDENTIFIER: &str = "app.exowinpocket.documents";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenDocumentRequest {
    pub path: String,
    pub mime_type: String,
}

#[derive(Debug, Deserialize)]
pub struct OpenDocumentResponse {
    pub opened: bool,
}

pub struct AndroidDocumentViewer<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> AndroidDocumentViewer<R> {
    pub fn open(&self, request: OpenDocumentRequest) -> Result<(), String> {
        let result = self
            .0
            .run_mobile_plugin::<OpenDocumentResponse>("open", request)
            .map_err(|e| e.to_string())?;
        if result.opened {
            Ok(())
        } else {
            Err("Android document viewer returned opened=false".to_string())
        }
    }
}

pub trait AndroidDocumentViewerExt<R: Runtime> {
    fn android_document_viewer(&self) -> &AndroidDocumentViewer<R>;
}

impl<R: Runtime, T: Manager<R>> AndroidDocumentViewerExt<R> for T {
    fn android_document_viewer(&self) -> &AndroidDocumentViewer<R> {
        self.state::<AndroidDocumentViewer<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("android-document-viewer")
        .setup(|app, api| {
            let handle =
                api.register_android_plugin(PLUGIN_IDENTIFIER, "AndroidDocumentViewerPlugin")?;
            app.manage(AndroidDocumentViewer(handle));
            Ok(())
        })
        .build()
}
