#!/usr/bin/env bash
# ============================================================
# build-apk.sh — ساخت خودکار APK بازی «مدیر تیم»
# ============================================================
# اجرا:  chmod +x build-apk.sh && ./build-apk.sh
# نیاز: Linux یا macOS (یا WSL روی ویندوز)
# خروجی: build/manager-game.apk
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
APK_NAME="manager-game"
PACKAGE_NAME="com.managerteam.football"
APP_NAME="مدیر تیم"
MIN_SDK=24
TARGET_SDK=34

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${CYAN}[بیلد]${NC} $1"; }
ok()  { echo -e "${GREEN}[✅]${NC} $1"; }
warn(){ echo -e "${YELLOW}[⚠️]${NC} $1"; }
err() { echo -e "${RED}[❌]${NC} $1"; exit 1; }

# ---- 1) بررسی Java ----
check_java() {
  if command -v java &>/dev/null && command -v javac &>/dev/null; then
    JAVA_VER=$(java -version 2>&1 | head -1 | grep -oP '\d+' | head -1)
    if [ "$JAVA_VER" -ge 11 ]; then
      ok "Java $JAVA_VER پیدا شد"
      return 0
    fi
  fi
  return 1
}

install_java() {
  log "Java پیدا نشد — در حال دانلود JDK 17..."
  JDK_DIR="$BUILD_DIR/jdk"
  mkdir -p "$JDK_DIR"

  ARCH=$(uname -m)
  case "$(uname -s)" in
    Linux)
      if [ "$ARCH" = "x86_64" ]; then
        JDK_URL="https://download.java.net/java/GA/jdk17.0.2/dfd4a8d0985749f896bed50d7138ee7f/8/GPL/openjdk-17.0.2_linux-x64_bin.tar.gz"
      elif [ "$ARCH" = "aarch64" ]; then
        JDK_URL="https://download.java.net/java/GA/jdk17.0.2/dfd4a8d0985749f896bed50d7138ee7f/8/GPL/openjdk-17.0.2_linux-aarch64_bin.tar.gz"
      else
        err "معماری $ARCH پشتیبانی نمی‌شود"
      fi
      ;;
    Darwin)
      JDK_URL="https://download.java.net/java/GA/jdk17.0.2/dfd4a8d0985749f896bed50d7138ee7f/8/GPL/openjdk-17.0.2_macos-x64_bin.tar.gz"
      ;;
    *)
      err "سیستم‌عامل پشتیبانی نمی‌شود. لطفاً Java 17+ را دستی نصب کنید."
      ;;
  esac

  curl -L --progress-bar "$JDK_URL" -o "$BUILD_DIR/jdk.tar.gz"
  tar -xzf "$BUILD_DIR/jdk.tar.gz" -C "$JDK_DIR" --strip-components=1
  rm -f "$BUILD_DIR/jdk.tar.gz"

  export JAVA_HOME="$JDK_DIR"
  export PATH="$JAVA_HOME/bin:$PATH"
  ok "Java 17 نصب شد"
}

# ---- 2) Android SDK command-line tools ----
setup_android_sdk() {
  SDK_DIR="$BUILD_DIR/android-sdk"
  PLATFORMS="$SDK_DIR/platforms/android-$TARGET_SDK"
  BUILD_TOOLS="$SDK_DIR/build-tools"

  if [ -d "$PLATFORMS" ] && [ -d "$BUILD_TOOLS" ]; then
    # Find latest build-tools version
    BT_VER=$(ls "$BUILD_TOOLS" | sort -V | tail -1)
    if [ -n "$BT_VER" ]; then
      ok "Android SDK پیدا شد"
      export ANDROID_HOME="$SDK_DIR"
      export ANDROID_SDK_ROOT="$SDK_DIR"
      export PATH="$SDK_DIR/build-tools/$BT_VER:$SDK_DIR/platform-tools:$PATH"
      return 0
    fi
  fi

  log "Android SDK پیدا نشد — در حال دانلود..."
  mkdir -p "$SDK_DIR"

  case "$(uname -s)" in
    Linux)  CMDTOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" ;;
    Darwin) CMDTOOLS_URL="https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip" ;;
    *) err "سیستم‌عامل پشتیبانی نمی‌شود" ;;
  esac

  curl -L --progress-bar "$CMDTOOLS_URL" -o "$BUILD_DIR/cmdtools.zip"
  mkdir -p "$SDK_DIR/cmdline-tools"
  unzip -qo "$BUILD_DIR/cmdline-tools.zip" -d "$SDK_DIR/cmdline-tools"
  mv "$SDK_DIR/cmdline-tools/cmdline-tools" "$SDK_DIR/cmdline-tools/latest" 2>/dev/null || true
  rm -f "$BUILD_DIR/cmdtools.zip"

  export ANDROID_HOME="$SDK_DIR"
  export ANDROID_SDK_ROOT="$SDK_DIR"
  export PATH="$SDK_DIR/cmdline-tools/latest/bin:$PATH"

  log "در حال نصب platform و build-tools..."
  yes | sdkmanager --licenses >/dev/null 2>&1 || true
  sdkmanager "platforms;android-$TARGET_SDK" "build-tools;34.0.0" >/dev/null 2>&1

  export PATH="$SDK_DIR/build-tools/34.0.0:$PATH"
  ok "Android SDK نصب شد"
}

# ---- 3) ساخت پروژه اندروید ----
create_android_project() {
  PROJECT_DIR="$BUILD_DIR/android-project"
  rm -rf "$PROJECT_DIR"
  mkdir -p "$PROJECT_DIR"

  log "ساخت پروژه اندروید..."

  # Create directory structure
  mkdir -p "$PROJECT_DIR/app/src/main/java/com/managerteam/football"
  mkdir -p "$PROJECT_DIR/app/src/main/assets/www"
  mkdir -p "$PROJECT_DIR/app/src/main/res/values"
  mkdir -p "$PROJECT_DIR/app/src/main/res/mipmap-hdpi"
  mkdir -p "$PROJECT_DIR/app/src/main/res/mipmap-mdpi"
  mkdir -p "$PROJECT_DIR/app/src/main/res/mipmap-xhdpi"
  mkdir -p "$PROJECT_DIR/app/src/main/res/mipmap-xxhdpi"
  mkdir -p "$PROJECT_DIR/app/src/main/res/mipmap-xxxhdpi"
  mkdir -p "$PROJECT_DIR/app/src/main/res/drawable"
  mkdir -p "$PROJECT_DIR/gradle/wrapper"

  # Copy web assets
  log "کپی فایل‌های وب..."
  cp "$SCRIPT_DIR/app.html" "$PROJECT_DIR/app/src/main/assets/www/index.html"
  cp -r "$SCRIPT_DIR/css" "$PROJECT_DIR/app/src/main/assets/www/"
  cp -r "$SCRIPT_DIR/js" "$PROJECT_DIR/app/src/main/assets/www/"
  cp "$SCRIPT_DIR/icon-192.png" "$PROJECT_DIR/app/src/main/assets/www/"
  cp "$SCRIPT_DIR/icon-512.png" "$PROJECT_DIR/app/src/main/assets/www/"
  cp "$SCRIPT_DIR/manifest-app.json" "$PROJECT_DIR/app/src/main/assets/www/"
  cp "$SCRIPT_DIR/sw-app.js" "$PROJECT_DIR/app/src/main/assets/www/"

  # Copy offline game assets
  cp "$SCRIPT_DIR/index.html" "$PROJECT_DIR/app/src/main/assets/www/"
  cp "$SCRIPT_DIR/service-worker.js" "$PROJECT_DIR/app/src/main/assets/www/"

  # Fix paths in the copied HTML (make relative paths work for local)
  sed -i 's|href="./css/app.css"|href="css/app.css"|g' "$PROJECT_DIR/app/src/main/assets/www/index.html"
  sed -i 's|src="./js/|src="js/|g' "$PROJECT_DIR/app/src/main/assets/www/index.html"
  sed -i 's|href="./manifest-app.json"|href="manifest-app.json"|g' "$PROJECT_DIR/app/src/main/assets/www/index.html"
  sed -i 's|href="./icon-192.png"|href="icon-192.png"|g' "$PROJECT_DIR/app/src/main/assets/www/index.html"
  sed -i 's|src="./sw-app.js"|src="sw-app.js"|g' "$PROJECT_DIR/app/src/main/assets/www/index.html"
  sed -i 's|src="./icon-|src="icon-|g' "$PROJECT_DIR/app/src/main/assets/www/index.html"

  # Fix paths in offline game HTML too
  sed -i 's|href="./css/style.css"|href="css/style.css"|g' "$PROJECT_DIR/app/src/main/assets/www/index.html" 2>/dev/null || true

  ok "فایل‌های وب کپی شدند"
}

# ---- 4) ساخت فایل‌های پروژه ----
generate_project_files() {
  PROJECT_DIR="$BUILD_DIR/android-project"

  # settings.gradle
  cat > "$PROJECT_DIR/settings.gradle" << 'EOL'
rootProject.name = "ManagerTeam"
include ':app'
EOL

  # build.gradle (root)
  cat > "$PROJECT_DIR/build.gradle" << 'EOL'
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.1.0'
    }
}
allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
EOL

  # app/build.gradle
  cat > "$PROJECT_DIR/app/build.gradle" << EOL
plugins {
    id 'com.android.application'
}

android {
    namespace '${PACKAGE_NAME}'
    compileSdk ${TARGET_SDK}

    defaultConfig {
        applicationId "${PACKAGE_NAME}"
        minSdk ${MIN_SDK}
        targetSdk ${TARGET_SDK}
        versionCode 1
        versionName "0.1.0"
    }

    buildTypes {
        release {
            minifyEnabled false
        }
        debug {
            minifyEnabled false
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_11
        targetCompatibility JavaVersion.VERSION_11
    }
}

dependencies {
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'androidx.webkit:webkit:1.8.0'
}
EOL

  # gradle.properties
  cat > "$PROJECT_DIR/gradle.properties" << 'EOL'
android.useAndroidX=true
org.gradle.jvmargs=-Xmx2048m
EOL

  # gradle-wrapper.properties
  cat > "$PROJECT_DIR/gradle/wrapper/gradle-wrapper.properties" << 'EOL'
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-8.4-bin.zip
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
EOL

  # AndroidManifest.xml
  cat > "$PROJECT_DIR/app/src/main/AndroidManifest.xml" << EOL
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="${APP_NAME}"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:screenOrientation="portrait"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
EOL

  # MainActivity.java
  cat > "$PROJECT_DIR/app/src/main/java/com/managerteam/football/MainActivity.java" << 'EOL'
package com.managerteam.football;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Fullscreen
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );

        // Hide system UI
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " ManagerTeamApp/1.0");

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());

        webView.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
EOL

  # styles.xml
  cat > "$PROJECT_DIR/app/src/main/res/values/styles.xml" << 'EOL'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.NoActionBar">
        <item name="android:windowFullscreen">true</item>
        <item name="android:statusBarColor">#080e1a</item>
        <item name="android:navigationBarColor">#080e1a</item>
        <item name="android:windowBackground">#080e1a</item>
    </style>
</resources>
EOL

  # colors.xml
  cat > "$PROJECT_DIR/app/src/main/res/values/colors.xml" << 'EOL'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">#080e1a</color>
    <color name="colorPrimaryDark">#080e1a</color>
    <color name="colorAccent">#22d3ee</color>
</resources>
EOL

  # Copy icon to mipmap folders (use the 192px icon)
  for density in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
    cp "$SCRIPT_DIR/icon-192.png" "$PROJECT_DIR/app/src/main/res/mipmap-$density/ic_launcher.png"
  done

  # Create a simple adaptive icon background
  cat > "$PROJECT_DIR/app/src/main/res/drawable/ic_launcher_background.xml" << 'EOL'
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <solid android:color="#080e1a"/>
</shape>
EOL

  ok "فایل‌های پروژه ساخته شدند"
}

# ---- 5) بیلد APK ----
build_apk() {
  PROJECT_DIR="$BUILD_DIR/android-project"
  cd "$PROJECT_DIR"

  log "در حال بیلد APK (ممکن است چند دقیقه طول بکشد)..."

  # Download gradle wrapper if not present
  if [ ! -f "gradlew" ]; then
    log "دانلود Gradle wrapper..."
    GRADLE_VER="8.4"
    curl -sL "https://services.gradle.org/distributions/gradle-${GRADLE_VER}-bin.zip" -o "$BUILD_DIR/gradle.zip"
    mkdir -p "$BUILD_DIR/gradle-extract"
    unzip -qo "$BUILD_DIR/gradle.zip" -d "$BUILD_DIR/gradle-extract"

    # Create gradlew script
    cat > gradlew << 'GRADLEW'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
GRADLE_HOME="${GRADLE_HOME:-$DIR/build/gradle}"
if [ ! -d "$GRADLE_HOME" ]; then
  echo "Gradle not found at $GRADLE_HOME"
  exit 1
fi
exec "$GRADLE_HOME/bin/gradle" "$@"
GRADLEW
    chmod +x gradlew

    mkdir -p "$PROJECT_DIR/build"
    ln -sf "$BUILD_DIR/gradle-extract/gradle-${GRADLE_VER}" "$PROJECT_DIR/build/gradle"
    rm -f "$BUILD_DIR/gradle.zip"
  fi

  # Build
  ./gradlew assembleDebug --no-daemon --console=plain 2>&1 | tail -20

  # Copy APK
  APK_PATH="$PROJECT_DIR/app/build/outputs/apk/debug/app-debug.apk"
  if [ -f "$APK_PATH" ]; then
    mkdir -p "$SCRIPT_DIR/dist"
    cp "$APK_PATH" "$SCRIPT_DIR/dist/${APK_NAME}.apk"
    ok "APK ساخته شد! 🎉"
    echo ""
    echo -e "${GREEN}📍 مسیر:${NC} $SCRIPT_DIR/dist/${APK_NAME}.apk"
    echo -e "${GREEN}📦 حجم:${NC} $(du -h "$SCRIPT_DIR/dist/${APK_NAME}.apk" | cut -f1)"
    echo ""
    echo -e "${CYAN}برای نصب روی گوشی:${NC}"
    echo "  ۱. فایل APK رو به گوشی منتقل کن"
    echo "  ۲. روی فایل بزن تا نصب بشه"
    echo "  ۳. اگه اجازه نداد: تنظیمات > امنیت > نصب از منابع ناشناس"
  else
    err "بیلد ناموفق بود. خروجی بالا رو بررسی کن."
  fi
}

# ---- Main ----
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     ⚽ ساخت APK بازی «مدیر تیم»            ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

mkdir -p "$BUILD_DIR"

check_java || install_java
setup_android_sdk
create_android_project
generate_project_files
build_apk