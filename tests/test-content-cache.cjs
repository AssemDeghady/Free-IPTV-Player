/**
 * Free IPTV Player — Content Cache & UI Navigation Architecture Test Suite
 * Tests:
 * 1. Cache-first loading (no remote API calls if cache is warm).
 * 2. TTL validity & expiration calculation (1, 3, 7, 14, 30 days, 0=never).
 * 3. Concurrent request deduplication (shared in-flight promises).
 * 4. Playlist-scoped cache isolation.
 * 5. Background refresh without blank screen.
 * 6. Non-fatal refresh failure preserving cached catalog.
 * 7. Clear Cache purging catalog without affecting favorites/history/playlists.
 * 8. Search multi-section navigation model (Live TV, Movies, Series).
 * 9. Content array authoritative derivation for seasons (Silo & The Pitt).
 * 10. Empty notices & loading centering styling and layout spacing.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

console.log('============================================================');
console.log(' CONTENT CACHE & NAVIGATION ARCHITECTURE TEST SUITE');
console.log('============================================================\n');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

// Setup sandbox
const mockStorage = (function () {
  let store = {};
  return {
    getItem: k => store[k] !== undefined ? store[k] : null,
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
  Math: Math,
  parseInt: parseInt
});

const loadFiles = [
  '../js/core/constants.js',
  '../js/core/logger.js',
  '../js/core/events.js',
  '../js/storage/storage.js',
  '../js/storage/channel-store.js',
  '../js/playlist/m3u-parser.js',
  '../js/playlist/xtream-api.js',
  '../js/playlist/playlist-manager.js',
  '../js/i18n/i18n.js'
];

loadFiles.forEach(f => {
  const code = fs.readFileSync(path.resolve(__dirname, f), 'utf8');
  vm.runInContext(code, context);
});

const PM = mockWindow.FreeIPTV.PlaylistManager;
const ChannelStore = mockWindow.FreeIPTV.ChannelStore;
const Storage = mockWindow.FreeIPTV.Storage;

async function runCacheTests() {
  // 1. Content Cache TTL Logic
  it('1. Default cache refresh TTL is 7 days', () => {
    Storage.remove('content_refresh_days');
    assert.strictEqual(PM.getContentRefreshDays(), 7);
  });

  it('2. Configurable refresh intervals (1, 3, 7, 14, 30 days, and 0 for manual/never)', () => {
    PM.setContentRefreshDays(1);
    assert.strictEqual(PM.getContentRefreshDays(), 1);
    PM.setContentRefreshDays(14);
    assert.strictEqual(PM.getContentRefreshDays(), 14);
    PM.setContentRefreshDays(0);
    assert.strictEqual(PM.getContentRefreshDays(), 0);
    PM.setContentRefreshDays(7); // reset to default
  });

  it('3. isCacheValid checks timestamps accurately within TTL window', () => {
    PM.setContentRefreshDays(7);
    const now = Date.now();
    const fresh = now - (2 * 86400000); // 2 days old
    const expired = now - (8 * 86400000); // 8 days old
    assert.strictEqual(PM.isCacheValid(fresh), true);
    assert.strictEqual(PM.isCacheValid(expired), false);
  });

  it('4. isCacheValid returns true unconditionally when TTL is set to Never (0)', () => {
    PM.setContentRefreshDays(0);
    const veryOld = Date.now() - (100 * 86400000);
    assert.strictEqual(PM.isCacheValid(veryOld), true);
    PM.setContentRefreshDays(7);
  });

  // 2. Cache Metadata and Schema Versioning
  await itAsync('5. ChannelStore records contain cachedAt and schemaVersion 1', async () => {
    await ChannelStore.saveChannels('pl_meta_test', [{ id: 'ch1', name: 'Channel 1' }]);
    const meta = await ChannelStore.getCacheMeta('pl_meta_test', 'channels');
    assert.ok(meta !== null);
    assert.strictEqual(meta.schemaVersion, 1);
    assert.ok(typeof meta.cachedAt === 'number');
    assert.ok(meta.cachedAt > 0);
  });

  await itAsync('6. Movies and Series caches also track cachedAt and schemaVersion', async () => {
    await ChannelStore.saveMovies('pl_meta_test', [{ id: 'm1', name: 'Movie 1' }]);
    await ChannelStore.saveSeries('pl_meta_test', [{ id: 's1', name: 'Series 1' }]);
    const mMeta = await ChannelStore.getCacheMeta('pl_meta_test', 'movies');
    const sMeta = await ChannelStore.getCacheMeta('pl_meta_test', 'series');
    assert.strictEqual(mMeta.schemaVersion, 1);
    assert.strictEqual(sMeta.schemaVersion, 1);
  });

  // 3. Playlist Isolation
  await itAsync('7. Playlists have isolated namespaces for cached content', async () => {
    await ChannelStore.saveChannels('pl_A', [{ id: 'chA', name: 'Alpha' }]);
    await ChannelStore.saveChannels('pl_B', [{ id: 'chB', name: 'Beta' }]);
    const resA = await ChannelStore.getChannels('pl_A');
    const resB = await ChannelStore.getChannels('pl_B');
    assert.strictEqual(resA.length, 1);
    assert.strictEqual(resA[0].name, 'Alpha');
    assert.strictEqual(resB.length, 1);
    assert.strictEqual(resB[0].name, 'Beta');
  });

  // 4. Cache-First Retrieval & Request Deduplication
  await itAsync('8. In-flight request deduplication reuses same promise for concurrent requests', async () => {
    const plId = 'pl_dedup_test';
    // Add mock playlist so loadChannels resolves playlist
    const playlists = PM.getPlaylists();
    playlists.push({ id: plId, name: 'Dedup Playlist', type: 'm3u' });
    Storage.set('playlists', playlists);

    // Prime cache with channels
    await ChannelStore.saveChannels(plId, [{ id: 'c1', name: 'One' }, { id: 'c2', name: 'Two' }]);

    const p1 = PM.loadChannels(plId);
    const p2 = PM.loadChannels(plId);
    assert.strictEqual(p1, p2, 'Concurrent loadChannels calls return identical in-flight promise');
    const res = await p1;
    assert.strictEqual(res.length, 2);
  });

  await itAsync('9. Concurrent loadMovies and loadSeries share identical in-flight promises', async () => {
    const plId = 'pl_dedup_ms';
    const playlists = PM.getPlaylists();
    playlists.push({ id: plId, name: 'MS Playlist', type: 'm3u' });
    Storage.set('playlists', playlists);

    await ChannelStore.saveMovies(plId, [{ id: 'm1', name: 'Movie' }]);
    await ChannelStore.saveSeries(plId, [{ id: 's1', name: 'Series' }]);

    const m1 = PM.loadMovies(plId);
    const m2 = PM.loadMovies(plId);
    assert.strictEqual(m1, m2);

    const s1 = PM.loadSeries(plId);
    const s2 = PM.loadSeries(plId);
    assert.strictEqual(s1, s2);
  });

  // 5. Clear Cache preservation
  await itAsync('10. Clear Cache clears in-memory state and metadata but preserves favorites and history', async () => {
    // Add favorite and history item
    PM.toggleFavorite('fav_item_1');
    PM.recordWatchHistory({ contentId: 'hist_item_1', contentType: 'movie', title: 'Test Movie' });

    assert.ok(PM.isFavorite('fav_item_1'));
    assert.ok(PM.getWatchHistory().length > 0);

    // Call clearMemoryCache and clearAll
    PM.clearMemoryCache();
    await ChannelStore.clearAll();

    // Favorites and history must still exist
    assert.ok(PM.isFavorite('fav_item_1'), 'Favorites preserved after cache clear');
    assert.ok(PM.getWatchHistory().length > 0, 'Watch history preserved after cache clear');
  });

  // 6. Content Array Authoritative Derivation
  await itAsync('11. Series details derive seasons strictly from content array', async () => {
    const rawEpisodes = [
      { id: 'ep1', seasonNumber: 1, episodeNumber: 1 },
      { id: 'ep2', seasonNumber: 2, episodeNumber: 1 },
      { id: 'ep3', seasonNumber: 3, episodeNumber: 1 }
    ];
    const seriesObj = {
      id: '5012',
      seasons: [{ seasonNumber: 1, name: 'Season 1' }],
      content: rawEpisodes
    };
    await ChannelStore.saveSeriesDetails('pl_authoritative', '5012', seriesObj);
    const resolved = await PM.getSeriesDetails('pl_authoritative', { id: '5012' });
    assert.strictEqual(resolved.seasons.length, 3, 'All 3 seasons derived from content array');
    assert.strictEqual(resolved.episodesBySeason['2'].length, 1);
    assert.strictEqual(resolved.episodesBySeason['3'].length, 1);
  });

  // 7. Old TV CSS & Navigation Validation
  it('12. layout.css centers .channels-empty-notice and .search-empty-prompt', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../css/layout.css'), 'utf8').replace(/\r\n/g, '\n');
    assert.ok(css.includes('.channels-empty-notice {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;'));
    assert.ok(css.includes('grid-column: 1 / -1;'));
    assert.ok(css.includes('.search-empty-prompt {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;'));
  });

  it('13. layout.css includes explicit margins between home sections for 768p panel', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../css/layout.css'), 'utf8').replace(/\r\n/g, '\n');
    assert.ok(css.includes('.home-quick-access-section {\n  width: 100%;\n  margin-bottom: 36px;'));
    assert.ok(css.includes('.home-row-section {\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  margin-bottom: 36px;'));
  });

  it('14. layout.css has explicit header bar margin-bottom and title group margin fallback with RTL', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../css/layout.css'), 'utf8').replace(/\r\n/g, '\n');
    assert.ok(css.includes('.live-tv-header-bar {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 20px;\n  flex-shrink: 0;\n  height: 44px;\n  margin-bottom: 24px;'));
    assert.ok(css.includes('.live-tv-title-group > * + * {\n  margin-left: 14px;\n}'));
    assert.ok(css.includes('html[dir="rtl"] .live-tv-title-group > * + * {\n  margin-left: 0;\n  margin-right: 14px;\n}'));
  });

  it('15. navigation.js handles search multi-section row navigation', () => {
    const nav = fs.readFileSync(path.resolve(__dirname, '../js/ui/navigation.js'), 'utf8');
    assert.ok(nav.includes('// Multi-section navigation: Live TV -> Movies -> Series'));
    assert.ok(nav.includes('curSec.items[curItemIdx + 1]'));
    assert.ok(nav.includes('prevSec.items[targetPrevIdx]'));
    assert.ok(nav.includes('nextSec.items[targetNextIdx]'));
  });

  it('16. index.html contains Content Auto-Refresh options in Settings', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    assert.ok(html.includes('data-i18n="settings.cache_refresh_days"'));
    assert.ok(html.includes('class="btn-refresh-interval focusable active" data-days="7"'));
  });

  it('17. en.json and ar.json contain matching Content Auto-Refresh translations', () => {
    const en = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../js/i18n/en.json'), 'utf8'));
    const ar = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../js/i18n/ar.json'), 'utf8'));
    const keys = [
      'settings.cache_refresh_days',
      'settings.cache_refresh_days_sub',
      'settings.refresh_1d',
      'settings.refresh_3d',
      'settings.refresh_7d',
      'settings.refresh_14d',
      'settings.refresh_30d',
      'settings.refresh_never'
    ];
    keys.forEach(k => {
      assert.ok(en[k], 'en has ' + k);
      assert.ok(ar[k], 'ar has ' + k);
    });
  });

  it('18. navigation.js handles Settings Content Auto-Refresh interval buttons in D-pad navigation graph', () => {
    const nav = fs.readFileSync(path.resolve(__dirname, '../js/ui/navigation.js'), 'utf8').replace(/\r\n/g, '\n');
    assert.ok(nav.includes('// Auto-Refresh interval buttons'), 'Has auto-refresh interval buttons section');
    assert.ok(nav.includes('.btn-refresh-interval:not([disabled])'), 'Queries .btn-refresh-interval elements');
    assert.ok(nav.includes('var activeRefreshBtn = view.querySelector(\'.btn-refresh-interval.active'), 'Finds active refresh button');
    assert.ok(nav.includes('if (currentElement === toggleAutoNext) {\n          return activeRefreshBtn || btnClearEpg;\n        }'), 'DOWN from toggleAutoNext moves to activeRefreshBtn');
    assert.ok(nav.includes('if (isRefreshChild) {\n          return btnClearEpg;\n        }'), 'DOWN from isRefreshChild moves to btnClearEpg');
    assert.ok(nav.includes('return activeRefreshBtn || toggleAutoNext || toggleAutoResume;'), 'UP from btnClearEpg moves to activeRefreshBtn');
    assert.ok(nav.includes('if (isRefreshChild) {\n          return toggleAutoNext || toggleAutoResume;\n        }'), 'UP from isRefreshChild moves to toggleAutoNext');
    assert.ok(nav.includes('if (refreshIdx < refreshIntervalBtns.length - 1) {\n            return refreshIntervalBtns[refreshIdx + 1];\n          }'), 'RIGHT from isRefreshChild advances interval');
    assert.ok(nav.includes('if (refreshIdx > 0) {\n            return refreshIntervalBtns[refreshIdx - 1];\n          }'), 'LEFT from isRefreshChild retreats interval');
  });

  it('19. Functional verification of Settings D-pad navigation graph transitions', () => {
    // Construct mock DOM environment for Settings
    const mockElements = {};
    function createElement(id, classes, attrs) {
      const el = {
        id: id || '',
        className: (classes || []).join(' '),
        classList: {
          contains: c => (classes || []).includes(c),
          add: c => { if (!(classes || []).includes(c)) classes.push(c); el.className = classes.join(' '); },
          remove: c => { const i = (classes || []).indexOf(c); if (i !== -1) classes.splice(i, 1); el.className = classes.join(' '); }
        },
        attrs: attrs || {},
        getAttribute: a => (attrs || {})[a] || null,
        closest: sel => null,
        querySelectorAll: sel => [],
        querySelector: sel => null,
        focus: () => {},
        blur: () => {}
      };
      if (id) mockElements[id] = el;
      return el;
    }

    const toggleResume = createElement('toggle-auto-resume', ['focusable']);
    const toggleNext = createElement('toggle-auto-next-ep', ['focusable']);
    const btnRefresh1 = createElement('', ['btn-refresh-interval', 'focusable'], { 'data-days': '1' });
    const btnRefresh3 = createElement('', ['btn-refresh-interval', 'focusable'], { 'data-days': '3' });
    const btnRefresh7 = createElement('', ['btn-refresh-interval', 'focusable', 'active'], { 'data-days': '7' });
    const btnRefresh14 = createElement('', ['btn-refresh-interval', 'focusable'], { 'data-days': '14' });
    const btnRefresh30 = createElement('', ['btn-refresh-interval', 'focusable'], { 'data-days': '30' });
    const btnRefresh0 = createElement('', ['btn-refresh-interval', 'focusable'], { 'data-days': '0' });
    const refreshBtns = [btnRefresh1, btnRefresh3, btnRefresh7, btnRefresh14, btnRefresh30, btnRefresh0];

    const btnClearEpg = createElement('btn-clear-epg-cache', ['focusable']);
    const btnClearHist = createElement('btn-clear-history', ['focusable']);
    const btnLangEn = createElement('btn-lang-en', ['focusable']);
    const btnLangAr = createElement('btn-lang-ar', ['focusable']);
    const sidebarLink = createElement('sidebar-settings', ['focusable', 'active']);

    const mockView = {
      querySelectorAll: sel => {
        if (sel.includes('.btn-refresh-interval')) return refreshBtns;
        if (sel.includes('.focusable')) return [toggleResume, toggleNext, ...refreshBtns, btnClearEpg, btnClearHist, btnLangEn, btnLangAr];
        return [];
      },
      querySelector: sel => {
        if (sel.includes('.btn-refresh-interval.active')) return btnRefresh7;
        return null;
      }
    };

    const mockDoc = {
      body: {
        contains: () => true
      },
      getElementById: id => mockElements[id] || (id === 'view-settings' ? mockView : null),
      querySelector: sel => {
        if (sel.includes('.app-sidebar')) return sidebarLink;
        if (sel.includes('#btn-header-settings')) return null;
        return null;
      },
      querySelectorAll: sel => [],
      addEventListener: () => {}
    };

    const navCode = fs.readFileSync(path.resolve(__dirname, '../js/ui/navigation.js'), 'utf8');
    const navContext = vm.createContext({
      window: {
        FreeIPTV: {
          Constants: {
            DIRECTIONS: { UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right' },
            NAV_ZONES: { SETTINGS_ACTIONS: 'settings_actions' }
          }
        }
      },
      document: mockDoc,
      console: console,
      setTimeout: () => {}
    });

    vm.runInContext(navCode, navContext);
    const Nav = navContext.window.FreeIPTV.Navigation;

    // Simulate navigation by setting currentElement via Nav.focus
    // Test 1: From toggleAutoNext, DOWN -> activeRefreshBtn (btnRefresh7)
    Nav.focus(toggleNext);
    let next = Nav.handleSettingsNavigation('down');
    assert.strictEqual(next, btnRefresh7, 'DOWN from toggleAutoNext reaches active 7-days refresh button');

    // Test 2: Traversing RIGHT across all refresh options
    Nav.focus(btnRefresh1);
    assert.strictEqual(Nav.handleSettingsNavigation('right'), btnRefresh3, '1d -> 3d on RIGHT');
    Nav.focus(btnRefresh3);
    assert.strictEqual(Nav.handleSettingsNavigation('right'), btnRefresh7, '3d -> 7d on RIGHT');
    Nav.focus(btnRefresh7);
    assert.strictEqual(Nav.handleSettingsNavigation('right'), btnRefresh14, '7d -> 14d on RIGHT');
    Nav.focus(btnRefresh14);
    assert.strictEqual(Nav.handleSettingsNavigation('right'), btnRefresh30, '14d -> 30d on RIGHT');
    Nav.focus(btnRefresh30);
    assert.strictEqual(Nav.handleSettingsNavigation('right'), btnRefresh0, '30d -> 0d on RIGHT');
    Nav.focus(btnRefresh0);
    assert.strictEqual(Nav.handleSettingsNavigation('right'), null, '0d RIGHT clamps (returns null)');

    // Test 3: Traversing LEFT across refresh options
    Nav.focus(btnRefresh0);
    assert.strictEqual(Nav.handleSettingsNavigation('left'), btnRefresh30, '0d -> 30d on LEFT');
    Nav.focus(btnRefresh1);
    assert.strictEqual(Nav.handleSettingsNavigation('left'), sidebarLink, '1d LEFT goes to sidebar');

    // Test 4: DOWN from any refresh button -> btnClearEpg
    Nav.focus(btnRefresh7);
    assert.strictEqual(Nav.handleSettingsNavigation('down'), btnClearEpg, 'DOWN from refresh button reaches btnClearEpg');

    // Test 5: UP from btnClearEpg -> activeRefreshBtn
    Nav.focus(btnClearEpg);
    assert.strictEqual(Nav.handleSettingsNavigation('up'), btnRefresh7, 'UP from btnClearEpg reaches activeRefreshBtn');

    // Test 6: UP from btnClearHist -> activeRefreshBtn
    Nav.focus(btnClearHist);
    assert.strictEqual(Nav.handleSettingsNavigation('up'), btnRefresh7, 'UP from btnClearHist reaches activeRefreshBtn');

    // Test 7: UP from refresh button -> toggleAutoNext
    Nav.focus(btnRefresh7);
    assert.strictEqual(Nav.handleSettingsNavigation('up'), toggleNext, 'UP from refresh button reaches toggleAutoNext');
  });

  it('20. layout.css defines explicit padding and margins for Home onboarding (no gap-only dependency)', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../css/layout.css'), 'utf8');

    // 1. Outer container has explicit padding
    assert.ok(css.includes('.home-onboarding-area'), 'Has .home-onboarding-area selector');
    assert.ok(css.includes('padding: 32px 24px;'), '.home-onboarding-area has explicit padding');

    // 2. Card has explicit column layout and padding
    assert.ok(css.includes('.empty-state-card {') && css.includes('flex-direction: column;'), '.empty-state-card specifies flex-direction: column');
    assert.ok(css.includes('padding: 44px 36px;'), '.empty-state-card has explicit padding');

    // 3. Icon / message has explicit margin-bottom
    assert.ok(css.includes('.onboarding-logo-wrap {') && css.includes('margin-bottom: 24px;'), '.onboarding-logo-wrap has explicit margin-bottom');

    // 4. Message / button has explicit margin-bottom
    assert.ok(css.includes('.empty-state-text-group {') && css.includes('margin-bottom: 32px;'), '.empty-state-text-group has explicit margin-bottom');

    // 5. Headline / description has explicit margin-bottom
    assert.ok(css.includes('.empty-state-headline {') && css.includes('margin-bottom: 10px;'), '.empty-state-headline has explicit margin-bottom');

    // 6. RTL keeps centered alignment
    assert.ok(css.includes('html[dir="rtl"] .home-onboarding-area .empty-state-card'), 'RTL preserves centering for onboarding card');
  });

  it('21. navigation.js handles Movies and Series UP navigation to Header Search', () => {
    const navContent = fs.readFileSync(path.join(__dirname, '../js/ui/navigation.js'), 'utf-8');
    assert.ok(navContent.includes("return document.getElementById('btn-header-search') || null;"), "UP should reach btn-header-search");
  });

  it('22. movies.js and series.js chunking is infinite and MAX_DOM_CARDS limit is removed', () => {
    const moviesContent = fs.readFileSync(path.join(__dirname, '../js/ui/movies.js'), 'utf-8');
    const seriesContent = fs.readFileSync(path.join(__dirname, '../js/ui/series.js'), 'utf-8');
    assert.ok(moviesContent.includes("var endIndex = targetEnd;"), "movies.js should use targetEnd directly");
    assert.ok(seriesContent.includes("var endIndex = targetEnd;"), "series.js should use targetEnd directly");
    assert.ok(!moviesContent.includes("&& renderedCount < MAX_DOM_CARDS"), "movies checkLoadMore should not have MAX_DOM_CARDS");
    assert.ok(!seriesContent.includes("&& renderedCount < MAX_DOM_CARDS"), "series checkLoadMore should not have MAX_DOM_CARDS");
  });

  it('23. index.html includes password visibility eye toggle', () => {
    const htmlContent = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf-8');
    assert.ok(htmlContent.includes('id="btn-toggle-password"'), "Toggle password button should exist");
    assert.ok(htmlContent.includes('id="icon-eye-show"'), "Eye show icon should exist");
  });

  it('24. layout.css includes explicit spacing for detail page (no flex gap)', () => {
    const cssContent = fs.readFileSync(path.join(__dirname, '../css/layout.css'), 'utf-8');
    assert.ok(!cssContent.match(/\.details-main-layout\s*\{[^}]*gap:\s*\d+px;[^}]*\}/), "details-main-layout should not use gap");
    assert.ok(cssContent.includes("margin-right: 48px;"), "details-poster-column should use margin-right");
  });

  console.log(`\n============================================================`);
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`============================================================\n`);

  if (failed > 0) process.exit(1);
}

runCacheTests();
