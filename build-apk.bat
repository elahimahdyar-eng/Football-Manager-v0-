@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

echo.
echo ╔══════════════════════════════════════════════╗
echo ║     ساخت APK بازی "مدیر تیم"               ║
echo ║     برای ویندوز                             ║
echo ╚══════════════════════════════════════════════╝
echo.

set "SCRIPT_DIR=%~dp0"
set "BUILD_DIR=%SCRIPT_DIR%build"
set "APK_NAME=manager-game"

:: ──── 1) بررسی Java ────
echo [1/5] بررسی Java...
where java >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Java پیدا شد
    goto :check_sdk
)

echo ⚠️  Java پیدا نشد — در حال دانلود JDK 17...
if not exist "%BUILD_DIR%" mkdir "%BUILD_DIR%"

:: Download Adoptium JDK 17 for Windows
set "JDK_URL=https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jdk_x64_windows_hotspot_17.0.9_9.zip"
set "JDK_ZIP=%BUILD_DIR%\jdk.zip"
set "JDK_DIR=%BUILD_DIR%\jdk"

echo    در حال دانلود JDK (حدود 180MB — صبر کنید)...
powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%JDK_URL%' -OutFile '%JDK_ZIP%' -UseBasicParsing }" 2>nul
if not exist "%JDK_ZIP%" (
    echo ❌ دانلود JDK ناموفق بود
    echo    لطفاً Java 17+ را دستی نصب کنید: https://adoptium.net
    echo    یا از روش PWA استفاده کنید (README را ببینید)
    pause
    exit /b 1
)

echo    در حال استخراج...
powershell -Command "& { Expand-Archive -Path '%JDK_ZIP%' -DestinationPath '%JDK_DIR%' -Force }"
for /d %%i in ("%JDK_DIR%\jdk*") do set "JAVA_HOME=%%i"
set "PATH=%JAVA_HOME%\bin;%PATH%"
del "%JDK_ZIP%" 2>nul
echo ✅ Java 17 نصب شد

:check_sdk
:: ──── 2) بررسی Android SDK ────
echo.
echo [2/5] بررسی Android SDK...

set "SDK_DIR=%BUILD_DIR%\android-sdk"
set "PLATFORMS=%SDK_DIR%\platforms\android-34"
set "BUILD_TOOLS=%SDK_DIR%\build-tools"

if exist "%PLATFORMS%" (
    if exist "%BUILD_TOOLS%" (
        echo ✅ Android SDK پیدا شد
        goto :create_project
    )
)

echo ⚠️  Android SDK پیدا نشد — در حال دانلود...
if not exist "%BUILD_DIR%" mkdir "%BUILD_DIR%"

set "CMDTOOLS_URL=https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
set "CMDTOOLS_ZIP=%BUILD_DIR%\cmdtools.zip"

echo    در حال دانلود Android SDK tools (حدود 150MB)...
powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%CMDTOOLS_URL%' -OutFile '%CMDTOOLS_ZIP%' -UseBasicParsing }" 2>nul
if not exist "%CMDTOOLS_ZIP%" (
    echo ❌ دانلود Android SDK ناموفق بود
    echo    لطفاً Android Studio را نصب کنید یا از روش PWA استفاده کنید
    pause
    exit /b 1
)

echo    در حال استخراج...
if not exist "%SDK_DIR%\cmdline-tools" mkdir "%SDK_DIR%\cmdline-tools"
powershell -Command "& { Expand-Archive -Path '%CMDTOOLS_ZIP%' -DestinationPath '%SDK_DIR%\cmdline-tools' -Force }"
if exist "%SDK_DIR%\cmdline-tools\cmdline-tools" (
    if not exist "%SDK_DIR%\cmdline-tools\latest" (
        ren "%SDK_DIR%\cmdline-tools\cmdline-tools" "latest"
    )
)
del "%CMDTOOLS_ZIP%" 2>nul

set "PATH=%SDK_DIR%\cmdline-tools\latest\bin;%PATH%"
set "ANDROID_HOME=%SDK_DIR%"
set "ANDROID_SDK_ROOT=%SDK_DIR%"

echo    در حال نصب platform و build-tools...
echo y | "%SDK_DIR%\cmdline-tools\latest\bin\sdkmanager.bat" "platforms;android-34" "build-tools;34.0.0" >nul 2>&1
set "PATH=%SDK_DIR%\build-tools\34.0.0;%PATH%"
echo ✅ Android SDK نصب شد

:create_project
:: ──── 3) ساخت پروژه اندروید ────
echo.
echo [3/5] ساخت پروژه اندروید...

set "PROJECT_DIR=%BUILD_DIR%\android-project"
if exist "%PROJECT_DIR%" rmdir /s /q "%PROJECT_DIR%"
mkdir "%PROJECT_DIR%"

:: Directory structure
mkdir "%PROJECT_DIR%\app\src\main\java\com\managerteam\football" 2>nul
mkdir "%PROJECT_DIR%\app\src\main\assets\www" 2>nul
mkdir "%PROJECT_DIR%\app\src\main\res\values" 2>nul
mkdir "%PROJECT_DIR%\app\src\main\res\mipmap-hdpi" 2>nul
mkdir "%PROJECT_DIR%\app\src\main\res\mipmap-mdpi" 2>nul
mkdir "%PROJECT_DIR%\app\src\main\res\mipmap-xhdpi" 2>nul
mkdir "%PROJECT_DIR%\app\src\main\res\mipmap-xxhdpi" 2>nul
mkdir "%PROJECT_DIR%\app\src\main\res\mipmap-xxxhdpi" 2>nul
mkdir "%PROJECT_DIR%\app\src\main\res\drawable" 2>nul
mkdir "%PROJECT_DIR%\gradle\wrapper" 2>nul

:: Copy web assets
echo    کپی فایل‌های وب...
xcopy /E /I /Y /Q "%SCRIPT_DIR%css" "%PROJECT_DIR%\app\src\main\assets\www\css" >nul
xcopy /E /I /Y /Q "%SCRIPT_DIR%js" "%PROJECT_DIR%\app\src\main\assets\www\js" >nul
copy /Y "%SCRIPT_DIR%app.html" "%PROJECT_DIR%\app\src\main\assets\www\index.html" >nul
copy /Y "%SCRIPT_DIR%icon-192.png" "%PROJECT_DIR%\app\src\main\assets\www\" >nul
copy /Y "%SCRIPT_DIR%icon-512.png" "%PROJECT_DIR%\app\src\main\assets\www\" >nul
copy /Y "%SCRIPT_DIR%manifest-app.json" "%PROJECT_DIR%\app\src\main\assets\www\" >nul
copy /Y "%SCRIPT_DIR%sw-app.js" "%PROJECT_DIR%\app\src\main\assets\www\" >nul
copy /Y "%SCRIPT_DIR%index.html" "%PROJECT_DIR%\app\src\main\assets\www\game.html" >nul
copy /Y "%SCRIPT_DIR%service-worker.js" "%PROJECT_DIR%\app\src\main\assets\www\" >nul

:: Fix paths in HTML using PowerShell
powershell -Command "& { $f='%PROJECT_DIR%\app\src\main\assets\www\index.html'; $c=Get-Content $f -Raw; $c=$c -replace 'href=\"\.\/css/app\.css\"','href=\"css/app.css\"'; $c=$c -replace 'src=\"\.\/js/','src=\"js/'; $c=$c -replace 'href=\"\.\/manifest-app\.json\"','href=\"manifest-app.json\"'; $c=$c -replace 'href=\"\.\/icon-192\.png\"','href=\"icon-192.png\"'; $c=$c -replace 'src=\"\.\/sw-app\.js\"','src=\"sw-app.js\"'; Set-Content $f -Value $c -NoNewline }"

:: Generate project files
echo    ساخت فایل‌های پروژه...

:: settings.gradle
(
echo rootProject.name = "ManagerTeam"
echo include ':app'
) > "%PROJECT_DIR%\settings.gradle"

:: build.gradle (root)
(
echo buildscript {
echo     repositories {
echo         google^(^)
echo         mavenCentral^(^)
echo     }
echo     dependencies {
echo         classpath 'com.android.tools.build:gradle:8.1.0'
echo     }
echo }
echo allprojects {
echo     repositories {
echo         google^(^)
echo         mavenCentral^(^)
echo     }
echo }
) > "%PROJECT_DIR%\build.gradle"

:: app/build.gradle
(
echo plugins {
echo     id 'com.android.application'
echo }
echo android {
echo     namespace 'com.managerteam.football'
echo     compileSdk 34
echo     defaultConfig {
echo         applicationId "com.managerteam.football"
echo         minSdk 24
echo         targetSdk 34
echo         versionCode 1
echo         versionName "0.1.0"
echo     }
echo     buildTypes {
echo         release { minifyEnabled false }
echo         debug { minifyEnabled false }
echo     }
echo     compileOptions {
echo         sourceCompatibility JavaVersion.VERSION_11
echo         targetCompatibility JavaVersion.VERSION_11
echo     }
echo }
echo dependencies {
echo     implementation 'androidx.appcompat:appcompat:1.6.1'
echo     implementation 'androidx.webkit:webkit:1.8.0'
echo }
) > "%PROJECT_DIR%\app\build.gradle"

:: gradle.properties
(
echo android.useAndroidX=true
echo org.gradle.jvmargs=-Xmx2048m
) > "%PROJECT_DIR%\gradle.properties"

:: gradle-wrapper.properties
(
echo distributionBase=GRADLE_USER_HOME
echo distributionPath=wrapper/dists
echo distributionUrl=https\://services.gradle.org/distributions/gradle-8.4-bin.zip
echo zipStoreBase=GRADLE_USER_HOME
echo zipStorePath=wrapper/dists
) > "%PROJECT_DIR%\gradle\wrapper\gradle-wrapper.properties"

:: AndroidManifest.xml
(
echo ^<?xml version="1.0" encoding="utf-8"?^>
echo ^<manifest xmlns:android="http://schemas.android.com/apk/res/android"^>
echo     ^<uses-permission android:name="android.permission.INTERNET" /^>
echo     ^<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" /^>
echo     ^<application
echo         android:allowBackup="true"
echo         android:icon="@mipmap/ic_launcher"
echo         android:label="مدیر تیم"
echo         android:supportsRtl="true"
echo         android:theme="@style/AppTheme"
echo         android:usesCleartextTraffic="true"^>
echo         ^<activity
echo             android:name=".MainActivity"
echo             android:exported="true"
echo             android:configChanges="orientation^|screenSize^|keyboardHidden"
echo             android:screenOrientation="portrait"
echo             android:windowSoftInputMode="adjustResize"^>
echo             ^<intent-filter^>
echo                 ^<action android:name="android.intent.action.MAIN" /^>
echo                 ^<category android:name="android.intent.category.LAUNCHER" /^>
echo             ^</intent-filter^>
echo         ^</activity^>
echo     ^</application^>
echo ^</manifest^>
) > "%PROJECT_DIR%\app\src\main\AndroidManifest.xml"

:: MainActivity.java
(
echo package com.managerteam.football;
echo.
echo import android.app.Activity;
echo import android.os.Bundle;
echo import android.view.View;
echo import android.view.Window;
echo import android.view.WindowManager;
echo import android.webkit.WebChromeClient;
echo import android.webkit.WebSettings;
echo import android.webkit.WebView;
echo import android.webkit.WebViewClient;
echo.
echo public class MainActivity extends Activity {
echo     private WebView webView;
echo.
echo     @Override
echo     protected void onCreate^(Bundle savedInstanceState^) {
echo         super.onCreate^(savedInstanceState^);
echo         requestWindowFeature^(Window.FEATURE_NO_TITLE^);
echo         getWindow^(^).setFlags^(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN^);
echo         getWindow^(^).getDecorView^(^).setSystemUiVisibility^(
echo             View.SYSTEM_UI_FLAG_LAYOUT_STABLE ^| View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN ^| View.SYSTEM_UI_FLAG_FULLSCREEN ^| View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY^);
echo         webView = new WebView^(this^);
echo         setContentView^(webView^);
echo         WebSettings settings = webView.getSettings^(^);
echo         settings.setJavaScriptEnabled^(true^);
echo         settings.setDomStorageEnabled^(true^);
echo         settings.setDatabaseEnabled^(true^);
echo         settings.setAllowFileAccess^(true^);
echo         settings.setAllowContentAccess^(true^);
echo         settings.setCacheMode^(WebSettings.LOAD_DEFAULT^);
echo         settings.setMixedContentMode^(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW^);
echo         webView.setWebViewClient^(new WebViewClient^(^)^);
echo         webView.setWebChromeClient^(new WebChromeClient^(^)^);
echo         webView.loadUrl^("file:///android_asset/www/index.html"^);
echo     }
echo.
echo     @Override
echo     public void onBackPressed^(^) {
echo         if ^(webView.canGoBack^(^)^) { webView.goBack^(^); }
echo         else { super.onBackPressed^(^); }
echo     }
echo }
) > "%PROJECT_DIR%\app\src\main\java\com\managerteam\football\MainActivity.java"

:: styles.xml
(
echo ^<?xml version="1.0" encoding="utf-8"?^>
echo ^<resources^>
echo     ^<style name="AppTheme" parent="Theme.AppCompat.NoActionBar"^>
echo         ^<item name="android:windowFullscreen"^>true^</item^>
echo         ^<item name="android:statusBarColor"^>#080e1a^</item^>
echo         ^<item name="android:navigationBarColor"^>#080e1a^</item^>
echo         ^<item name="android:windowBackground"^>#080e1a^</item^>
echo     ^</style^>
echo ^</resources^>
) > "%PROJECT_DIR%\app\src\main\res\values\styles.xml"

:: Copy icons
for %%d in (mdpi hdpi xhdpi xxhdpi xxxhdpi) do (
    copy /Y "%SCRIPT_DIR%icon-192.png" "%PROJECT_DIR%\app\src\main\res\mipmap-%%d\ic_launcher.png" >nul
)

echo ✅ پروژه ساخته شد

:: ──── 4) بیلد APK ────
echo.
echo [4/5] بیلد APK (ممکن است ۵-۱۰ دقیقه طول بکشد)...
echo.

cd /d "%PROJECT_DIR%"

:: Try to use gradle wrapper
set "GRADLEW=%PROJECT_DIR%\gradlew.bat"

:: Download gradle if needed
set "GRADLE_DIR=%BUILD_DIR%\gradle-8.4"
if not exist "%GRADLE_DIR%\bin\gradle.bat" (
    echo    دانلود Gradle...
    set "GRADLE_ZIP=%BUILD_DIR%\gradle.zip"
    powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://services.gradle.org/distributions/gradle-8.4-bin.zip' -OutFile '%GRADLE_ZIP%' -UseBasicParsing }" 2>nul
    powershell -Command "& { Expand-Archive -Path '%GRADLE_ZIP%' -DestinationPath '%BUILD_DIR%' -Force }"
    del "%GRADLE_ZIP%" 2>nul
)

set "GRADLE_EXE=%GRADLE_DIR%\bin\gradle.bat"
if exist "%GRADLE_EXE%" (
    call "%GRADLE_EXE%" assembleDebug --no-daemon --console=plain -p "%PROJECT_DIR%"
) else (
    echo ❌ Gradle پیدا نشد
    echo    لطفاً Android Studio را نصب کنید
    pause
    exit /b 1
)

:: ──── 5) کپی APK ────
echo.
echo [5/5] کپی APK...

set "APK_PATH=%PROJECT_DIR%\app\build\outputs\apk\debug\app-debug.apk"
if exist "%APK_PATH%" (
    if not exist "%SCRIPT_DIR%dist" mkdir "%SCRIPT_DIR%dist"
    copy /Y "%APK_PATH%" "%SCRIPT_DIR%dist\%APK_NAME%.apk" >nul
    echo.
    echo ✅ APK ساخته شد!
    echo.
    echo 📍 مسیر: %SCRIPT_DIR%dist\%APK_NAME%.apk
    echo.
    echo برای نصب روی گوشی:
    echo   1. فایل APK رو با کابل USB یا واتساپ به گوشی منتقل کن
    echo   2. روی فایل بزن تا نصب بشه
    echo   3. اگه اجازه نداد: تنظیمات ^> امنیت ^> نصب از منابع ناشناس
    echo.
) else (
    echo ❌ بیلد ناموفق بود
    echo    لطفاً مطمئن شوید Java و Android SDK نصب هستند
    echo    یا از Android Studio استفاده کنید
)

pause