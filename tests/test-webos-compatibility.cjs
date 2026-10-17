/**
 * Free IPTV Player — LG webOS TV Compatibility & Architecture Validation Suite
 * Verifies webOS manifest compliance, ACG declaration, key mapping (461 / Channel Up-Down),
 * Magic Remote pointer normalization, video playback adapter routing, and lifecycle events.
 */

const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log(' RUNNING SUITE: test-webos-compatibility.cjs');
console.log('================================================================');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

// -----------------------------------------------------------------------------
// 1. Validate appinfo.json (Manifest & Mandatory LG webOS 2026 ACG Specification)
// -----------------------------------------------------------------------------
console.log('\n--- 1. appinfo.json Validation (webOS TV Manifest & ACG) ---');
const appinfoPath = path.resolve(__dirname, '..', 'appinfo.json');
assert(fs.existsSync(appinfoPath), 'appinfo.json exists in root directory');

const appinfoRaw = fs.readFileSync(appinfoPath, 'utf8');
let appinfo;
try {
  appinfo = JSON.parse(appinfoRaw);
  assert(typeof appinfo === 'object' && appinfo !== null, 'appinfo.json is valid JSON');
} catch (e) {
  assert(false, `Failed to parse appinfo.json: ${e.message}`);
}

if (appinfo) {
  assert(appinfo.id === 'org.freeiptvplayer.app', `appinfo.json id is '${appinfo.id}'`);
  assert(typeof appinfo.version === 'string' && /^\d+\.\d+\.\d+$/.test(appinfo.version), `appinfo.json version is valid semver: ${appinfo.version}`);
  assert(appinfo.vendor === 'Free IPTV Player' || appinfo.vendor === 'Free IPTV Player Team', `appinfo.json vendor is '${appinfo.vendor}'`);
  assert(appinfo.type === 'web', 'appinfo.json type is "web"');
  assert(appinfo.main === 'index.html', 'appinfo.json main entry point is "index.html"');
  assert(appinfo.resolution === '1920x1080', 'appinfo.json resolution is FHD (1920x1080)');
  assert(appinfo.disableBackHistoryAPI === true, 'appinfo.json disableBackHistoryAPI is true (LG remote back button handling)');
  assert(appinfo.handlesRelaunch === true, 'appinfo.json handlesRelaunch is true (webOS background relaunch handling)');
  assert(Array.isArray(appinfo.requiredACG), 'appinfo.json declares requiredACG array (MANDATORY on webOS 26+)');
  assert(appinfo.requiredACG.length === 0, 'appinfo.json requiredACG is empty array [] (no privileged Luna API required)');
  assert(fs.existsSync(path.resolve(__dirname, '..', appinfo.icon)), `appinfo.json icon exists: ${appinfo.icon}`);
  assert(fs.existsSync(path.resolve(__dirname, '..', appinfo.largeIcon)), `appinfo.json largeIcon exists: ${appinfo.largeIcon}`);
}

// -----------------------------------------------------------------------------
// 2. Validate webOSTV.js SDK & index.html Inclusions
// -----------------------------------------------------------------------------
console.log('\n--- 2. webOSTV.js SDK & HTML Inclusions ---');
const webosSdkPath = path.resolve(__dirname, '..', 'js/vendor/webOSTV.js');
assert(fs.existsSync(webosSdkPath), 'js/vendor/webOSTV.js exists');
const webosSdkContent = fs.readFileSync(webosSdkPath, 'utf8');
assert(webosSdkContent.length > 5000, `js/vendor/webOSTV.js is populated (${webosSdkContent.length} bytes)`);
assert(webosSdkContent.includes('webOS'), 'js/vendor/webOSTV.js contains webOS global export');

const htmlContent = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
assert(htmlContent.includes('js/vendor/webOSTV.js'), 'index.html includes js/vendor/webOSTV.js');
assert(htmlContent.includes('js/core/platform.js'), 'index.html includes js/core/platform.js');

// -----------------------------------------------------------------------------
// 3. Validate Platform Detector (js/core/platform.js)
// -----------------------------------------------------------------------------
console.log('\n--- 3. Cross-Platform Runtime Detector (Platform.js) ---');
const platformCode = fs.readFileSync(path.resolve(__dirname, '..', 'js/core/platform.js'), 'utf8');

// Test in clean mock environment
function createMockPlatformEnv(envType) {
  const mockWindow = {
    FreeIPTV: {},
    navigator: { userAgent: 'Node.js Test' }
  };

  if (envType === 'samsung') {
    mockWindow.tizen = { application: { getCurrentApplication: () => ({ exit: () => { mockWindow._exited = true; } }) } };
    mockWindow.webapis = { avplay: {} };
  } else if (envType === 'webos') {
    mockWindow.PalmSystem = { platformBack: () => { mockWindow._exited = true; }, activate: () => { mockWindow._activated = true; } };
    mockWindow.webOS = { platform: { tv: true }, platformBack: () => { mockWindow._exited = true; } };
    mockWindow.navigator.userAgent = 'Mozilla/5.0 (Web0S; SmartTV; Linux/SmartTV) AppleWebKit/537.36';
  }

  const fn = new Function('window', platformCode);
  fn(mockWindow);
  return mockWindow;
}

const samsungEnv = createMockPlatformEnv('samsung');
assert(samsungEnv.FreeIPTV.Platform.isTizen() === true, 'Platform.isTizen() is true on Tizen runtime');
assert(samsungEnv.FreeIPTV.Platform.isWebOS() === false, 'Platform.isWebOS() is false on Tizen runtime');
assert(samsungEnv.FreeIPTV.Platform.detect() === 'samsung', 'Platform.detect() returns "samsung" on Tizen runtime');
assert(samsungEnv.FreeIPTV.Platform.getName() === 'Samsung Tizen TV', 'Platform.getName() returns "Samsung Tizen TV"');

const webosEnv = createMockPlatformEnv('webos');
assert(webosEnv.FreeIPTV.Platform.isTizen() === false, 'Platform.isTizen() is false on webOS runtime');
assert(webosEnv.FreeIPTV.Platform.isWebOS() === true, 'Platform.isWebOS() is true on webOS runtime');
assert(webosEnv.FreeIPTV.Platform.detect() === 'webos', 'Platform.detect() returns "webos" on webOS runtime');
assert(webosEnv.FreeIPTV.Platform.getName() === 'LG webOS TV', 'Platform.getName() returns "LG webOS TV"');

// Test webOS exitApp
webosEnv.FreeIPTV.Platform.exitApp();
assert(webosEnv._exited === true, 'Platform.exitApp() invokes webOS platformBack() cleanly');

// Test Platform.initLifecycle
const mockDoc = {
  listeners: {},
  addEventListener: function (type, cb) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(cb);
  }
};
const browserMock = {
  FreeIPTV: {
    Events: { emit: (ev, d) => { browserMock._emitted = browserMock._emitted || []; browserMock._emitted.push({ ev, d }); } }
  },
  PalmSystem: { activate: () => { browserMock._activated = true; } },
  document: mockDoc,
  navigator: { userAgent: 'test' }
};
const fnPlat = new Function('window', 'document', platformCode);
fnPlat(browserMock, mockDoc);
browserMock.FreeIPTV.Platform.initLifecycle();

assert(Array.isArray(mockDoc.listeners.webOSLaunch), 'Platform.initLifecycle registers webOSLaunch listener');
assert(Array.isArray(mockDoc.listeners.webOSRelaunch), 'Platform.initLifecycle registers webOSRelaunch listener');
assert(Array.isArray(mockDoc.listeners.lowMemory), 'Platform.initLifecycle registers lowMemory listener');
assert(Array.isArray(mockDoc.listeners.visibilitychange), 'Platform.initLifecycle registers visibilitychange listener');

// Trigger webOSRelaunch
mockDoc.listeners.webOSRelaunch[0]({ detail: { dummy: 1 } });
assert(browserMock._activated === true, 'webOSRelaunch calls PalmSystem.activate() to foreground window');

// -----------------------------------------------------------------------------
// 4. Validate Remote & Key Codes (RETURN_WEBOS, Channel Up/Down)
// -----------------------------------------------------------------------------
console.log('\n--- 4. Remote Control & LG Key Normalization ---');
const constantsCode = fs.readFileSync(path.resolve(__dirname, '..', 'js/core/constants.js'), 'utf8');
const mockConstantsWindow = { FreeIPTV: {} };
new Function('window', constantsCode)(mockConstantsWindow);
const KEYS = mockConstantsWindow.FreeIPTV.Constants.KEYS;

assert(KEYS.RETURN_WEBOS === 461, 'Constants.KEYS.RETURN_WEBOS is 461');
assert(KEYS.CHANNEL_UP === 33, 'Constants.KEYS.CHANNEL_UP is 33 (PageUp)');
assert(KEYS.CHANNEL_DOWN === 34, 'Constants.KEYS.CHANNEL_DOWN is 34 (PageDown)');

const remoteCode = fs.readFileSync(path.resolve(__dirname, '..', 'js/tv/remote.js'), 'utf8');
assert(remoteCode.includes('Constants.KEYS.RETURN_WEBOS'), 'Remote.handleKeyDown handles Constants.KEYS.RETURN_WEBOS (LG Back button)');
assert(remoteCode.includes('cursorStateChange'), 'Remote handles webOS cursorStateChange event for Magic Remote');
assert(remoteCode.includes('webos-tv'), 'Remote adds webos-tv class to document.body on webOS');
assert(remoteCode.includes('Constants.KEYS.CHANNEL_UP'), 'Remote handles CHANNEL_UP for live TV zapping');
assert(remoteCode.includes('Constants.KEYS.CHANNEL_DOWN'), 'Remote handles CHANNEL_DOWN for live TV zapping');

// -----------------------------------------------------------------------------
// 5. Validate PlayerManager & HTML5 Video Engine Routing
// -----------------------------------------------------------------------------
console.log('\n--- 5. PlayerManager & HTML5 Engine Routing for webOS ---');
const playerManagerCode = fs.readFileSync(path.resolve(__dirname, '..', 'js/player/player-manager.js'), 'utf8');
const html5AdapterCode = fs.readFileSync(path.resolve(__dirname, '..', 'js/player/html5-adapter.js'), 'utf8');

const mockPlayerEnv = {
  FreeIPTV: {
    Platform: {
      isWebOS: () => true,
      detect: () => 'webos'
    }
  },
  PalmSystem: {},
  document: {
    getElementById: () => null,
    createElement: () => ({ setAttribute: () => {}, style: {}, addEventListener: () => {} }),
    body: { appendChild: () => {} }
  },
  navigator: { userAgent: 'webOS' }
};

new Function('window', 'document', html5AdapterCode)(mockPlayerEnv, mockPlayerEnv.document);
new Function('window', 'document', playerManagerCode)(mockPlayerEnv, mockPlayerEnv.document);

assert(mockPlayerEnv.FreeIPTV.PlayerManager.detectPlatform() === 'webos', 'PlayerManager identifies "webos" as current platform');
const adapter = mockPlayerEnv.FreeIPTV.PlayerManager.getAdapter();
assert(adapter instanceof mockPlayerEnv.FreeIPTV.HTML5PlaybackAdapter, 'PlayerManager selects HTML5PlaybackAdapter on webOS');
assert(typeof adapter.prepareAsync === 'function', 'HTML5PlaybackAdapter has prepareAsync() method (AVPlayEngine parity)');
assert(typeof mockPlayerEnv.FreeIPTV.PlayerManager.prepareAsync === 'function', 'PlayerManager has prepareAsync() method');
assert(typeof mockPlayerEnv.FreeIPTV.PlayerManager.STATES === 'object', 'PlayerManager exports STATES dictionary');
assert(adapter.diagnostics.platform === 'LG webOS TV', 'HTML5PlaybackAdapter diagnostics detects "LG webOS TV"');

// -----------------------------------------------------------------------------
// 6. Validate CSS Layering & Styling (layout.css & navigation.css)
// -----------------------------------------------------------------------------
console.log('\n--- 6. CSS Layering & Pointer Styles ---');
const layoutCss = fs.readFileSync(path.resolve(__dirname, '..', 'css/layout.css'), 'utf8');
assert(layoutCss.includes('body.webos-tv.player-active'), 'layout.css contains body.webos-tv.player-active override');
assert(layoutCss.includes('background: #000000 !important'), 'layout.css sets opaque black background for webOS player');

const navCss = fs.readFileSync(path.resolve(__dirname, '..', 'css/navigation.css'), 'utf8');
assert(navCss.includes('body.webos-tv .focusable'), 'navigation.css contains body.webos-tv .focusable rule');
assert(navCss.includes('cursor: pointer'), 'navigation.css sets cursor: pointer for LG Magic Remote');

const liveEpgCss = fs.readFileSync(path.resolve(__dirname, '..', 'css/live-epg.css'), 'utf8');
assert(liveEpgCss.includes('.live-preview-video'), 'live-epg.css styles .live-preview-video');

// -----------------------------------------------------------------------------
// 7. Validate Deployment Tooling & Generated Release Package
// -----------------------------------------------------------------------------
console.log('\n--- 7. Deployment Tooling & Packaging Integrity ---');
const deployWebosScript = path.resolve(__dirname, '..', 'deploy-webos.ps1');
assert(fs.existsSync(deployWebosScript), 'deploy-webos.ps1 deployment script exists');

const releaseDir = path.resolve(__dirname, '..', 'Release');
const ipkFiles = fs.readdirSync(releaseDir).filter(f => f.endsWith('.ipk'));
assert(ipkFiles.length > 0, `Generated webOS .ipk package found in Release directory (${ipkFiles.join(', ')})`);
const ipkStat = fs.statSync(path.join(releaseDir, ipkFiles[0]));
assert(ipkStat.size > 1000000, `webOS .ipk package size is healthy (${(ipkStat.size / (1024 * 1024)).toFixed(2)} MB)`);

console.log('================================================================');
console.log(` SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
