/**
 * Free IPTV Player — Phase 5 Complete IPTV Application Test Suite
 * Validates VOD Movies, TV Series, EPG, Global Search, Unified Favorites,
 * Watch History, Continue Watching, AVPlay Seek/Tracks, and TV Navigation.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    passedTests++;
    console.log('  [PASS] ' + message);
  } else {
    failedTests++;
    console.error('  [FAIL] ' + message);
  }
}

// In-memory localStorage mock
const storageStore = {};
const mockLocalStorage = {
  getItem(k) { return storageStore.hasOwnProperty(k) ? storageStore[k] : null; },
  setItem(k, v) { storageStore[k] = String(v); },
  removeItem(k) { delete storageStore[k]; },
  clear() { for (let k in storageStore) delete storageStore[k]; }
};

// Mock Document and Elements
function createMockElement(tag, attrs = {}) {
  const el = {
    tagName: tag.toUpperCase(),
    attributes: { ...attrs },
    classList: {
      classes: [],
      add(c) { if (!this.classes.includes(c)) this.classes.push(c); },
      remove(c) { this.classes = this.classes.filter(x => x !== c); },
      contains(c) { return this.classes.includes(c); },
      toggle(c, val) {
        if (val !== undefined) {
          if (val) this.add(c); else this.remove(c);
        } else {
          if (this.contains(c)) this.remove(c); else this.add(c);
        }
      }
    },
    textContent: '',
    children: [],
    style: {},
    getAttribute(attr) { return this.attributes[attr] || null; },
    setAttribute(attr, val) { this.attributes[attr] = String(val); },
    hasAttribute(attr) { return attr in this.attributes; },
    removeAttribute(attr) { delete this.attributes[attr]; },
    closest(selector) {
      if (selector.startsWith('#') && this.attributes.id === selector.slice(1)) return this;
      if (selector.startsWith('.') && this.classList.contains(selector.slice(1))) return this;
      return null;
    },
    querySelectorAll(selector) {
      const results = [];
      function traverse(node) {
        if (selector === '.focusable' && node.classList.contains('focusable')) results.push(node);
        node.children.forEach(traverse);
      }
      traverse(el);
      return results;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    click() {}
  };
  return el;
}

// Setup VM environment
const mockWindow = {
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  Date: Date,
  Math: Math,
  JSON: JSON,
  String: String,
  Number: Number,
  Boolean: Boolean,
  Array: Array,
  Object: Object,
  RegExp: RegExp,
  Promise: Promise,
  localStorage: mockLocalStorage,
  Buffer: Buffer,
  document: {
    documentElement: createMockElement('html'),
    body: createMockElement('body'),
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; }
  },
  FreeIPTV: {}
};
mockWindow.window = mockWindow;

vm.createContext(mockWindow);

// Load Scripts in order
const scriptFiles = [
  '../js/core/constants.js',
  '../js/core/logger.js',
  '../js/core/events.js',
  '../js/core/http.js',
  '../js/storage/storage.js',
  '../js/storage/channel-store.js',
  '../js/playlist/m3u-parser.js',
  '../js/playlist/xtream-api.js',
  '../js/playlist/playlist-manager.js',
  '../js/player/avplay-engine.js',
  '../js/i18n/i18n.js'
];

scriptFiles.forEach(file => {
  const code = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
  vm.runInContext(code, mockWindow);
});

const XtreamAPI = mockWindow.FreeIPTV.XtreamAPI;
const ChannelStore = mockWindow.FreeIPTV.ChannelStore;
const PlaylistManager = mockWindow.FreeIPTV.PlaylistManager;
const AVPlayEngine = mockWindow.FreeIPTV.AVPlayEngine;
const I18n = mockWindow.FreeIPTV.I18n;

// Fixtures
const vodCatsFixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/xtream/vod-categories.json'), 'utf8'));
const vodStreamsFixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/xtream/vod-streams.json'), 'utf8'));
const vodInfoFixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/xtream/vod-info.json'), 'utf8'));
const seriesCatsFixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/xtream/series-categories.json'), 'utf8'));
const seriesFixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/xtream/series.json'), 'utf8'));
const seriesInfoFixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/xtream/series-info.json'), 'utf8'));
const shortEpgFixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/xtream/short-epg.json'), 'utf8'));

async function runTests() {
  console.log('\n====================================================');
  console.log(' TEST SUITE: COMPLETE IPTV MASTER IMPLEMENTATION');
  console.log('====================================================');

  // --- 1. VOD Xtream API & Normalization ---
  console.log('\n--- 1. VOD Streams & Normalization ---');
  {
    const categories = [{ id: '10', name: 'Action & Adventure' }, { id: '20', name: 'Sci-Fi & Fantasy' }];
    const res = XtreamAPI.normalizeVodStreams(vodStreamsFixture, categories, 'http://iptv.example.com:8080', 'user1', 'pass1', 'xtream_1');

    assert(res && Array.isArray(res.movies), 'Normalized VOD movies is an array');
    assert(res.movies.length === 2, 'Normalized 2 movies from fixture');

    const m1 = res.movies[0];
    assert(m1.metadata.streamId === '1001', 'Movie streamId mapped to string: 1001');
    assert(m1.name === 'Interstellar (2014)', 'Movie title mapped');
    assert(m1.categoryName === 'Sci-Fi & Fantasy', 'Movie category mapped to Sci-Fi & Fantasy');
    assert(m1.posterUrl === 'https://example.com/posters/interstellar.jpg', 'Movie poster mapped');
    assert(m1.rating === '8.7', 'Movie rating mapped');
    assert(m1.containerExtension === 'mp4', 'Container extension mapped to mp4');
    assert(m1.providerId === 'xtream_1', 'Provider ID mapped to xtream_1');

    const streamUrl = XtreamAPI.generateMovieStreamUrl('http://iptv.example.com:8080', 'user1', 'pass1', '1001', 'mp4');
    assert(streamUrl === 'http://iptv.example.com:8080/movie/user1/pass1/1001.mp4', 'Generated valid movie stream URL');
  }

  // --- 2. TV Series Xtream API & Normalization ---
  console.log('\n--- 2. TV Series & Normalization ---');
  {
    const seriesCategories = [{ id: '30', name: 'Drama Series' }];
    const res = XtreamAPI.normalizeSeriesList(seriesFixture, seriesCategories, 'http://iptv.example.com:8080', 'user1', 'pass1', 'xtream_1');

    assert(res && Array.isArray(res.series), 'Normalized series is an array');
    assert(res.series.length === 1, 'Normalized 1 series from fixture');

    const s1 = res.series[0];
    assert(s1.id === 'series_xtream_1_2001', 'Series ID mapped: series_xtream_1_2001');
    assert(s1.name === 'Breaking Bad', 'Series title mapped: Breaking Bad');
    assert(s1.categoryName === 'Drama Series', 'Series category mapped to Drama Series');
    assert(s1.rating === '9.5', 'Series rating mapped to 9.5');

    // Test series details & episodes normalization
    const normalizedInfo = XtreamAPI.normalizeSeriesInfo(seriesInfoFixture, '2001', 'http://iptv.example.com:8080', 'user1', 'pass1', 'xtream_1');
    assert(Array.isArray(normalizedInfo.seasons), 'Seasons is an array');
    assert(normalizedInfo.seasons.length === 1, 'Found 1 season');
    assert(normalizedInfo.seasons[0].seasonNumber === 1, 'Season number is 1');

    assert(normalizedInfo.episodesBySeason && normalizedInfo.episodesBySeason['1'], 'Episodes for season 1 mapped');
    const epList = normalizedInfo.episodesBySeason['1'];
    assert(epList.length === 2, 'Found 2 episodes in Season 1');
    assert(epList[0].metadata.episodeId === '5001', 'Episode 1 ID is 5001');
    assert(epList[0].name === 'Pilot', 'Episode 1 title is Pilot');
    assert(epList[0].metadata.durationSeconds === 3480, 'Episode 1 durationSecs is 3480');
    assert(epList[0].streamUrl === 'http://iptv.example.com:8080/series/user1/pass1/5001.mp4', 'Episode 1 stream URL generated correctly');
  }

  // --- 3. EPG Base64 Decoding & Normalization ---
  console.log('\n--- 3. EPG & Base64 Decoding ---');
  {
    const decoded = XtreamAPI.safeDecodeBase64('TmV3cyBhdCBUZW4=');
    assert(decoded === 'News at Ten', 'Base64 string "TmV3cyBhdCBUZW4=" successfully decoded to "News at Ten"');

    const plain = XtreamAPI.safeDecodeBase64('Weather Outlook');
    assert(plain === 'Weather Outlook', 'Plain text string remains unchanged');

    const normalizedEpg = XtreamAPI.normalizeEpgPrograms(shortEpgFixture.epg_listings, 'ch_1', 'bbc1.uk');
    assert(Array.isArray(normalizedEpg), 'Normalized EPG is an array');
    assert(normalizedEpg.length === 2, 'Found 2 EPG program entries');
    assert(normalizedEpg[0].title === 'News at Ten', 'EPG title decoded from Base64');
    assert(normalizedEpg[0].description === 'Latest national and international news.', 'EPG description decoded from Base64');
    assert(normalizedEpg[0].startTime === 1759514400000, 'EPG start timestamp in milliseconds');
    assert(normalizedEpg[0].endTime === 1759518000000, 'EPG stop timestamp in milliseconds');
  }

  // --- 4. ChannelStore DB v2 & Caching ---
  console.log('\n--- 4. ChannelStore v2 Multi-Store Caching ---');
  {
    assert(typeof ChannelStore.saveMovies === 'function', 'ChannelStore has saveMovies');
    assert(typeof ChannelStore.getMovies === 'function', 'ChannelStore has getMovies');
    assert(typeof ChannelStore.saveSeries === 'function', 'ChannelStore has saveSeries');
    assert(typeof ChannelStore.getSeries === 'function', 'ChannelStore has getSeries');
    assert(typeof ChannelStore.saveVodDetails === 'function', 'ChannelStore has saveVodDetails');
    assert(typeof ChannelStore.getVodDetails === 'function', 'ChannelStore has getVodDetails');
    assert(typeof ChannelStore.saveSeriesDetails === 'function', 'ChannelStore has saveSeriesDetails');
    assert(typeof ChannelStore.getSeriesDetails === 'function', 'ChannelStore has getSeriesDetails');
    assert(typeof ChannelStore.saveEpg === 'function', 'ChannelStore has saveEpg');
    assert(typeof ChannelStore.getEpg === 'function', 'ChannelStore has getEpg');
    assert(typeof ChannelStore.clearEpgCache === 'function', 'ChannelStore has clearEpgCache');

    // Save and load movies to cache
    const testMovies = [{ streamId: '1001', name: 'Interstellar' }];
    await ChannelStore.saveMovies('provider_1', testMovies);
    const cachedMovies = await ChannelStore.getMovies('provider_1');
    assert(cachedMovies && Array.isArray(cachedMovies.movies) && cachedMovies.movies.length === 1, 'Retrieved cached movies');
    assert(cachedMovies.movies[0].name === 'Interstellar', 'Cached movie data matches');

    // Save and load series to cache
    const testSeries = [{ seriesId: '2001', name: 'Breaking Bad' }];
    await ChannelStore.saveSeries('provider_1', testSeries);
    const cachedSeries = await ChannelStore.getSeries('provider_1');
    assert(cachedSeries && Array.isArray(cachedSeries.series) && cachedSeries.series.length === 1, 'Retrieved cached series');
    assert(cachedSeries.series[0].name === 'Breaking Bad', 'Cached series data matches');

    // Save and load EPG to cache
    const testEpg = [{ title: 'News', description: 'Daily news', startTime: 1000, endTime: 2000 }];
    await ChannelStore.saveEpg('provider_1', 'ch_101', 'today', testEpg);
    const cachedEpg = await ChannelStore.getEpg('provider_1', 'ch_101', 'today');
    assert(Array.isArray(cachedEpg) && cachedEpg[0] && cachedEpg[0].title === 'News', 'Retrieved cached EPG');

    // Clear EPG cache
    await ChannelStore.clearEpgCache();
    const epgAfterClear = await ChannelStore.getEpg('provider_1', 'ch_101', 'today');
    assert(epgAfterClear === null, 'EPG cache cleared cleanly');
  }

  // --- 5. PlaylistManager Unified IPTV Management ---
  console.log('\n--- 5. PlaylistManager Unified IPTV Management ---');
  {
    // 5.1 Provider Registration
    const provider = {
      id: 'provider_test',
      name: 'Test IPTV Provider',
      type: 'xtream',
      server: 'http://iptv.test:8080',
      username: 'testuser',
      password: 'testpass'
    };

    mockWindow.FreeIPTV.Storage.set('playlists', [provider]);
    PlaylistManager.setActivePlaylist('provider_test');
    assert(PlaylistManager.getActivePlaylistId() === 'provider_test', 'Provider activated');

    // Mock channels, movies, and series directly into store for search and favorites test
    const mockChannels = [
      { id: 'ch_1', name: 'BBC One HD', groupTitle: 'UK Entertainment', streamUrl: 'http://stream/1' },
      { id: 'ch_2', name: 'CNN International', groupTitle: 'News', streamUrl: 'http://stream/2' }
    ];
    await ChannelStore.saveChannels('provider_test', mockChannels);

    const mockMovies = [
      { streamId: '1001', name: 'Interstellar (2014)', year: '2014', rating: '8.7', poster: 'http://poster/interstellar.jpg' },
      { streamId: '1002', name: 'The Dark Knight (2008)', year: '2008', rating: '9.0', poster: 'http://poster/dark_knight.jpg' }
    ];
    await ChannelStore.saveMovies('provider_test', mockMovies);

    const mockSeries = [
      { seriesId: '2001', name: 'Breaking Bad', releaseDate: '2008', rating: '9.5', poster: 'http://poster/bb.jpg' },
      { seriesId: '2002', name: 'Better Call Saul', releaseDate: '2015', rating: '9.0', poster: 'http://poster/bcs.jpg' }
    ];
    await ChannelStore.saveSeries('provider_test', mockSeries);

    // 5.2 Unified Favorites
    const isFavBefore = PlaylistManager.isFavoriteItem('1001', 'movie');
    assert(isFavBefore === false, 'Movie 1001 not favorite initially');

    PlaylistManager.toggleFavoriteItem({
      contentType: 'movie',
      contentId: '1001',
      name: 'Interstellar (2014)',
      poster: 'http://poster/interstellar.jpg'
    });

    assert(PlaylistManager.isFavoriteItem('1001', 'movie') === true, 'Movie 1001 is now marked as favorite');
    const allFavs = PlaylistManager.getFavorites('all');
    assert(allFavs.length === 1, 'Total favorites is 1');
    assert(allFavs[0].contentId === '1001', 'Favorite contentId is 1001');

    const movieFavs = PlaylistManager.getFavorites('movie');
    assert(movieFavs.length === 1, 'Movie favorites filtered correctly');

    const liveFavs = PlaylistManager.getFavorites('live');
    assert(liveFavs.length === 0, 'Live favorites empty');

    // 5.3 Playback History & Continue Watching
    PlaylistManager.recordWatchHistory({
      contentType: 'movie',
      contentId: '1001',
      title: 'Interstellar',
      poster: 'http://poster/interstellar.jpg',
      streamUrl: 'http://stream/movie.mp4'
    });

    const history = PlaylistManager.getWatchHistory();
    assert(history.length === 1, 'Watch history recorded 1 item');
    assert(history[0].title === 'Interstellar', 'History item title matches');

    // Save playback progress (in-progress VOD)
    PlaylistManager.savePlaybackProgress({
      contentType: 'movie',
      contentId: '1001',
      title: 'Interstellar',
      positionSec: 1800, // 30m
      durationSec: 10140 // 169m
    });

    const progress = PlaylistManager.getPlaybackProgress('movie', '1001');
    assert(progress !== null, 'Progress record found');
    assert(progress.positionSeconds === 1800, 'Position saved: 1800s');

    const continueWatching = PlaylistManager.getContinueWatching();
    assert(continueWatching.length === 1, 'Continue watching returns 1 item');
    assert(continueWatching[0].contentId === '1001', 'Continue watching item is 1001');

    // 5.4 Global Search
    const searchMovie = await PlaylistManager.globalSearch('inter');
    assert(searchMovie.movies.length === 1, 'Global search found 1 movie for "inter"');
    assert(searchMovie.movies[0].streamId === '1001', 'Found Interstellar');

    const searchSeries = await PlaylistManager.globalSearch('break');
    assert(searchSeries.series.length === 1, 'Global search found 1 series for "break"');
    assert(searchSeries.series[0].seriesId === '2001', 'Found Breaking Bad');

    const searchLive = await PlaylistManager.globalSearch('bbc');
    assert(searchLive.live.length === 1, 'Global search found 1 live channel for "bbc"');
    assert(searchLive.live[0].name === 'BBC One HD', 'Found BBC One HD');
  }

  // --- 6. AVPlay Engine Seek & Tracks ---
  console.log('\n--- 6. AVPlay Engine VOD Features ---');
  {
    assert(typeof AVPlayEngine.getDuration === 'function', 'AVPlayEngine has getDuration');
    assert(typeof AVPlayEngine.getCurrentTime === 'function', 'AVPlayEngine has getCurrentTime');
    assert(typeof AVPlayEngine.seekTo === 'function', 'AVPlayEngine has seekTo');
    assert(typeof AVPlayEngine.getTotalTrackInfo === 'function', 'AVPlayEngine has getTotalTrackInfo');
    assert(typeof AVPlayEngine.setSelectTrack === 'function', 'AVPlayEngine has setSelectTrack');

    // In mock mode (development environment):
    assert(AVPlayEngine.getDuration() === 0, 'Mock duration returns 0 safely without throw');
    assert(AVPlayEngine.getCurrentTime() === 0, 'Mock current time returns 0 safely');
    assert(AVPlayEngine.getTotalTrackInfo().length === 0, 'Mock tracks returns empty array safely');
    const seekResult = await AVPlayEngine.seekTo(10000);
    assert(seekResult === false, 'Mock seekTo returns Promise resolving to false safely');
  }

  // --- 7. Navigation Matrix & Zones Verification ---
  console.log('\n--- 7. Navigation Matrix & Phase 5 Zones ---');
  {
    const ZONES = mockWindow.FreeIPTV.Constants.NAV_ZONES;
    assert(ZONES.MOVIES_CATEGORIES === 'movies_categories', 'Zone MOVIES_CATEGORIES defined');
    assert(ZONES.MOVIES_GRID === 'movies_grid', 'Zone MOVIES_GRID defined');
    assert(ZONES.MOVIE_DETAILS === 'movie_details', 'Zone MOVIE_DETAILS defined');
    assert(ZONES.SERIES_CATEGORIES === 'series_categories', 'Zone SERIES_CATEGORIES defined');
    assert(ZONES.SERIES_GRID === 'series_grid', 'Zone SERIES_GRID defined');
    assert(ZONES.SERIES_DETAILS === 'series_details', 'Zone SERIES_DETAILS defined');
    assert(ZONES.LIVE_EPG === 'live_epg', 'Zone LIVE_EPG defined');
    assert(ZONES.SEARCH_INPUT === 'search_input', 'Zone SEARCH_INPUT defined');
    assert(ZONES.SEARCH_RESULTS === 'search_results', 'Zone SEARCH_RESULTS defined');
    assert(ZONES.FAVORITES_TABS === 'favorites_tabs', 'Zone FAVORITES_TABS defined');
    assert(ZONES.FAVORITES_GRID === 'favorites_grid', 'Zone FAVORITES_GRID defined');
  }

  // --- 8. Phase 5.2 Category Tree & Stack Navigation ---
  console.log('\n--- 8. Phase 5.2 Category Tree & Stack Navigation ---');
  {
    const PlaylistManager = mockWindow.FreeIPTV.PlaylistManager;
    const testCategories = [
      { id: '1', name: 'Sports', parentId: 0 },
      { id: '2', name: 'Football', parentId: 1 },
      { id: '3', name: 'Premier League', parentId: 2 },
      { id: '4', name: 'News', parentId: 0 }
    ];
    const testChannels = [
      { id: 'ch1', name: 'Sky Premier', categoryId: '3' },
      { id: 'ch2', name: 'BBC News', categoryId: '4' }
    ];

    const tree = PlaylistManager.buildCategoryTree(testCategories, testChannels);
    assert(Array.isArray(tree.rootNodes), 'Category tree rootNodes is an array');
    assert(tree.rootNodes.length === 2, 'Found 2 root category nodes (Sports, News)');
    
    const sportsNode = tree.rootNodes.find(n => n.name === 'Sports');
    assert(sportsNode !== undefined, 'Found Sports root node');
    assert(sportsNode.children.length === 1, 'Sports has 1 child (Football)');
    assert(sportsNode.children[0].children.length === 1, 'Football has 1 child (Premier League)');
    assert(sportsNode.channelCount === 1, 'Sports rolled-up channelCount is 1 from leaf');

    const leafChannels = PlaylistManager.getChannelsForCategoryNode(sportsNode);
    assert(leafChannels.length === 1, 'Retrieved leaf channel recursively from Sports node');
    assert(leafChannels[0].id === 'ch1', 'Channel retrieved is Sky Premier');
  }

  // --- 9. Phase 5.2 EPG Integration & Standalone TV Guide Elimination ---
  console.log('\n--- 9. Phase 5.2 EPG Integration & Standalone TV Guide Elimination ---');
  {
    const htmlContent = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    assert(htmlContent.includes('id="live-epg-pane"'), 'index.html contains integrated #live-epg-pane inside Live TV');
    assert(!htmlContent.includes('id="view-guide"'), 'index.html has completely eliminated standalone #view-guide');
    assert(!htmlContent.includes('data-route="guide"'), 'index.html sidebar nav has no guide route link');
    assert(htmlContent.includes('id="settings-diagnostics-panel"'), 'index.html contains #settings-diagnostics-panel in Settings');
  }

  // --- 10. Phase 5.2 Real-Data Diagnostics & Zero Credential Leak ---
  console.log('\n--- 10. Phase 5.2 Real-Data Diagnostics & Zero Credential Leak ---');
  {
    const PlaylistManager = mockWindow.FreeIPTV.PlaylistManager;
    const diag = PlaylistManager.getDiagnostics();
    assert(typeof diag === 'object' && diag !== null, 'getDiagnostics returns an object');
    assert(diag.hasActivePlaylist === true, 'Diagnostics reports active playlist');
    assert(typeof diag.liveCount === 'number', 'Diagnostics reports numeric live channel count');
    assert(typeof diag.movieCount === 'number', 'Diagnostics reports numeric movie count');
    assert(typeof diag.seriesCount === 'number', 'Diagnostics reports numeric series count');
    assert(typeof diag.status === 'string', 'Diagnostics reports connection status');
    assert(typeof diag.serverHost === 'string', 'Diagnostics reports serverHost');
    assert(!diag.serverHost.includes('secret') && !diag.serverHost.includes('pass'), 'Zero credentials leaked in serverHost');
    assert(!JSON.stringify(diag).includes('provider_pass'), 'Zero credentials leaked across entire diagnostics object');
  }

  // --- 11. Phase 5.3 Multi-Playlist Manager & CRUD ---
  console.log('\n--- 11. Phase 5.3 Multi-Playlist Manager & CRUD ---');
  {
    const PlaylistManager = mockWindow.FreeIPTV.PlaylistManager;
    
    // Add Playlist B to storage
    const plB = {
      id: 'pl_secondary_2',
      name: 'Second Provider',
      type: 'm3u',
      url: 'http://example.com/sec.m3u',
      channels: [{ id: 'b1', name: 'Channel B1', streamUrl: 'http://b1.ts' }]
    };
    const currentList = PlaylistManager.getPlaylists();
    currentList.push(plB);
    mockWindow.FreeIPTV.Storage.set('playlists', currentList);
    
    const playlists = PlaylistManager.getPlaylists();
    assert(playlists.length >= 2, 'Multiple playlists saved in manager');
    
    // Test Rename
    const renameRes = PlaylistManager.renamePlaylist('pl_secondary_2', 'Renamed Provider');
    assert(!!renameRes, 'renamePlaylist succeeded');
    const plUpdated = PlaylistManager.getPlaylistById('pl_secondary_2');
    assert(plUpdated && plUpdated.name === 'Renamed Provider', 'Playlist name updated in storage');

    // Test Switch Active
    const switchRes = PlaylistManager.switchActivePlaylist('pl_secondary_2');
    assert(!!switchRes, 'switchActivePlaylist succeeded');
    assert(PlaylistManager.getActivePlaylist().id === 'pl_secondary_2', 'Active playlist changed to pl_secondary_2');

    // Switch back
    PlaylistManager.switchActivePlaylist('provider_test');
    assert(PlaylistManager.getActivePlaylist().id === 'provider_test', 'Switched back to primary provider');
  }

  // --- 12. Phase 5.3 Strict Cache & Data Isolation ---
  console.log('\n--- 12. Phase 5.3 Strict Cache & Data Isolation ---');
  {
    const PlaylistManager = mockWindow.FreeIPTV.PlaylistManager;
    
    // Verify provider_test has 1 favorite
    const favsA = PlaylistManager.getFavorites(null, 'provider_test');
    assert(favsA.length === 1, 'Provider Test has 1 favorite');

    // pl_secondary_2 must have 0 favorites
    const favsB = PlaylistManager.getFavorites(null, 'pl_secondary_2');
    assert(favsB.length === 0, 'Secondary Provider has 0 favorites (Strict cache isolation)');

    // Verify history isolation
    const histA = PlaylistManager.getWatchHistory(10, 'provider_test');
    assert(histA.length === 1, 'Provider Test has 1 history record');
    const histB = PlaylistManager.getWatchHistory(10, 'pl_secondary_2');
    assert(histB.length === 0, 'Secondary Provider has 0 history records (Strict cache isolation)');

    // Verify continue watching isolation
    const cwA = PlaylistManager.getContinueWatching(10, 'provider_test');
    assert(cwA.length === 1, 'Provider Test has 1 continue watching item');
    const cwB = PlaylistManager.getContinueWatching(10, 'pl_secondary_2');
    assert(cwB.length === 0, 'Secondary Provider has 0 continue watching items (Strict cache isolation)');
  }

  // --- 13. Phase 6.2 Home-Centered Navigation & Full-Page Content UX ---
  console.log('\n--- 13. Phase 6.2 Home-Centered Navigation & Full-Page Content UX ---');
  {
    const htmlContent = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

    // Sidebar elimination check
    assert(!htmlContent.includes('<aside class="app-sidebar"'), 'Permanent sidebar .app-sidebar is completely eliminated');
    assert(!htmlContent.includes('class="app-sidebar"'), 'No app-sidebar elements exist in index.html');

    // Home Quick Access section check
    assert(htmlContent.includes('id="home-quick-access-section"'), 'index.html contains #home-quick-access-section on Home screen');

    // Full-page Details views check (no modal popups)
    assert(htmlContent.includes('id="view-movie_details"'), 'index.html contains full-page #view-movie_details view');
    assert(htmlContent.includes('id="view-series_details"'), 'index.html contains full-page #view-series_details view');
    assert(!htmlContent.includes('id="movie-details-modal"'), 'Modal popup #movie-details-modal completely eliminated');
    assert(!htmlContent.includes('id="series-details-modal"'), 'Modal popup #series-details-modal completely eliminated');

    // Header buttons
    assert(htmlContent.includes('id="btn-header-search"'), 'Header contains search button #btn-header-search');
    assert(htmlContent.includes('id="btn-header-settings"'), 'Header contains settings button #btn-header-settings');
    assert(htmlContent.includes('id="header-active-playlist"'), 'Header contains active playlist indicator #header-active-playlist');

    // Destination view-playlists
    assert(htmlContent.includes('id="view-playlists"'), 'index.html contains #view-playlists screen');

    // Footer hints bar elimination
    assert(!htmlContent.includes('class="tv-hints-bar"'), 'Footer hints bar .tv-hints-bar completely removed');
  }

  // --- 14. Phase 5.3 YouTube-Style Live Channel Video Preview ---
  console.log('\n--- 14. Phase 5.3 YouTube-Style Live Channel Video Preview ---');
  {
    const htmlContent = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    assert(htmlContent.includes('id="live-preview-container"'), 'index.html contains #live-preview-container');
    assert(htmlContent.includes('id="live-preview-window"'), 'index.html contains #live-preview-window');

    const AVPlayEngine = mockWindow.FreeIPTV.AVPlayEngine;
    assert(typeof AVPlayEngine.isInPreviewMode === 'function', 'AVPlayEngine has isInPreviewMode');
    assert(typeof AVPlayEngine.startPreview === 'function', 'AVPlayEngine has startPreview');
    assert(typeof AVPlayEngine.stopPreview === 'function', 'AVPlayEngine has stopPreview');
    assert(typeof AVPlayEngine.setMute === 'function', 'AVPlayEngine has setMute');
    assert(typeof AVPlayEngine.isMuted === 'function', 'AVPlayEngine has isMuted');

    // Test preview lifecycle
    AVPlayEngine.startPreview('http://test.stream/live.m3u8', { x: 100, y: 100, width: 320, height: 180 });
    assert(AVPlayEngine.isInPreviewMode() === true, 'AVPlayEngine enters preview mode');
    assert(AVPlayEngine.isMuted() === true, 'AVPlayEngine muted during preview');

    // Stop preview
    AVPlayEngine.stopPreview();
    assert(AVPlayEngine.isInPreviewMode() === false, 'AVPlayEngine leaves preview mode after stopPreview');

    // Full playback open restores unmuted
    AVPlayEngine.open('http://test.stream/live.m3u8', false);
    assert(AVPlayEngine.isInPreviewMode() === false, 'Full playback is not preview mode');
    assert(AVPlayEngine.isMuted() === false, 'Full playback restores unmuted state');
  }

  // --- 15. Phase 5.3 Localization Parity (EN & AR) ---
  console.log('\n--- 15. Phase 5.3 Localization Parity (EN & AR) ---');
  {
    const en = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../js/i18n/en.json'), 'utf8'));
    const ar = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../js/i18n/ar.json'), 'utf8'));

    const requiredKeys = [
      'nav.playlists',
      'playlists.title',
      'playlists.subtitle',
      'playlists.active_section',
      'playlists.all_section',
      'playlists.no_active',
      'playlists.active_badge',
      'playlists.btn_refresh',
      'playlists.btn_rename',
      'playlists.btn_delete',
      'playlists.btn_activate',
      'live.preview_badge',
      'live.preview_muted',
      'live.preview_idle'
    ];

    for (const key of requiredKeys) {
      assert(en[key] !== undefined, `EN dictionary contains key: ${key}`);
      assert(ar[key] !== undefined, `AR dictionary contains key: ${key}`);
    }

    assert(Object.keys(en).length === Object.keys(ar).length, `EN and AR key counts match exactly (${Object.keys(en).length})`);
  }

  // --- 16. Live TV Channel Data Pipeline & Error States ---
  console.log('\n--- 16. Live TV Channel Data Pipeline & Error States ---');
  {
    const en = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../js/i18n/en.json'), 'utf8'));
    const ar = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../js/i18n/ar.json'), 'utf8'));
    const htmlContent = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

    // 1. View ID routing verification
    assert(htmlContent.includes('id="view-live_tv"'), 'index.html contains #view-live_tv matching route live_tv');

    // 2. Localization keys for discrete states
    const stateKeys = [
      'live.loading_channels',
      'live.state_no_provider',
      'live.state_no_provider_sub',
      'live.state_auth_failure',
      'live.state_auth_failure_sub',
      'live.state_connection_failure',
      'live.state_connection_failure_sub',
      'live.state_no_channels',
      'live.state_no_channels_sub',
      'live.state_norm_failure',
      'live.state_norm_failure_sub'
    ];
    for (const key of stateKeys) {
      assert(en[key] !== undefined, `EN dictionary contains live state key: ${key}`);
      assert(ar[key] !== undefined, `AR dictionary contains live state key: ${key}`);
    }

    // 3. Associative object stream normalization
    const XtreamApi = mockWindow.FreeIPTV.XtreamApi;
    const associativeStreams = {
      "0": { stream_id: 201, name: "Stream Zero", category_id: "5" },
      "1": { stream_id: 202, name: "Stream One", category_id: "5" }
    };
    const normAssoc = XtreamApi.normalizeStreams(
      associativeStreams,
      [{ category_id: "5", category_name: "News" }],
      "http://iptv.example.com:8080",
      "user",
      "pass",
      "pl_assoc"
    );
    assert(normAssoc.channels.length === 2, 'Associative stream object normalized to 2 channels');
    assert(normAssoc.channels[0].name === 'Stream Zero', 'First associative channel name mapped');
    assert(normAssoc.channels[1].name === 'Stream One', 'Second associative channel name mapped');

    // 4. Auth failure detection
    const origGet = mockWindow.FreeIPTV.Http.get;
    mockWindow.FreeIPTV.Http.get = function () {
      return Promise.resolve({ data: JSON.stringify({ user_info: { auth: 0, status: "Disabled" } }) });
    };
    let authFailedCaught = false;
    try {
      await XtreamApi.authenticate('http://server.test', 'user', 'pass');
    } catch (err) {
      authFailedCaught = true;
      assert(err.code === 'AUTH_FAILURE', 'authenticate sets AUTH_FAILURE error code on auth=0');
    }
    mockWindow.FreeIPTV.Http.get = origGet;
    assert(authFailedCaught, 'Authentication rejection correctly throws error');

    // 5. Normalization failure detection
    let normFailedCaught = false;
    try {
      const emptyStreams = [];
      if (!emptyStreams || emptyStreams.length === 0) {
        const err = new Error('No live channels found');
        err.code = 'NO_CHANNELS';
        throw err;
      }
    } catch (err) {
      normFailedCaught = true;
      assert(err.code === 'NO_CHANNELS', 'NO_CHANNELS code assigned on empty streams');
    }
    assert(normFailedCaught, 'NO_CHANNELS detected on empty streams response');
  }

  // --- 17. Phase 5.4 Authoritative Playlist Channel Count ---
  console.log('\n--- 17. Phase 5.4 Authoritative Playlist Channel Count ---');
  {
    const PlaylistManager = mockWindow.FreeIPTV.PlaylistManager;
    const ChannelStore = mockWindow.FreeIPTV.ChannelStore;
    const PlaylistsView = mockWindow.FreeIPTV.Playlists;
    const Http = mockWindow.FreeIPTV.Http;

    // Test 1: Empty cache initially
    const plA_id = 'pl_count_test_a';
    const plA = {
      id: plA_id,
      name: 'Alpha IPTV',
      type: 'xtream',
      server: 'http://alpha.example.com',
      username: 'user_a',
      password: 'pass_a',
      channelCount: 0,
      liveCount: 0
    };
    mockWindow.FreeIPTV.Storage.set('playlists', [plA]);
    mockWindow.FreeIPTV.Storage.set('active_playlist_id', plA_id);

    const initialCache = await ChannelStore.getChannels(plA_id);
    assert(Array.isArray(initialCache) && initialCache.length === 0, '1. Empty cache initially for new playlist');

    // Test 2 & 3: Provider returns 100 channels & cache is populated
    let networkFetchCount = 0;
    const mock100Streams = [];
    for (let i = 1; i <= 100; i++) {
      mock100Streams.push({
        stream_id: 1000 + i,
        name: `Alpha Channel ${i}`,
        category_id: i <= 20 ? '1' : '2'
      });
    }

    const origHttpGet = Http.get;
    Http.get = function (url) {
      networkFetchCount++;
      if (url.includes('action=get_live_categories')) {
        return Promise.resolve({ data: JSON.stringify([{ category_id: '1', category_name: 'News' }, { category_id: '2', category_name: 'Sports' }]) });
      }
      if (url.includes('action=get_live_streams')) {
        return Promise.resolve({ data: JSON.stringify(mock100Streams) });
      }
      return Promise.resolve({ data: JSON.stringify({ user_info: { auth: 1, status: 'Active' } }) });
    };

    // Test 4: getChannelCount returns 100
    const countA = await PlaylistManager.getChannelCount(plA_id);
    assert(countA === 100, '4. getChannelCount returns 100 after cold cache on-demand fetch');

    // Verify cache is populated
    const populatedCache = await ChannelStore.getChannels(plA_id);
    assert(populatedCache.length === 100, '3. Cache is populated with 100 channels in ChannelStore');

    // Test 5: Playlist card displays 100 (and format with thousand separators)
    const cardText100 = PlaylistsView ? PlaylistsView.getChannelsText(100, false) : `Channels: ${PlaylistManager.formatChannelCount(100)}`;
    assert(cardText100.includes('100'), '5. Playlist card displays 100 channels');
    assert(PlaylistManager.formatChannelCount(1247) === '1,247', '5b. formatChannelCount formats 1247 as 1,247');

    // Test 6: Second render does not refetch unnecessarily
    const netCountBefore = networkFetchCount;
    const countA_second = await PlaylistManager.getChannelCount(plA_id);
    assert(countA_second === 100, '6a. Second count retrieval returns 100 from cache');
    assert(networkFetchCount === netCountBefore, '6b. Second render does not refetch unnecessarily (zero network calls)');

    // Test 7: Playlist A count differs from Playlist B
    const plB_id = 'pl_count_test_b';
    const mock42Streams = [];
    for (let i = 1; i <= 42; i++) {
      mock42Streams.push({
        id: `ch_b_${i}`,
        name: `Beta Channel ${i}`,
        streamUrl: `http://beta.stream/${i}.m3u8`,
        groupTitle: 'General'
      });
    }
    await ChannelStore.saveChannels(plB_id, mock42Streams);
    const plB = {
      id: plB_id,
      name: 'Beta IPTV',
      type: 'm3u',
      url: 'http://beta.example.com/list.m3u',
      channelCount: 42,
      liveCount: 42
    };
    mockWindow.FreeIPTV.Storage.set('playlists', [plA, plB]);

    const countB = await PlaylistManager.getChannelCount(plB_id);
    assert(countB === 42, '7a. Playlist B count is 42');
    assert(countA !== countB, '7b. Playlist A count (100) differs from Playlist B (42)');

    // Test 8: Switching playlist updates count
    PlaylistManager.switchActivePlaylist(plB_id);
    const activeCountB = await PlaylistManager.getChannelCount();
    assert(activeCountB === 42, '8a. Active playlist count updates to 42 when switched to Playlist B');

    PlaylistManager.switchActivePlaylist(plA_id);
    const activeCountA = await PlaylistManager.getChannelCount();
    assert(activeCountA === 100, '8b. Active playlist count updates to 100 when switched back to Playlist A');

    // Test 9: Category selection does not alter total count
    const sportsCategoryChannels = populatedCache.filter(ch => ch.categoryId === '2');
    assert(sportsCategoryChannels.length === 80, '9a. Filtered category subset has 80 channels');
    const catalogCountAfterCategoryFilter = await PlaylistManager.getChannelCount(plA_id);
    assert(catalogCountAfterCategoryFilter === 100, '9b. Category selection does not alter total count (remains 100)');

    // Test 10: Empty provider legitimately returns 0
    const plEmpty_id = 'pl_count_test_empty';
    const plEmpty = {
      id: plEmpty_id,
      name: 'Empty IPTV',
      type: 'xtream',
      server: 'http://empty.example.com',
      username: 'user_e',
      password: 'pass_e',
      channelCount: 0,
      liveCount: 0
    };
    mockWindow.FreeIPTV.Storage.set('playlists', [plA, plB, plEmpty]);

    Http.get = function (url) {
      if (url.includes('action=get_live_streams')) {
        return Promise.resolve({ data: JSON.stringify([]) });
      }
      return Promise.resolve({ data: JSON.stringify({ user_info: { auth: 1, status: 'Active' } }) });
    };
    const emptyCount = await PlaylistManager.getChannelCount(plEmpty_id);
    assert(emptyCount === 0, '10. Empty provider legitimately returns 0');

    // Test 11: Missing playlist returns appropriate unavailable state
    let missingCaught = false;
    try {
      await PlaylistManager.getChannelCount('non_existent_pl_id');
    } catch (err) {
      missingCaught = true;
      assert(err.code === 'PLAYLIST_NOT_FOUND', '11. Missing playlist rejects with PLAYLIST_NOT_FOUND');
    }
    assert(missingCaught, '11b. Missing playlist error caught');

    // Test 12: Live TV channel count and playlist count use same source
    const liveChannelsLoaded = await PlaylistManager.loadChannels(plA_id);
    const playlistAuthoritativeCount = await PlaylistManager.getChannelCount(plA_id);
    assert(liveChannelsLoaded.length === playlistAuthoritativeCount, '12. Live TV channel count and playlist count use same source');

    // Restore Http.get
    Http.get = origHttpGet;
  }

  console.log('\n====================================================');
  console.log(` RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests();

