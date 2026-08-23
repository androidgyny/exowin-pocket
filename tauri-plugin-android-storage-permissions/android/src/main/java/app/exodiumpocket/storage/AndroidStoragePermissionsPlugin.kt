package app.exodiumpocket.storage

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.activity.result.ActivityResult
import androidx.core.app.ActivityCompat
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin(
    permissions = [
        Permission(
            alias = "legacyStorage",
            strings = [
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.WRITE_EXTERNAL_STORAGE,
            ],
        ),
    ],
)
class AndroidStoragePermissionsPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun status(invoke: Invoke) {
        invoke.resolve(storageStatus())
    }

    @Command
    fun request(invoke: Invoke) {
        if (hasStorageAccess()) {
            resolveRequest(invoke, openedSettings = false)
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val directIntent = Intent(
                Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                Uri.parse("package:${activity.packageName}"),
            )
            val fallbackIntent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)

            try {
                handle!!.startActivityForResult(invoke, directIntent, "settingsResult")
            } catch (_: ActivityNotFoundException) {
                handle!!.startActivityForResult(invoke, fallbackIntent, "settingsResult")
            } catch (t: Throwable) {
                invoke.reject("Could not open Android storage settings: ${t.message ?: t.javaClass.simpleName}")
            }
            return
        }

        requestPermissionForAlias("legacyStorage", invoke, "permissionResult")
    }

    @PermissionCallback
    fun permissionResult(invoke: Invoke) {
        resolveRequest(invoke, openedSettings = false)
    }

    @ActivityCallback
    fun settingsResult(invoke: Invoke, @Suppress("UNUSED_PARAMETER") result: ActivityResult) {
        resolveRequest(invoke, openedSettings = true)
    }

    private fun resolveRequest(invoke: Invoke, openedSettings: Boolean) {
        val response = JSObject()
        response.put("openedSettings", openedSettings)
        response.put("status", storageStatus())
        invoke.resolve(response)
    }

    private fun storageStatus(): JSObject {
        val sdk = Build.VERSION.SDK_INT
        val legacyGranted = hasLegacyStorageAccess()
        val allFilesGranted = sdk >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()
        val granted = hasStorageAccess()
        val response = JSObject()

        response.put("platform", "android")
        response.put("sdkInt", sdk)
        response.put("granted", granted)
        response.put("legacyGranted", legacyGranted)
        response.put("allFilesGranted", allFilesGranted)
        response.put("canRequestRuntime", sdk < Build.VERSION_CODES.R)
        response.put("needsSettings", sdk >= Build.VERSION_CODES.R && !granted)
        response.put("detail", detailFor(sdk, granted, legacyGranted, allFilesGranted))

        return response
    }

    private fun hasStorageAccess(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            hasLegacyStorageAccess()
        }
    }

    private fun hasLegacyStorageAccess(): Boolean {
        val read = ActivityCompat.checkSelfPermission(
            activity,
            Manifest.permission.READ_EXTERNAL_STORAGE,
        ) == PackageManager.PERMISSION_GRANTED
        val write = ActivityCompat.checkSelfPermission(
            activity,
            Manifest.permission.WRITE_EXTERNAL_STORAGE,
        ) == PackageManager.PERMISSION_GRANTED
        return read && write
    }

    private fun detailFor(
        sdk: Int,
        granted: Boolean,
        legacyGranted: Boolean,
        allFilesGranted: Boolean,
    ): String {
        if (granted) {
            return if (sdk >= Build.VERSION_CODES.R && allFilesGranted) {
                "All files access is enabled."
            } else {
                "Storage permission is enabled."
            }
        }

        return if (sdk >= Build.VERSION_CODES.R) {
            "Android requires All files access to write to the shared Exodium Pocket folder."
        } else if (!legacyGranted) {
            "Android needs read and write storage permission to use the shared Exodium Pocket folder."
        } else {
            "Storage permission is incomplete."
        }
    }
}
