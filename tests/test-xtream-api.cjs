/**
 * Free IPTV Player — Xtream Codes IPTV Provider Test Suite
 * Tests URL normalization, authentication, stream parsing, and error recovery.
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

console.log('\n--- Running Xtream Codes API & Integration Tests ---');

// Mock browser context
const mockStorage = (function () {
  let store = {};
  return {
    getItem: k => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => Object.keys(store)[i] || null,
    get length() { return Object.keys(store).length; },
    _clear: () => { store = {}; }
  };
})();

// Intercept logger outputs for security verification
const logCaptures = [];
const mockLoggerConsole = {
  log: (...args) => logCaptures.push(args.join(' ')),
  info: (...args) => logCaptures.push(args.join(' ')),
  warn: (...args) => logCaptures.push(args.join(' ')),
  error: (...args) => logCaptures.push(args.join(' '))
};

const mockWindow = {
  FreeIPTV: {},
  localStorage: mockStorage,
  console: mockLoggerConsole
};

const context = vm.createContext({
  window: mockWindow,
  console: mockLoggerConsole,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  Promise: Promise,
  Date: Date,
  Math: Math,
  encodeURIComponent: encodeURIComponent
});

const loadFiles = [
  '../js/core/constants.js',
  '../js/core/logger.js',
  '../js/core/events.js',
  '../js/core/http.js',
  '../js/storage/storage.js',
  '../js/storage/channel-store.js',
  '../js/playlist/m3u-parser.js',
  '../js/playlist/xtream-api.js',
  '../js/playlist/playlist-manager.js'
];

loadFiles.forEach(f => {
  const code = fs.readFileSync(path.resolve(__dirname, f), 'utf8');
  vm.runInContext(code, context);
});

const XtreamApi = mockWindow.FreeIPTV.XtreamApi;
const Http = mockWindow.FreeIPTV.Http;
const PlaylistManager = mockWindow.FreeIPTV.PlaylistManager;

// Load fixtures
const authSuccessFixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/xtream/auth-success.json'), 'utf8'));
const authFailFixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/xtream/auth-fail.json'), 'utf8'));
const categoriesFixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/xtream/categories.json'), 'utf8'));
const streamsFixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/xtream/streams.json'), 'utf8'));

async function runTests() {
  try {
    // 1. Server URL Normalization
    console.log('\n--- 1. Server URL Normalization ---');
    assert(XtreamApi.normalizeServerUrl('http://iptv.example.com:8080') === 'http://iptv.example.com:8080', 'Clean URL unchanged');
    assert(XtreamApi.normalizeServerUrl('http://iptv.example.com:8080/') === 'http://iptv.example.com:8080', 'Trailing slash stripped');
    assert(XtreamApi.normalizeServerUrl('http://iptv.example.com:8080////') === 'http://iptv.example.com:8080', 'Multiple trailing slashes stripped');
    assert(XtreamApi.normalizeServerUrl('  https://secure-iptv.net  ') === 'https://secure-iptv.net', 'Whitespace trimmed');
    
    let caughtProtocol = false;
    try {
      XtreamApi.normalizeServerUrl('ftp://insecure-server.com');
    } catch (e) {
      caughtProtocol = true;
    }
    assert(caughtProtocol, 'FTP protocol strictly rejected');

    let caughtMissingHost = false;
    try {
      XtreamApi.normalizeServerUrl('http://');
    } catch (e) {
      caughtMissingHost = true;
    }
    assert(caughtMissingHost, 'URL without host rejected');

    // 2. URL Construction & Parameter Encoding
    console.log('\n--- 2. URL Construction & Parameter Encoding ---');
    const apiUrl = XtreamApi.buildApiUrl('http://server.com:8080', 'user@test', 'p@ss#word!');
    assert(apiUrl.includes('player_api.php'), 'Base endpoint is player_api.php');
    assert(apiUrl.includes('username=user%40test'), 'Username URL-encoded');
    assert(apiUrl.includes('password=p%40ss%23word!'), 'Special character password URL-encoded');

    const catUrl = XtreamApi.buildApiUrl('http://server.com:8080', 'user', 'pass', 'get_live_categories');
    assert(catUrl.includes('&action=get_live_categories'), 'Action get_live_categories included');

    const streamsUrl = XtreamApi.buildApiUrl('http://server.com:8080', 'user', 'pass', 'get_live_streams', { category_id: 5 });
    assert(streamsUrl.includes('&action=get_live_streams'), 'Action get_live_streams included');
    assert(streamsUrl.includes('&category_id=5'), 'Category ID parameter appended');

    // 3. Credential Validation
    console.log('\n--- 3. Credential Validation ---');
    assert(XtreamApi.validateCredentials('http://server.com', 'user', 'pass').isValid === true, 'Valid credentials pass validation');
    assert(XtreamApi.validateCredentials('', 'user', 'pass').isValid === false, 'Empty server URL rejected');
    assert(XtreamApi.validateCredentials('http://server.com', '', 'pass').isValid === false, 'Empty username rejected');
    assert(XtreamApi.validateCredentials('http://server.com', 'user', '').isValid === false, 'Empty password rejected');

    // 4. Authentication Response Parsing
    console.log('\n--- 4. Authentication Response Parsing ---');
    // Mock Http.get for authentication success
    const originalHttpGet = Http.get;
    Http.get = function (url) {
      if (url.includes('action=get_live_categories')) {
        return Promise.resolve({ data: JSON.stringify(categoriesFixture) });
      }
      if (url.includes('action=get_live_streams')) {
        return Promise.resolve({ data: JSON.stringify(streamsFixture) });
      }
      // Base auth
      return Promise.resolve({ data: JSON.stringify(authSuccessFixture) });
    };

    const authResult = await XtreamApi.authenticate('http://iptv.example.com:8080', 'test_user', 'test_password');
    assert(authResult.success === true, 'Authentication succeeds with valid user_info');
    assert(authResult.userInfo.username === 'test_user', 'User info username parsed correctly');
    assert(authResult.userInfo.status === 'Active', 'Account status parsed as Active');
    assert(authResult.serverInfo.url === 'iptv.example.com', 'Server info parsed correctly');

    // 5. Authentication Failure Handling
    console.log('\n--- 5. Authentication Failure Handling ---');
    Http.get = function () {
      return Promise.resolve({ data: JSON.stringify(authFailFixture) });
    };

    let authFailedCaught = false;
    try {
      await XtreamApi.authenticate('http://iptv.example.com:8080', 'wrong_user', 'wrong_pass');
    } catch (e) {
      authFailedCaught = true;
      assert(e.message.includes('Authentication failed'), 'Clear authentication failed error message returned');
    }
    assert(authFailedCaught, 'Authentication failure cleanly rejected');

    // Account Expired status test
    Http.get = function () {
      return Promise.resolve({
        data: JSON.stringify({
          user_info: { auth: 1, status: 'Expired' }
        })
      });
    };
    let expiredCaught = false;
    try {
      await XtreamApi.authenticate('http://iptv.example.com:8080', 'user', 'pass');
    } catch (e) {
      expiredCaught = true;
      assert(e.message.includes('expired'), 'Account expired error returned');
    }
    assert(expiredCaught, 'Expired account rejected');

    // 6. Invalid JSON Handling
    console.log('\n--- 6. Invalid JSON Handling ---');
    Http.get = function () {
      return Promise.resolve({ data: '<html><body>502 Bad Gateway</body></html>' });
    };
    let malformedCaught = false;
    try {
      await XtreamApi.authenticate('http://iptv.example.com:8080', 'user', 'pass');
    } catch (e) {
      malformedCaught = true;
      assert(e.message.includes('malformed'), 'Malformed JSON error handled defensively');
    }
    assert(malformedCaught, 'Invalid non-JSON response rejected without crash');

    // 7. Empty Category Response
    console.log('\n--- 7. Empty Category Response ---');
    Http.get = function () {
      return Promise.resolve({ data: '[]' });
    };
    const emptyCats = await XtreamApi.getCategories('http://iptv.example.com:8080', 'user', 'pass');
    assert(Array.isArray(emptyCats) && emptyCats.length === 0, 'Empty categories response returns empty array');

    // 8. Category Normalization
    console.log('\n--- 8. Category Normalization ---');
    Http.get = function () {
      return Promise.resolve({
        data: JSON.stringify([
          { category_id: "10", category_name: "  Movies HD  ", parent_id: 0 },
          { category_id: "20", category_name: "", parent_id: 0 }, // Missing name
          { category_id: "10", category_name: "Duplicate Cat", parent_id: 0 } // Duplicate ID
        ])
      });
    };
    const normCats = await XtreamApi.getCategories('http://iptv.example.com:8080', 'user', 'pass');
    assert(normCats.length === 2, 'Duplicate category ID skipped, exactly 2 unique categories');
    assert(normCats[0].name === 'Movies HD', 'Whitespace trimmed from category name');
    assert(normCats[1].name === 'Other', 'Empty category name defaulted to "Other"');

    // 9. Live Stream Normalization into Application Channel Model
    console.log('\n--- 9. Live Stream Normalization ---');
    const mockCategories = [
      { id: '1', name: 'News' },
      { id: '2', name: 'Sports' }
    ];
    const normalizedData = XtreamApi.normalizeStreams(streamsFixture, mockCategories, 'http://iptv.example.com:8080', 'myuser', 'mypass', 'pl_test_1');
    assert(normalizedData.channels.length === 3, 'Normalized 3 live channels');

    const ch1 = normalizedData.channels[0];
    assert(ch1.id === 'xtream_pl_test_1_1001', 'Channel ID incorporates provider and stream_id');
    assert(ch1.name === 'Global News 24/7', 'Channel name mapped');
    assert(ch1.groupTitle === 'News', 'Category ID mapped to category name "News"');
    assert(ch1.logoUrl === 'http://iptv.example.com/icons/global_news.png', 'Logo URL mapped');
    assert(ch1.providerType === 'xtream', 'Provider type is xtream');
    assert(ch1.providerId === 'pl_test_1', 'Provider ID saved');
    assert(ch1.isFavorite === false, 'Initially not marked as favorite');

    // 10. Missing Optional Fields
    console.log('\n--- 10. Missing Optional Fields ---');
    const minimalStreams = [
      {
        stream_id: 9999,
        name: 'Minimal Channel'
        // no stream_icon, no category_id, no num, no epg_channel_id, no direct_source
      }
    ];
    const minimalNorm = XtreamApi.normalizeStreams(minimalStreams, [], 'http://iptv.example.com:8080', 'user', 'pass', 'pl_min');
    assert(minimalNorm.channels.length === 1, 'Minimal stream record normalized');
    const minCh = minimalNorm.channels[0];
    assert(minCh.groupTitle === 'Other', 'Missing category defaulted to Other');
    assert(minCh.logoUrl === '', 'Missing logo defaulted to empty string');
    assert(minCh.tvgId === '', 'Missing EPG id defaulted to empty string');
    assert(minCh.streamUrl.includes('/live/user/pass/9999.ts'), 'Default stream extension .ts used when not specified');

    // 11. Duplicate Stream Records
    console.log('\n--- 11. Duplicate Stream Handling ---');
    const duplicateStreams = [
      { stream_id: 555, name: 'Channel A' },
      { stream_id: 555, name: 'Channel A Duplicate' },
      { stream_id: 777, name: 'Channel B' }
    ];
    const deduped = XtreamApi.normalizeStreams(duplicateStreams, [], 'http://iptv.example.com:8080', 'user', 'pass');
    assert(deduped.channels.length === 2, 'Duplicate stream_id deduplicated safely (2 channels kept)');

    // 12. Playable Stream URL Generation
    console.log('\n--- 12. Playable Stream URL Generation ---');
    // Direct source preference test
    const directCh = normalizedData.channels[2]; // Has direct_source in fixture
    assert(directCh.streamUrl === 'http://cdn.example.com/direct/nature_live.m3u8', 'Valid direct_source preferred as stream URL');

    // Container extension test
    const ch2 = normalizedData.channels[1]; // container_extension: "m3u8"
    assert(ch2.streamUrl === 'http://iptv.example.com:8080/live/myuser/mypass/1002.m3u8', 'Container extension .m3u8 preserved');

    // 13. Malformed Stream Records
    console.log('\n--- 13. Malformed Stream Records ---');
    const malformedStreams = [
      null,
      undefined,
      {},
      { name: 'No Stream ID' },
      { stream_id: '   ' },
      { stream_id: 888, name: 'Valid Channel' }
    ];
    const malformedResult = XtreamApi.normalizeStreams(malformedStreams, [], 'http://iptv.example.com:8080', 'user', 'pass');
    assert(malformedResult.channels.length === 1, 'Malformed stream entries safely skipped');
    assert(malformedResult.channels[0].id.includes('888'), 'Only valid entry retained');

    // 14. Network Error Handling
    console.log('\n--- 14. Network Error Handling ---');
    Http.get = function () {
      return Promise.reject({ code: 'NETWORK_ERROR', message: 'Connection failed' });
    };
    let networkErrorCaught = false;
    try {
      await XtreamApi.fetchAll('http://down-server.com', 'user', 'pass');
    } catch (e) {
      networkErrorCaught = true;
    }
    assert(networkErrorCaught, 'Network failure rejected cleanly with Error');

    // 15. Password Security & Sanitization
    console.log('\n--- 15. Password Security & URL Sanitization ---');
    const sensitiveUrl = 'http://iptv.example.com:8080/player_api.php?username=admin&password=SuperSecretPassword123&action=get_live_streams';
    const sanitizedUrl = Http.sanitizeUrl(sensitiveUrl);
    assert(!sanitizedUrl.includes('SuperSecretPassword123'), 'SanitizeUrl strips query password');
    assert(sanitizedUrl.includes('password=***'), 'SanitizeUrl replaces query password with ***');

    const sensitiveStreamUrl = 'http://iptv.example.com:8080/live/admin/SuperSecretPassword123/1234.ts';
    const sanitizedStreamUrl = Http.sanitizeUrl(sensitiveStreamUrl);
    assert(!sanitizedStreamUrl.includes('SuperSecretPassword123'), 'SanitizeUrl strips path password in /live/user/pass/');
    assert(sanitizedStreamUrl.includes('/live/admin/***/'), 'SanitizeUrl replaces path password with ***');

    // Verify logger sanitization
    logCaptures.length = 0;
    mockWindow.FreeIPTV.Logger.info('Connecting to', sensitiveUrl);
    assert(logCaptures.length > 0, 'Logger recorded message');
    assert(!logCaptures[0].includes('SuperSecretPassword123'), 'Logger sanitized password from log output');
    assert(logCaptures[0].includes('password=***'), 'Logger converted password to ***');

    // 16. PlaylistManager Xtream Integration
    console.log('\n--- 16. PlaylistManager Xtream Integration ---');
    // Restore Http.get mock for full flow
    Http.get = function (url) {
      if (url.includes('action=get_live_categories')) {
        return Promise.resolve({ data: JSON.stringify(categoriesFixture) });
      }
      if (url.includes('action=get_live_streams')) {
        return Promise.resolve({ data: JSON.stringify(streamsFixture) });
      }
      return Promise.resolve({ data: JSON.stringify(authSuccessFixture) });
    };

    const addXtreamResult = await PlaylistManager.addXtreamPlaylist('My Premium Xtream', 'http://iptv.example.com:8080', 'test_user', 'test_password');
    assert(addXtreamResult.playlist !== undefined, 'Xtream playlist added to PlaylistManager');
    assert(addXtreamResult.playlist.type === 'xtream', 'Playlist type is xtream');
    assert(addXtreamResult.playlist.name === 'My Premium Xtream', 'Playlist name saved');
    assert(addXtreamResult.channels.length === 3, 'Channels count is 3');
    assert(PlaylistManager.getActivePlaylistId() === addXtreamResult.playlist.id, 'Xtream playlist set as active');

    const loadedXtreamChannels = await PlaylistManager.loadChannels(addXtreamResult.playlist.id);
    assert(loadedXtreamChannels.length === 3, 'Loaded 3 Xtream channels from store');
    assert(loadedXtreamChannels[0].providerType === 'xtream', 'Channel retains providerType xtream');

    // Test refresh Xtream playlist
    const refreshResult = await PlaylistManager.refreshPlaylist(addXtreamResult.playlist.id);
    assert(refreshResult.playlist.type === 'xtream', 'Refreshed playlist remains type xtream');
    assert(refreshResult.playlist.channelCount === 3, 'Refreshed playlist channel count verified');

    console.log('\n--- 17. Associative Object Normalization (VOD & Series) ---');
    const assocVod = {
      "0": { stream_id: "101", name: "Inception", category_id: "1", container_extension: "mp4" },
      "1": { stream_id: "102", name: "Interstellar", category_id: "1", container_extension: "mkv" }
    };
    const assocVodCats = {
      "0": { id: "1", name: "Sci-Fi" }
    };
    const normVodResult = XtreamApi.normalizeVodStreams(assocVod, assocVodCats, 'http://test.com', 'user', 'pass', 'pl_test');
    assert(normVodResult.movies.length === 2, 'Associative VOD object normalized to 2 movies');
    assert(normVodResult.movies[0].name === 'Inception', 'First movie name normalized correctly');
    assert(normVodResult.movies[0].categoryName === 'Sci-Fi', 'VOD category mapped from associative categories object');

    const assocSeries = {
      "0": { series_id: "201", name: "Breaking Bad", category_id: "5" },
      "1": { series_id: "202", name: "Better Call Saul", category_id: "5" }
    };
    const assocSeriesCats = {
      "0": { id: "5", name: "Drama" }
    };
    const normSeriesResult = XtreamApi.normalizeSeriesList(assocSeries, assocSeriesCats, 'http://test.com', 'user', 'pass', 'pl_test');
    assert(normSeriesResult.series.length === 2, 'Associative Series object normalized to 2 series');
    assert(normSeriesResult.series[1].name === 'Better Call Saul', 'Second series name normalized correctly');
    assert(normSeriesResult.series[0].categoryName === 'Drama', 'Series category mapped from associative categories object');

    // Cleanup
    Http.get = originalHttpGet;

    console.log(`\nXtream Test Results: ${passed} passed, ${failed} failed.`);
    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Unhandled test runner error:', err);
    process.exit(1);
  }
}

runTests();
