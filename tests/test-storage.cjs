/**
 * Free IPTV Player — Storage Layer Test Suite
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

console.log('\n--- Running Storage Layer Tests ---');

// Mock localStorage with failure simulation
let quotaFail = false;
const mockLocalStorage = (function () {
  let store = {};
  return {
    getItem: k => {
      return store[k] || null;
    },
    setItem: (k, v) => {
      if (quotaFail) {
        throw new Error('QuotaExceededError: DOM Exception 22');
      }
      store[k] = String(v);
    },
    removeItem: k => {
      delete store[k];
    },
    key: i => Object.keys(store)[i] || null,
    get length() { return Object.keys(store).length; },
    _clear: () => { store = {}; }
  };
})();

const mockWindow = {
  FreeIPTV: {},
  localStorage: mockLocalStorage,
  console: console
};

const context = vm.createContext({
  window: mockWindow,
  console: console
});

const storageCode = fs.readFileSync(path.resolve(__dirname, '../js/storage/storage.js'), 'utf8');
vm.runInContext(storageCode, context);
const Storage = mockWindow.FreeIPTV.Storage;

// 1. Basic Persistence & Serialization
Storage.set('user_setting', { theme: 'dark', volume: 80 });
const val = Storage.get('user_setting');
assert(val && val.theme === 'dark' && val.volume === 80, 'Complex object serialized and retrieved accurately');

// 2. Default value fallback
const def = Storage.get('non_existing_key', { fallback: true });
assert(def && def.fallback === true, 'Returns defaultValue when key does not exist');

// 3. Has key
assert(Storage.has('user_setting') === true, 'Storage.has returns true for existing key');
assert(Storage.has('unknown_key') === false, 'Storage.has returns false for non-existing key');

// 4. Remove
Storage.remove('user_setting');
assert(Storage.has('user_setting') === false, 'Storage.remove removes the key');
assert(Storage.get('user_setting') === null, 'Storage.get returns null after remove');

// 5. In-Memory Recovery on QuotaExceededError
quotaFail = true;
const savedInMemory = Storage.set('large_channel_data', { channels: [1, 2, 3] });
assert(savedInMemory === false, 'Storage.set reports false on quota exceeded');
const recovered = Storage.get('large_channel_data');
assert(recovered && recovered.channels.length === 3, 'Data safely retained in memory fallback store');

// 6. Clear
quotaFail = false;
Storage.set('key1', 1);
Storage.set('key2', 2);
Storage.clear();
assert(Storage.has('key1') === false, 'key1 removed on clear');
assert(Storage.has('key2') === false, 'key2 removed on clear');

console.log(`Storage Results: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
