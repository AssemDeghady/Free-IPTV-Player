const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('====================================================');
console.log(' FREE IPTV PLAYER — FULL VALIDATION SUITE');
console.log('====================================================');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
    failedTests++;
  }
}

// 1. Validate File Existence
console.log('\n--- 1. File Existence & Structure ---');
const expectedFiles = [
  'config.xml',
  '.tizenproject',
  'icon.png',
  'index.html',
  'README.md',
  'assets/icons/icon-117.png',
  'assets/icons/icon-512.png',
  'css/app.css',
  'css/layout.css',
  'css/navigation.css',
  'js/core/constants.js',
  'js/core/logger.js',
  'js/core/events.js',
  'js/core/http.js',
  'js/storage/storage.js',
  'js/storage/channel-store.js',
  'js/playlist/m3u-parser.js',
  'js/playlist/xtream-api.js',
  'js/playlist/playlist-manager.js',
  'js/player/avplay-engine.js',
  'js/i18n/i18n.js',
  'js/i18n/en.json',
  'js/i18n/ar.json',
  'js/tv/remote.js',
  'js/ui/navigation.js',
  'js/ui/modal.js',
  'js/ui/player.js',
  'js/ui/live-tv.js',
  'js/ui/movies.js',
  'js/ui/series.js',
  'js/ui/guide.js',
  'js/ui/search.js',
  'js/ui/favorites.js',
  'js/ui/settings.js',
  'js/ui/home.js',
  'js/app.js',
  'tests/fixtures/basic.m3u',
  'tests/fixtures/malformed.m3u',
  'tests/fixtures/large.m3u',
  'tests/fixtures/xtream/auth-success.json',
  'tests/fixtures/xtream/auth-fail.json',
  'tests/fixtures/xtream/categories.json',
  'tests/fixtures/xtream/streams.json',
  'tests/fixtures/xtream/malformed.json',
  'tests/fixtures/xtream/vod-categories.json',
  'tests/fixtures/xtream/vod-streams.json',
  'tests/fixtures/xtream/vod-info.json',
  'tests/fixtures/xtream/series-categories.json',
  'tests/fixtures/xtream/series.json',
  'tests/fixtures/xtream/series-info.json',
  'tests/fixtures/xtream/short-epg.json',
  'tests/test-m3u-parser.cjs',
  'tests/test-playlist-manager.cjs',
  'tests/test-http.cjs',
  'tests/test-storage.cjs',
  'tests/test-avplay-engine.cjs',
  'tests/test-tv-interaction.cjs',
  'tests/test-xtream-api.cjs',
  'tests/test-localization-rtl.cjs',
  'tests/test-complete-iptv.cjs'
];

expectedFiles.forEach(file => {
  const filePath = path.resolve(__dirname, '..', file);
  assert(fs.existsSync(filePath), `File exists: ${file}`);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    assert(stats.size > 0, `File has content (${stats.size} bytes): ${file}`);
  }
});

// 2. Validate JSON files
console.log('\n--- 2. JSON Validation ---');
['js/i18n/en.json', 'js/i18n/ar.json'].forEach(jsonFile => {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, '..', jsonFile), 'utf8');
    const parsed = JSON.parse(raw);
    assert(typeof parsed === 'object' && parsed !== null, `Valid JSON in ${jsonFile}`);
    assert(Object.keys(parsed).length >= 25, `Translations present in ${jsonFile} (${Object.keys(parsed).length} keys)`);
  } catch (e) {
    assert(false, `JSON parse error in ${jsonFile}: ${e.message}`);
  }
});

// 3. Validate config.xml
console.log('\n--- 3. config.xml Validation ---');
const configContent = fs.readFileSync(path.resolve(__dirname, '..', 'config.xml'), 'utf8');
assert(configContent.includes('<tizen:application'), 'config.xml contains <tizen:application>');
assert(configContent.includes('package="fiptv00001"'), 'config.xml contains valid 10-char package ID');
assert(configContent.includes('id="fiptv00001.FreeIPTVPlayer"'), 'config.xml contains standard application ID');
assert(configContent.includes('tv.inputdevice'), 'config.xml requests tv.inputdevice privilege');
assert(configContent.includes('internet'), 'config.xml requests internet privilege');
assert(configContent.includes('http://developer.samsung.com/privilege/avplay'), 'config.xml requests avplay privilege');
assert(configContent.includes('http://developer.samsung.com/privilege/productinfo'), 'config.xml requests productinfo privilege');
assert(configContent.includes('name="tv-samsung"'), 'config.xml targets tv-samsung profile');
assert(configContent.includes('exec="index.html"'), 'config.xml defines index.html as entry point');

// 4. Validate HTML references
console.log('\n--- 4. HTML Reference Integrity ---');
const htmlContent = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

// Match css stylesheets
const cssMatches = [...htmlContent.matchAll(/<link[^>]+href=["']([^"']+)["']/g)].map(m => m[1]);
cssMatches.forEach(cssRef => {
  const absPath = path.resolve(__dirname, '..', cssRef);
  assert(fs.existsSync(absPath), `HTML link stylesheet exists on disk: ${cssRef}`);
});

// Match scripts
const scriptMatches = [...htmlContent.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1]);
scriptMatches.forEach(scriptRef => {
  if (scriptRef.startsWith('$WEBAPIS')) {
    assert(true, `HTML includes Samsung WebAPIS hardware runtime script: ${scriptRef}`);
    return;
  }
  const absPath = path.resolve(__dirname, '..', scriptRef);
  assert(fs.existsSync(absPath), `HTML script reference exists on disk: ${scriptRef}`);
});

// 5. Run Modular Sub-test Suites
console.log('\n--- 5. Running Dedicated Test Suites ---');
const suites = [
  'test-m3u-parser.cjs',
  'test-playlist-manager.cjs',
  'test-http.cjs',
  'test-storage.cjs',
  'test-avplay-engine.cjs',
  'test-tv-interaction.cjs',
  'test-xtream-api.cjs',
  'test-localization-rtl.cjs',
  'test-complete-iptv.cjs'
];

suites.forEach(suite => {
  try {
    const suitePath = path.resolve(__dirname, suite);
    execSync(`node "${suitePath}"`, { stdio: 'inherit' });
    assert(true, `Test suite passed: ${suite}`);
  } catch (err) {
    assert(false, `Test suite failed: ${suite}`);
  }
});

console.log('\n====================================================');
console.log(` ALL CHECKS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('====================================================');

if (failedTests > 0) {
  process.exit(1);
}
