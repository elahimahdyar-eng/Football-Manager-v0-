#!/usr/bin/env node
/* ============================================================
   build-apk.js — Automatic APK Builder for "Manager Team"
   ============================================================
   Usage:  node build-apk.js
   Output: dist/manager-game.apk
   ============================================================ */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync, spawn } = require('child_process');
const os = require('os');

const SCRIPT_DIR = __dirname;
const BUILD_DIR = path.join(SCRIPT_DIR, 'build');
const DIST_DIR = path.join(SCRIPT_DIR, 'dist');

// ── Helpers ──
const log = (msg) => console.log(`\x1b[36m[build]\x1b[0m ${msg}`);
const ok = (msg) => console.log(`\x1b[32m[ok]\x1b[0m ${msg}`);
const warn = (msg) => console.log(`\x1b[33m[!]\x1b[0m ${msg}`);
const err = (msg) => { console.error(`\x1b[31m[error]\x1b[0m ${msg}`); process.exit(1); };

function run(cmd, opts = {}) {
    log(`  $ ${cmd}`);
    try {
        return execSync(cmd, { stdio: 'inherit', cwd: opts.cwd || BUILD_DIR, ...opts });
    } catch (e) {
        if (!opts.ignoreError) throw e;
    }
}

function runCapture(cmd, opts = {}) {
    try {
        return execSync(cmd, { encoding: 'utf8', cwd: opts.cwd || BUILD_DIR, ...opts }).trim();
    } catch { return ''; }
}

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const get = url.startsWith('https') ? https.get : http.get;
        get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                file.close();
                fs.unlinkSync(dest);
                return download(response.headers.location, dest).then(resolve).catch(reject);
            }
            const total = parseInt(response.headers['content-length'] || '0');
            let downloaded = 0;
            response.on('data', (chunk) => {
                downloaded += chunk.length;
                if (total > 0) {
                    const pct = Math.round(downloaded / total * 100);
                    process.stdout.write(`\r   Downloading: ${pct}% (${Math.round(downloaded/1024/1024)}MB)`);
                }
            });
            response.pipe(file);
            file.on('finish', () => { file.close(); console.log(''); resolve(); });
        }).on('error', (e) => { fs.unlinkSync(dest); reject(e); });
    });
}

function unzip(zipPath, dest) {
    const AdmZip = (() => {
        try { return require('adm-zip'); } catch { return null; }
    })();
    if (AdmZip) {
        new AdmZip(zipPath).extractAllTo(dest, true);
        return;
    }
    // Fallback: use system tools
    if (os.platform() === 'win32') {
        run(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${dest}' -Force"`, { cwd: SCRIPT_DIR });
    } else {
        run(`unzip -o "${zipPath}" -d "${dest}"`, { cwd: SCRIPT_DIR });
    }
}

function mkdirp(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        mkdirp(dest);
        for (const f of fs.readdirSync(src)) {
            copyRecursive(path.join(src, f), path.join(dest, f));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

function replaceInFile(filePath, replacements) {
    let content = fs.readFileSync(filePath, 'utf8');
    for (const [from, to] of replacements) {
        content = content.split(from).join(to);
    }
    fs.writeFileSync(filePath, content);
}

// ── Platform detection ──
const PLATFORM = os.platform(); // 'win32', 'darwin', 'linux'
const ARCH = os.arch(); // 'x64', 'arm64'

function getJdkUrl() {
    if (PLATFORM === 'win32') {
        return 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jdk_x64_windows_hotspot_17.0.9_9.zip';
    } else if (PLATFORM === 'darwin') {
        return ARCH === 'arm64'
            ? 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jdk_aarch64_mac_hotspot_17.0.9_9.tar.gz'
            : 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jdk_x64_mac_hotspot_17.0.9_9.tar.gz';
    } else {
        return ARCH === 'arm64'
            ? 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jdk_aarch64_linux_hotspot_17.0.9_9.tar.gz'
            : 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jdk_x64_linux_hotspot_17.0.9_9.tar.gz';
    }
}

function getCmdToolsUrl() {
    if (PLATFORM === 'win32') return 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip';
    if (PLATFORM === 'darwin') return 'https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip';
    return 'https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip';
}

// ── Step 1: Java ──
async function ensureJava() {
    log('Step 1/5: Checking Java...');
    const javaPath = runCapture('java -version 2>&1');
    if (javaPath) {
        ok('Java found');
        return;
    }

    warn('Java not found — downloading JDK 17...');
    const jdkDir = path.join(BUILD_DIR, 'jdk');
    mkdirp(jdkDir);

    const url = getJdkUrl();
    const ext = url.endsWith('.zip') ? '.zip' : '.tar.gz';
    const archive = path.join(BUILD_DIR, 'jdk' + ext);

    await download(url, archive);
    log('Extracting JDK...');
    if (ext === '.zip') {
        unzip(archive, jdkDir);
    } else {
        run(`tar -xzf "${archive}" -C "${jdkDir}" --strip-components=1`);
    }
    fs.unlinkSync(archive);

    // Find JAVA_HOME
    const entries = fs.readdirSync(jdkDir);
    const jdkSub = entries.find(e => e.startsWith('jdk')) || entries[0];
    const javaHome = path.join(jdkDir, jdkSub);
    process.env.JAVA_HOME = javaHome;
    process.env.PATH = path.join(javaHome, 'bin') + path.delimiter + process.env.PATH;
    ok('JDK 17 installed');
}

// ── Step 2: Android SDK ──
async function ensureAndroidSdk() {
    log('Step 2/5: Checking Android SDK...');
    const sdkDir = path.join(BUILD_DIR, 'android-sdk');
    const platformsDir = path.join(sdkDir, 'platforms', 'android-34');
    const buildToolsDir = path.join(sdkDir, 'build-tools');

    if (fs.existsSync(platformsDir) && fs.existsSync(buildToolsDir)) {
        const btVer = fs.readdirSync(buildToolsDir)[0];
        if (btVer) {
            process.env.ANDROID_HOME = sdkDir;
            process.env.ANDROID_SDK_ROOT = sdkDir;
            process.env.PATH = path.join(buildToolsDir, btVer) + path.delimiter + process.env.PATH;
            ok('Android SDK found');
            return;
        }
    }

    warn('Android SDK not found — downloading...');
    mkdirp(sdkDir);

    const url = getCmdToolsUrl();
    const archive = path.join(BUILD_DIR, 'cmdtools.zip');
    await download(url, archive);

    log('Extracting...');
    const cmdLineDir = path.join(sdkDir, 'cmdline-tools');
    mkdirp(cmdLineDir);
    unzip(archive, cmdLineDir);

    // Rename to 'latest'
    const extracted = path.join(cmdLineDir, 'cmdline-tools');
    const latest = path.join(cmdLineDir, 'latest');
    if (fs.existsSync(extracted) && !fs.existsSync(latest)) {
        fs.renameSync(extracted, latest);
    }
    fs.unlinkSync(archive);

    process.env.ANDROID_HOME = sdkDir;
    process.env.ANDROID_SDK_ROOT = sdkDir;

    const sdkmanager = path.join(cmdLineDir, 'latest', 'bin',
        PLATFORM === 'win32' ? 'sdkmanager.bat' : 'sdkmanager');
    process.env.PATH = path.join(cmdLineDir, 'latest', 'bin') + path.delimiter + process.env.PATH;

    log('Installing platform & build-tools (this may take a few minutes)...');
    run(`"${sdkmanager}" --sdk_root="${sdkDir}" "platforms;android-34" "build-tools;34.0.0"`, {
        cwd: SCRIPT_DIR,
        env: { ...process.env, JAVA_HOME: process.env.JAVA_HOME, ANDROID_HOME: sdkDir, PATH: process.env.PATH }
    });

    const btPath = path.join(buildToolsDir, '34.0.0');
    process.env.PATH = btPath + path.delimiter + process.env.PATH;
    ok('Android SDK installed');
}

// ── Step 3: Create Android Project ──
function createProject() {
    log('Step 3/5: Creating Android project...');
    const projectDir = path.join(BUILD_DIR, 'android-project');

    // Clean
    if (fs.existsSync(projectDir)) fs.rmSync(projectDir, { recursive: true });

    // Create directories
    const dirs = [
        'app/src/main/java/com/managerteam/football',
        'app/src/main/assets/www/css',
        'app/src/main/assets/www/js',
        'app/src/main/res/values',
        'app/src/main/res/mipmap-mdpi',
        'app/src/main/res/mipmap-hdpi',
        'app/src/main/res/mipmap-xhdpi',
        'app/src/main/res/mipmap-xxhdpi',
        'app/src/main/res/mipmap-xxxhdpi',
        'app/src/main/res/drawable',
        'gradle/wrapper'
    ];
    dirs.forEach(d => mkdirp(path.join(projectDir, d)));

    // Copy web assets
    const wwwDir = path.join(projectDir, 'app/src/main/assets/www');
    copyRecursive(path.join(SCRIPT_DIR, 'css'), path.join(wwwDir, 'css'));
    copyRecursive(path.join(SCRIPT_DIR, 'js'), path.join(wwwDir, 'js'));
    fs.copyFileSync(path.join(SCRIPT_DIR, 'app.html'), path.join(wwwDir, 'index.html'));
    fs.copyFileSync(path.join(SCRIPT_DIR, 'index.html'), path.join(wwwDir, 'game.html'));
    fs.copyFileSync(path.join(SCRIPT_DIR, 'icon-192.png'), path.join(wwwDir, 'icon-192.png'));
    fs.copyFileSync(path.join(SCRIPT_DIR, 'icon-512.png'), path.join(wwwDir, 'icon-512.png'));
    fs.copyFileSync(path.join(SCRIPT_DIR, 'manifest-app.json'), path.join(wwwDir, 'manifest-app.json'));
    fs.copyFileSync(path.join(SCRIPT_DIR, 'sw-app.js'), path.join(wwwDir, 'sw-app.js'));
    fs.copyFileSync(path.join(SCRIPT_DIR, 'service-worker.js'), path.join(wwwDir, 'service-worker.js'));

    // Fix paths in HTML
    replaceInFile(path.join(wwwDir, 'index.html'), [
        ['href="./css/app.css"', 'href="css/app.css"'],
        ['src="./js/', 'src="js/'],
        ['href="./manifest-app.json"', 'href="manifest-app.json"'],
        ['href="./icon-192.png"', 'href="icon-192.png"'],
        ['src="./sw-app.js"', 'src="sw-app.js"'],
    ]);

    // Also fix paths in game.html (offline mode)
    replaceInFile(path.join(wwwDir, 'game.html'), [
        ['href="./css/style.css"', 'href="css/style.css"'],
        ['src="./js/', 'src="js/'],
    ]);

    // settings.gradle
    fs.writeFileSync(path.join(projectDir, 'settings.gradle'), `rootProject.name = "ManagerTeam"\ninclude ':app'\n`);

    // build.gradle (root)
    fs.writeFileSync(path.join(projectDir, 'build.gradle'), `
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
`);

    // app/build.gradle
    fs.writeFileSync(path.join(projectDir, 'app', 'build.gradle'), `
plugins {
    id 'com.android.application'
}
android {
    namespace 'com.managerteam.football'
    compileSdk 34
    defaultConfig {
        applicationId "com.managerteam.football"
        minSdk 24
        targetSdk 34
        versionCode 1
        versionName "0.1.0"
    }
    buildTypes {
        release { minifyEnabled false }
        debug { minifyEnabled false }
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
`);

    // gradle.properties
    fs.writeFileSync(path.join(projectDir, 'gradle.properties'),
        'android.useAndroidX=true\norg.gradle.jvmargs=-Xmx2048m\n');

    // gradle-wrapper.properties
    fs.writeFileSync(path.join(projectDir, 'gradle', 'wrapper', 'gradle-wrapper.properties'),
        'distributionBase=GRADLE_USER_HOME\ndistributionPath=wrapper/dists\ndistributionUrl=https\\://services.gradle.org/distributions/gradle-8.4-bin.zip\nzipStoreBase=GRADLE_USER_HOME\nzipStorePath=wrapper/dists\n');

    // AndroidManifest.xml
    fs.writeFileSync(path.join(projectDir, 'app/src/main/AndroidManifest.xml'), `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="\u0645\u062f\u06cc\u0631 \u062a\u06cc\u0645"
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
`);

    // MainActivity.java
    fs.writeFileSync(path.join(projectDir, 'app/src/main/java/com/managerteam/football/MainActivity.java'), `package com.managerteam.football;

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
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
`);

    // styles.xml
    fs.writeFileSync(path.join(projectDir, 'app/src/main/res/values/styles.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.NoActionBar">
        <item name="android:windowFullscreen">true</item>
        <item name="android:statusBarColor">#080e1a</item>
        <item name="android:navigationBarColor">#080e1a</item>
        <item name="android:windowBackground">#080e1a</item>
    </style>
</resources>
`);

    // Copy icons
    ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'].forEach(density => {
        fs.copyFileSync(
            path.join(SCRIPT_DIR, 'icon-192.png'),
            path.join(projectDir, `app/src/main/res/mipmap-${density}/ic_launcher.png`)
        );
    });

    ok('Project created');
}

// ── Step 4: Build APK ──
async function buildApk() {
    log('Step 4/5: Building APK (this may take 5-10 minutes)...');
    const projectDir = path.join(BUILD_DIR, 'android-project');

    // Download Gradle
    const gradleDir = path.join(BUILD_DIR, 'gradle-8.4');
    const gradleExe = path.join(gradleDir, 'bin', PLATFORM === 'win32' ? 'gradle.bat' : 'gradle');

    if (!fs.existsSync(gradleExe)) {
        log('Downloading Gradle 8.4...');
        const gradleUrl = 'https://services.gradle.org/distributions/gradle-8.4-bin.zip';
        const gradleZip = path.join(BUILD_DIR, 'gradle.zip');
        await download(gradleUrl, gradleZip);
        log('Extracting Gradle...');
        unzip(gradleZip, BUILD_DIR);
        fs.unlinkSync(gradleZip);
    }

    if (!fs.existsSync(gradleExe)) {
        err('Gradle not found after extraction. Check build/ directory.');
    }

    // Make gradle executable on Unix
    if (PLATFORM !== 'win32') {
        try { execSync(`chmod +x "${gradleExe}"`); } catch {}
    }

    // Build
    const env = {
        ...process.env,
        JAVA_HOME: process.env.JAVA_HOME,
        ANDROID_HOME: process.env.ANDROID_HOME,
        ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT,
        PATH: process.env.PATH
    };

    try {
        execSync(`"${gradleExe}" assembleDebug --no-daemon --console=plain`, {
            cwd: projectDir,
            stdio: 'inherit',
            env
        });
    } catch (e) {
        err('Build failed. Check the error output above.');
    }
}

// ── Step 5: Copy APK ──
function copyApk() {
    log('Step 5/5: Copying APK...');
    const apkPath = path.join(BUILD_DIR, 'android-project', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

    if (!fs.existsSync(apkPath)) {
        err('APK not found after build!');
    }

    mkdirp(DIST_DIR);
    const dest = path.join(DIST_DIR, 'manager-game.apk');
    fs.copyFileSync(apkPath, dest);

    const sizeMB = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
    console.log('');
    console.log('\x1b[32m╔══════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[32m║            APK Successfully Built!           ║\x1b[0m');
    console.log('\x1b[32m╚══════════════════════════════════════════════╝\x1b[0m');
    console.log('');
    console.log(`  Location: ${dest}`);
    console.log(`  Size:     ${sizeMB} MB`);
    console.log('');
    console.log('  To install on your phone:');
    console.log('    1. Transfer the APK via USB cable or WhatsApp');
    console.log('    2. Tap the file to install');
    console.log('    3. If blocked: Settings > Security > Unknown Sources');
    console.log('');
}

// ── Main ──
async function main() {
    console.log('');
    console.log('\x1b[36m╔══════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[36m║     Building APK: "Manager Team" Game       ║\x1b[0m');
    console.log('\x1b[36m╚══════════════════════════════════════════════╝\x1b[0m');
    console.log(`  Platform: ${PLATFORM} (${ARCH})`);
    console.log('');

    mkdirp(BUILD_DIR);

    await ensureJava();
    await ensureAndroidSdk();
    createProject();
    await buildApk();
    copyApk();
}

main().catch(e => {
    console.error('\x1b[31m[error]\x1b[0m', e.message);
    process.exit(1);
});