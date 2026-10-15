import { iconPng } from './native-icon.mjs';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=path=>readFileSync(join(root,path),'utf8');
const write=(path,value)=>writeFileSync(join(root,path),value);
const platform=process.argv[2];
if(!['android','ios'].includes(platform))throw Error('Choose android or ios');
const config=JSON.parse(read('capacitor.config.json'));
if(config.appId!=='cn.okekxf.growth')throw Error('Update native templates together with appId.');
const vector=`<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:fillColor="#DCE2F1" android:pathData="M0,0h108v108h-108z"/><path android:pathData="M33,68 L33,47 L46,57 L62,32 L76,68" android:strokeColor="#425B99" android:strokeWidth="6" android:strokeLineCap="round" android:strokeLineJoin="round" android:fillColor="#00000000"/><path android:fillColor="#2D786A" android:pathData="M62,27 a5,5 0,1 0,0 10 a5,5 0,1 0,0 -10"/></vector>`;
if(platform==='android'){
  const java='android/app/src/main/java/cn/okekxf/growth';mkdirSync(join(root,java),{recursive:true});
  for(const name of ['MainActivity.java','NativeSessionPlugin.java'])copyFileSync(join(root,'native/android',name),join(root,java,name));
  let gradle=read('android/app/build.gradle').replace(/versionCode \d+/,'versionCode 20001').replace(/versionName "[^"]+"/,'versionName "2.0.1"');
  if(!gradle.includes('applicationIdSuffix'))gradle=gradle.replace('buildTypes {','buildTypes {\n        debug { applicationIdSuffix ".dev"; versionNameSuffix "-test" }');
  write('android/app/build.gradle',gradle);
  write('android/app/src/main/AndroidManifest.xml',read('android/app/src/main/AndroidManifest.xml').replace('android:allowBackup="true"','android:allowBackup="false"').replace('<application','<application android:usesCleartextTraffic="false"'));
  // Idempotent regeneration, with no public storage or backup permissions.
  write('android/app/src/main/AndroidManifest.xml',read('android/app/src/main/AndroidManifest.xml').replace(/(android:usesCleartextTraffic="false"\s*){2,}/g,'android:usesCleartextTraffic="false" '));
  write('android/app/src/main/res/xml/file_paths.xml','<paths xmlns:android="http://schemas.android.com/apk/res/android"><cache-path name="exports" path="exports/" /></paths>');
  write('android/app/src/main/res/values/styles.xml',`<resources>
    <style name="AppTheme" parent="Theme.AppCompat.Light.NoActionBar"><item name="colorPrimary">#DCE2F1</item><item name="colorPrimaryDark">#DCE2F1</item><item name="colorAccent">#425B99</item></style>
    <style name="AppTheme.NoActionBar" parent="AppTheme"><item name="windowActionBar">false</item><item name="windowNoTitle">true</item><item name="android:windowLightStatusBar">true</item><item name="android:windowLightNavigationBar">true</item><item name="android:windowBackground">#DCE2F1</item></style>
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen"><item name="windowSplashScreenBackground">#DCE2F1</item><item name="windowSplashScreenAnimatedIcon">@drawable/growth_icon</item><item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item></style>
  </resources>`);
  write('android/app/src/main/res/drawable/growth_icon.xml',vector);
  // Vector fallback and adaptive icons replace Capacitor's template logo.
  for(const name of readdirSync(join(root,'android/app/src/main/res')).filter(x=>x.startsWith('mipmap-'))){
    const dir=join(root,'android/app/src/main/res',name);
    for(const file of readdirSync(dir))if(file.startsWith('ic_launcher'))rmSync(join(dir,file));
  }
  mkdirSync(join(root,'android/app/src/main/res/mipmap-anydpi'),{recursive:true});
  for(const name of ['ic_launcher','ic_launcher_round'])write('android/app/src/main/res/mipmap-anydpi/'+name+'.xml',vector);
  for(const name of ['ic_launcher','ic_launcher_round'])write('android/app/src/main/res/mipmap-anydpi-v26/'+name+'.xml','<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/growth_background"/><foreground android:drawable="@drawable/growth_icon"/></adaptive-icon>');
  write('android/app/src/main/res/values/growth.xml','<resources><color name="growth_background">#DCE2F1</color></resources>');
}else{
  const delegate='ios/App/App/AppDelegate.swift',marker='// BEGIN GROWTH NATIVE';
  write(delegate,read(delegate).split(marker)[0].trimEnd()+'\n\n'+marker+'\n'+read('native/ios/NativeSession.swift'));
  const storyboard='ios/App/App/Base.lproj/Main.storyboard';
  write(storyboard,read(storyboard).replace('customClass="CAPBridgeViewController" customModule="Capacitor"','customClass="GrowthViewController" customModule="App"'));
  const project='ios/App/App.xcodeproj/project.pbxproj';
  write(project,read(project).replace(/MARKETING_VERSION = [^;]+;/g,'MARKETING_VERSION = 2.0.1;').replace(/CURRENT_PROJECT_VERSION = [^;]+;/g,'CURRENT_PROJECT_VERSION = 20001;'));
  const info='ios/App/App/Info.plist';
  let plist=read(info);
  if(!plist.includes('<key>UIUserInterfaceStyle</key>'))plist=plist.replace('</dict>\n</plist>','<key>UIUserInterfaceStyle</key><string>Light</string>\n</dict>\n</plist>');
  write(info,plist);
  // Filesystem access reasons are declared for the bundled native plugin.
  write('ios/App/App/PrivacyInfo.xcprivacy',`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>NSPrivacyTracking</key><false/><key>NSPrivacyTrackingDomains</key><array/><key>NSPrivacyAccessedAPITypes</key><array><dict><key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryFileTimestamp</string><key>NSPrivacyAccessedAPITypeReasons</key><array><string>C617.1</string></array></dict></array></dict></plist>`);
}
console.log(`Prepared ${platform}: secure session, theme, version 2.0.1`);

if(platform==='ios'){
  write('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',iconPng());
  const splash='ios/App/App/Assets.xcassets/Splash.imageset';
  for(const image of JSON.parse(read(splash+'/Contents.json')).images)if(image.filename)write(splash+'/'+image.filename,iconPng(192*Number(image.scale[0])));
  const launch='ios/App/App/Base.lproj/LaunchScreen.storyboard';
  write(launch,read(launch).replace('contentMode="scaleAspectFill"','contentMode="center"').replace('<color key="backgroundColor" systemColor="systemBackgroundColor"/>','<color key="backgroundColor" red="0.862745" green="0.886275" blue="0.945098" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>'));
  const project='ios/App/App.xcodeproj/project.pbxproj';
  let pbx=read(project);
  if(!pbx.includes('PrivacyInfo.xcprivacy')){
    pbx=pbx.replace('/* End PBXBuildFile section */','AA0000000000000000000001 /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = AA0000000000000000000002; };\n/* End PBXBuildFile section */')
      .replace('/* End PBXFileReference section */','AA0000000000000000000002 /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };\n/* End PBXFileReference section */')
      .replace('504EC30E1FED79650016851F /* Assets.xcassets */,','504EC30E1FED79650016851F /* Assets.xcassets */,\n                AA0000000000000000000002 /* PrivacyInfo.xcprivacy */,')
      .replace('504EC30F1FED79650016851F /* Assets.xcassets in Resources */,','504EC30F1FED79650016851F /* Assets.xcassets in Resources */,\n                AA0000000000000000000001 /* PrivacyInfo.xcprivacy in Resources */,');
    write(project,pbx);
  }
}
