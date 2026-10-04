/**
 * Free IPTV Player — HTTP Layer Test Suite
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

console.log('\n--- Running HTTP Layer Tests ---');

// Mock XMLHttpRequest
function createMockXHR(behavior) {
  return function MockXMLHttpRequest() {
    this.timeout = 0;
    this.headers = {};
    this.open = function (method, url) {
      this.method = method;
      this.url = url;
    };
    this.setRequestHeader = function (k, v) {
      this.headers[k] = v;
    };
    this.send = function () {
      const self = this;
      setTimeout(() => {
        if (behavior.type === 'success') {
          self.status = behavior.status || 200;
          self.statusText = behavior.statusText || 'OK';
          self.responseText = behavior.data || '';
          if (self.onload) self.onload();
        } else if (behavior.type === 'http_error') {
          self.status = behavior.status || 404;
          self.statusText = behavior.statusText || 'Not Found';
          self.responseText = behavior.data || '';
          if (self.onload) self.onload();
        } else if (behavior.type === 'network_error') {
          if (self.onerror) self.onerror();
        } else if (behavior.type === 'timeout') {
          if (self.ontimeout) self.ontimeout();
        }
      }, 5);
    };
  };
}

const mockWindow = {
  FreeIPTV: {},
  console: console
};

const context = vm.createContext({
  window: mockWindow,
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  Promise: Promise
});

const httpCode = fs.readFileSync(path.resolve(__dirname, '../js/core/http.js'), 'utf8');
vm.runInContext(httpCode, context);
const Http = mockWindow.FreeIPTV.Http;

async function runHttpTests() {
  try {
    // 1. Validation: Empty URL
    try {
      await Http.get('');
      assert(false, 'Expected empty URL to reject');
    } catch (e) {
      assert(e.code === 'INVALID_URL', 'Empty URL rejected with INVALID_URL');
    }

    // 2. Validation: Unsupported protocol
    try {
      await Http.get('ftp://example.com/playlist.m3u');
      assert(false, 'Expected unsupported protocol to reject');
    } catch (e) {
      assert(e.code === 'UNSUPPORTED_PROTOCOL', 'Unsupported protocol rejected with UNSUPPORTED_PROTOCOL');
    }

    // 3. Mock XHR Success
    context.XMLHttpRequest = createMockXHR({
      type: 'success',
      status: 200,
      data: '#EXTM3U\n#EXTINF:-1,Test\nhttp://stream.m3u8\n'
    });

    const successRes = await Http.get('https://example.com/playlist.m3u');
    assert(successRes.status === 200, 'HTTP status is 200');
    assert(successRes.data.includes('#EXTM3U'), 'HTTP response text received');

    // 4. Mock XHR 404
    context.XMLHttpRequest = createMockXHR({
      type: 'http_error',
      status: 404,
      statusText: 'Not Found'
    });

    try {
      await Http.get('https://example.com/missing.m3u');
      assert(false, 'Expected 404 to reject');
    } catch (e) {
      assert(e.code === 'HTTP_404', '404 rejected with HTTP_404 code');
      assert(e.message.includes('not found'), 'Clear user-friendly 404 message');
    }

    // 5. Mock XHR 403
    context.XMLHttpRequest = createMockXHR({
      type: 'http_error',
      status: 403,
      statusText: 'Forbidden'
    });

    try {
      await Http.get('https://example.com/denied.m3u');
      assert(false, 'Expected 403 to reject');
    } catch (e) {
      assert(e.code === 'HTTP_403', '403 rejected with HTTP_403 code');
      assert(e.message.includes('denied'), 'Clear user-friendly 403 message');
    }

    // 6. Mock XHR 500
    context.XMLHttpRequest = createMockXHR({
      type: 'http_error',
      status: 500,
      statusText: 'Internal Server Error'
    });

    try {
      await Http.get('https://example.com/server_err.m3u');
      assert(false, 'Expected 500 to reject');
    } catch (e) {
      assert(e.code === 'HTTP_500', '500 rejected with HTTP_500 code');
    }

    // 7. Mock Network Error
    context.XMLHttpRequest = createMockXHR({
      type: 'network_error'
    });

    try {
      await Http.get('https://example.com/offline.m3u');
      assert(false, 'Expected network error to reject');
    } catch (e) {
      assert(e.code === 'NETWORK_ERROR', 'Network error rejected with NETWORK_ERROR code');
      assert(e.message.includes('connection failed'), 'Clear network error description');
    }

    // 8. Mock Timeout
    context.XMLHttpRequest = createMockXHR({
      type: 'timeout'
    });

    try {
      await Http.get('https://example.com/slow.m3u', { timeout: 1000 });
      assert(false, 'Expected timeout to reject');
    } catch (e) {
      assert(e.code === 'TIMEOUT', 'Timeout rejected with TIMEOUT code');
      assert(e.message.includes('timed out'), 'Clear timeout description');
    }

    console.log(`HTTP Layer Results: ${passed} passed, ${failed} failed.\n`);
    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Fatal error during HTTP tests:', err);
    process.exit(1);
  }
}

runHttpTests();
