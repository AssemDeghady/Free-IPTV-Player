/**
 * Free IPTV Player — Playlist Manager & Channel Data Layer Test Suite
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

console.log('\n--- Running Playlist Manager & Channel Store Tests ---');

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

const mockWindow = {
  FreeIPTV: {},
  localStorage: mockStorage,
  console: console
};

const context = vm.createContext({
  window: mockWindow,
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  Promise: Promise,
  Date: Date,
  Math: Math
});

const loadFiles = [
  '../js/core/constants.js',
  '../js/core/logger.js',
  '../js/core/events.js',
  '../js/storage/storage.js',
  '../js/storage/channel-store.js',
  '../js/playlist/m3u-parser.js',
  '../js/playlist/playlist-manager.js'
];

loadFiles.forEach(f => {
  const code = fs.readFileSync(path.resolve(__dirname, f), 'utf8');
  vm.runInContext(code, context);
});

const PM = mockWindow.FreeIPTV.PlaylistManager;
const basicFixture = fs.readFileSync(path.resolve(__dirname, 'fixtures/basic.m3u'), 'utf8');

async function runTests() {
  try {
    // 1. Initial State
    assert(PM.getPlaylists().length === 0, 'Initially no playlists exist');
    assert(PM.getActivePlaylistId() === null, 'Initially no active playlist');

    // 2. Add Playlist
    const addResult = await PM.addPlaylist('My Test IPTV', 'https://example.com/playlist.m3u', basicFixture);
    assert(addResult.playlist !== undefined, 'Playlist added successfully');
    assert(addResult.playlist.name === 'My Test IPTV', 'Playlist name saved: My Test IPTV');
    assert(addResult.playlist.channelCount === 5, 'Channel count recorded: 5');
    assert(addResult.channels.length === 5, 'Returned 5 channel objects');
    assert(PM.getPlaylists().length === 1, 'Total playlists in manager is 1');
    assert(PM.getActivePlaylistId() === addResult.playlist.id, 'New playlist automatically set as active');

    const activePlaylist = PM.getActivePlaylist();
    assert(activePlaylist && activePlaylist.id === addResult.playlist.id, 'getActivePlaylist returns active playlist object');

    // 3. Load Channels
    const loadedChannels = await PM.loadChannels(addResult.playlist.id);
    assert(loadedChannels.length === 5, 'Loaded 5 channels from store');
    assert(loadedChannels[0].name === 'BBC News', 'First channel is BBC News');

    // 4. Favorites Foundation
    const chId = loadedChannels[0].id;
    assert(PM.isFavorite(chId) === false, 'Channel is initially not favorite');
    const newState = PM.toggleFavorite(chId);
    assert(newState === true, 'toggleFavorite toggles channel to favorite (true)');
    assert(PM.isFavorite(chId) === true, 'isFavorite confirms channel is favorite');
    assert(PM.getFavoriteIds().includes(chId), 'Channel ID stored in favorites list');

    // Load channels again: should now be decorated with isFavorite: true
    const loadedChannelsWithFav = await PM.loadChannels(addResult.playlist.id);
    const favCh = loadedChannelsWithFav.find(c => c.id === chId);
    assert(favCh && favCh.isFavorite === true, 'Channel loaded with isFavorite: true');

    // Toggle off
    const toggledOff = PM.toggleFavorite(chId);
    assert(toggledOff === false, 'toggleFavorite toggles channel off (false)');
    assert(PM.isFavorite(chId) === false, 'isFavorite returns false after toggle');

    // 5. Search & Filter
    const searchBBC = PM.searchChannels(loadedChannels, 'bbc');
    assert(searchBBC.length === 1, 'Search "bbc" matches 1 channel (BBC News)');

    const searchCase = PM.searchChannels(loadedChannels, 'ESpN');
    assert(searchCase.length === 1, 'Case-insensitive search "ESpN" matches ESPN HD');

    const filterSports = PM.searchChannels(loadedChannels, '', 'Sports');
    assert(filterSports.length === 1, 'Filter category "Sports" returns 1 channel');
    assert(filterSports[0].groupTitle === 'Sports', 'Filtered channel has Sports category');

    const filterNews = PM.searchChannels(loadedChannels, '', 'News');
    assert(filterNews.length === 2, 'Filter category "News" returns 2 channels');

    const searchNone = PM.searchChannels(loadedChannels, 'nonexistent_keyword_xyz');
    assert(searchNone.length === 0, 'Search for non-existent keyword returns empty array');

    // 6. Refresh Playlist
    // Mock Http.get response for refresh
    mockWindow.FreeIPTV.Http = {
      get: function (url) {
        return Promise.resolve({
          status: 200,
          data: basicFixture + '\n#EXTINF:-1 group-title="News",New Added Channel\nhttps://example.com/new_stream.m3u8\n'
        });
      }
    };

    const refreshResult = await PM.refreshPlaylist(addResult.playlist.id);
    assert(refreshResult.playlist.channelCount === 6, 'Refreshed playlist updated channel count to 6');
    const reloadedChannels = await PM.loadChannels(addResult.playlist.id);
    assert(reloadedChannels.length === 6, 'Channels cache updated on refresh');

    // Test refresh failure keeps cached data
    mockWindow.FreeIPTV.Http = {
      get: function (url) {
        return Promise.reject(new Error('Network connection timed out (HTTP 504)'));
      }
    };

    try {
      await PM.refreshPlaylist(addResult.playlist.id);
      assert(false, 'Expected refresh to throw on network error');
    } catch (err) {
      assert(err.message.includes('timed out'), 'Refresh fails gracefully on network error');
    }

    // Verify existing channels still intact
    const postFailChannels = await PM.loadChannels(addResult.playlist.id);
    assert(postFailChannels.length === 6, 'Cached channels safely preserved despite failed refresh');

    // 7. Remove Playlist
    const removed = await PM.removePlaylist(addResult.playlist.id);
    assert(removed === true, 'Playlist removed successfully');
    assert(PM.getPlaylists().length === 0, 'Playlists count is 0 after deletion');
    assert(PM.getActivePlaylistId() === null, 'Active playlist cleared after deletion');

    console.log(`Playlist Manager Results: ${passed} passed, ${failed} failed.\n`);
    if (failed > 0) process.exit(1);
  } catch (e) {
    console.error('Fatal error during Playlist Manager test:', e);
    process.exit(1);
  }
}

runTests();
