package app.exodiumpocket.retroarch

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.os.Environment
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.annotation.InvokeArg
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin
class RetroArchLauncherPlugin(private val activity: Activity) : Plugin(activity) {
    @InvokeArg
    class LaunchArgs {
        lateinit var packageName: String
        lateinit var activityName: String
        lateinit var rom: String
        lateinit var libretro: String
        var configFile: String? = null
    }

    @Command
    fun launch(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(LaunchArgs::class.java)
            val appInfo = activity.packageManager.getApplicationInfo(args.packageName, 0)
            val externalRoot = Environment.getExternalStorageDirectory().absolutePath
            val retroExternal = "$externalRoot/Android/data/${args.packageName}/files"
            val retroConfig = args.configFile ?: "$retroExternal/retroarch.cfg"

            val intent = Intent().apply {
                component = ComponentName(args.packageName, args.activityName)
                putExtra("ROM", args.rom)
                putExtra("LIBRETRO", args.libretro)
                putExtra("CONFIGFILE", retroConfig)
                putExtra("DATADIR", appInfo.dataDir)
                putExtra("APK", appInfo.sourceDir)
                putExtra("SDCARD", externalRoot)
                putExtra("EXTERNAL", retroExternal)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            activity.startActivity(intent)
            val response = JSObject()
            response.put("launched", true)
            invoke.resolve(response)
        } catch (t: Throwable) {
            invoke.reject("Could not launch RetroArch: ${t.message ?: t.javaClass.simpleName}")
        }
    }
}
