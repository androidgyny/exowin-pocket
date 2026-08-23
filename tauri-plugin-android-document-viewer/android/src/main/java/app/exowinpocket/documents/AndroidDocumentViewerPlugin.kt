package app.exowinpocket.documents

import android.app.Activity
import android.content.Intent
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

@TauriPlugin
class AndroidDocumentViewerPlugin(private val activity: Activity) : Plugin(activity) {
    @InvokeArg
    class OpenDocumentArgs {
        lateinit var path: String
        lateinit var mimeType: String
    }

    @Command
    fun open(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(OpenDocumentArgs::class.java)
            val file = File(args.path)
            if (!file.isFile) {
                invoke.reject("Manual file no longer exists")
                return
            }

            val authority = "${activity.packageName}.fileprovider"
            val uri = FileProvider.getUriForFile(activity, authority, file)
            val viewIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, args.mimeType)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val chooser = Intent.createChooser(viewIntent, "Open manual").apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            activity.startActivity(chooser)

            val response = JSObject()
            response.put("opened", true)
            invoke.resolve(response)
        } catch (t: Throwable) {
            invoke.reject(
                "Could not open manual. Install an app that supports this document type: " +
                    (t.message ?: t.javaClass.simpleName)
            )
        }
    }
}
