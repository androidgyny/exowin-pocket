import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const androidAppPath = join(
  process.cwd(),
  "src-tauri",
  "gen",
  "android",
  "app",
);
const manifestPath = join(
  androidAppPath,
  "src",
  "main",
  "AndroidManifest.xml",
);
const buildGradlePath = join(
  androidAppPath,
  "build.gradle.kts",
);
const mainActivityPath = join(
  androidAppPath,
  "src",
  "main",
  "java",
  "app",
  "exowinpocket",
  "MainActivity.kt",
);

if (!existsSync(manifestPath)) {
  console.error(
    "AndroidManifest.xml not found. Run `pnpm tauri android init --ci` first.",
  );
  process.exit(1);
}
if (!existsSync(buildGradlePath)) {
  console.error("Android app build.gradle.kts not found. Run `pnpm tauri android init --ci` first.");
  process.exit(1);
}
if (!existsSync(mainActivityPath)) {
  console.error("Android MainActivity.kt not found. Run `pnpm tauri android init --ci` first.");
  process.exit(1);
}

let xml = readFileSync(manifestPath, "utf8");

const permissionLines = [
  '    <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />',
  '    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
  '    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />',
];

const missingPermissions = permissionLines.filter((line) => {
  const match = line.match(/android\.permission\.[A-Z_]+/);
  return match && !xml.includes(match[0]);
});

if (missingPermissions.length > 0) {
  const manifestOpen = xml.match(/<manifest\b[^>]*>\r?\n/);
  if (!manifestOpen || manifestOpen.index === undefined) {
    console.error("Could not find the Android manifest root tag.");
    process.exit(1);
  }
  const insertAt = manifestOpen.index + manifestOpen[0].length;
  xml = `${xml.slice(0, insertAt)}${missingPermissions.join("\n")}\n${xml.slice(insertAt)}`;
}

const queryBlock = `    <queries>
        <package android:name="com.retroarch" />
        <package android:name="com.retroarch.aarch64" />
    </queries>`;

if (!xml.includes('android:name="com.retroarch"')) {
  const application = xml.match(/\r?\n\s*<application\b/);
  if (!application || application.index === undefined) {
    console.error("Could not find the Android application tag.");
    process.exit(1);
  }
  xml = `${xml.slice(0, application.index)}\n${queryBlock}\n${xml.slice(application.index)}`;
} else if (!xml.includes('android:name="com.retroarch.aarch64"')) {
  xml = xml.replace(
    /(<queries>\s*)/,
    '$1        <package android:name="com.retroarch.aarch64" />\n',
  );
}

xml = xml.replace(
  /[ \t]*<uses-permission android:name="android\.permission\.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="\d+" \/>/,
  '    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />',
);

if (!xml.includes("android:requestLegacyExternalStorage=")) {
  const beforeTheme = /(\s+android:label="@string\/app_name"\r?\n)/;
  if (!beforeTheme.test(xml)) {
    console.error("Could not find the Android application label attribute.");
    process.exit(1);
  }
  xml = xml.replace(
    beforeTheme,
    '$1        android:requestLegacyExternalStorage="true"\n',
  );
}

writeFileSync(manifestPath, xml);

let gradle = readFileSync(buildGradlePath, "utf8");
gradle = gradle.replace(
  /manifestPlaceholders\["usesCleartextTraffic"\]\s*=\s*"false"/,
  'manifestPlaceholders["usesCleartextTraffic"] = "true"',
);
writeFileSync(buildGradlePath, gradle);

const mainActivity = `package app.exowinpocket

import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    enterImmersiveFullscreen()
    window.decorView.post { enterImmersiveFullscreen() }
  }

  override fun onResume() {
    super.onResume()
    enterImmersiveFullscreen()
    window.decorView.post { enterImmersiveFullscreen() }
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      enterImmersiveFullscreen()
      window.decorView.post { enterImmersiveFullscreen() }
    }
  }

  private fun enterImmersiveFullscreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      window.insetsController?.let { controller ->
        controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
        controller.systemBarsBehavior =
          WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      }
    } else {
      @Suppress("DEPRECATION")
      window.decorView.systemUiVisibility = (
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
          or View.SYSTEM_UI_FLAG_FULLSCREEN
          or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
          or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
          or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
          or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        )
    }
  }
}
`;

writeFileSync(mainActivityPath, mainActivity);

console.log("Patched Android storage, localhost media, and immersive fullscreen settings.");
