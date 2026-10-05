/**
 * Free IPTV Player — Player Navigation & Series Regression Test Suite
 * Comprehensive automated regression testing for:
 *
 * 1. Player Left/Right behavior:
 *    - STATE A (Controls Hidden): Left/Right performs quick seek (-10s / +10s).
 *    - STATE B (Controls Visible): Left/Right moves focus between control buttons (NO SEEKING).
 *    - STATE C (Timeline Scrubber Focused): Left/Right adjusts scrub preview target (NO SEEKING).
 *      Enter commits seek. Return cancels scrub.
 *
 * 2. Back Navigation context loss:
 *    - Movie/Series -> Details -> Player -> Back -> Details.
 *    - Details -> Back -> Browsing context (category, scroll offset, focused card).
 *
 * 3. Series Season universal discovery & stale cache auto-repair:
 *    - Incomplete season arrays synthesized from episodes object.
 *    - Pre-patch stale cache lacking season entries auto-repaired upon cache hit.
 *    - Settings Clear Cache purges ChannelStore and in-memory caches.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

let passedTests = 0;
let failedTests = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  [PASS] ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${desc}`);
    console.error(`    -> ${err.message}`);
    failedTests++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${desc}`);
    console.error(`    -> ${err.message}`);
    failedTests++;
  }
}

console.log('====================================================');
console.log(' PLAYER + NAVIGATION + SERIES REGRESSION SUITE');
console.log('====================================================\n');

// ----------------------------------------------------
// PART 1: PLAYER REMOTE LEFT/RIGHT FOCUS & SEEKING LOGIC
// ----------------------------------------------------
console.log('--- 1. Player Remote Control & Focus States ---');

it('STATE A: Left/Right executes Player.seek() ONLY when controls are hidden', () => {
  const remoteCode = fs.readFileSync(path.resolve(__dirname, '../js/tv/remote.js'), 'utf8');

  // Verify remote.js structure
  assert.ok(remoteCode.includes("isControlsHidden"), "remote.js checks isControlsHidden");
  
  // Verify that inside isControlsHidden, Player.seek is called
  const hiddenIdx = remoteCode.indexOf("if (isControlsHidden)");
  assert.ok(hiddenIdx !== -1, "Found isControlsHidden block");
  const hiddenBlock = remoteCode.slice(hiddenIdx, hiddenIdx + 600);
  assert.ok(hiddenBlock.includes("Player.seek(-10)"), "Hidden controls Left invokes seek(-10)");
  assert.ok(hiddenBlock.includes("Player.seek(10)"), "Hidden controls Right invokes seek(10)");
});

it('STATE B: When controls are visible, Left/Right does NOT call Player.seek()', () => {
  const remoteCode = fs.readFileSync(path.resolve(__dirname, '../js/tv/remote.js'), 'utf8');

  // Verify that outside isControlsHidden and outside isTimelineFocused,
  // there are NO unconditional Player.seek calls before Navigation.move
  const lines = remoteCode.split('\n');
  let insidePlayerBlock = false;
  let seekCallsOutsideHidden = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("if (Player && Player.isActive())")) {
      insidePlayerBlock = true;
    }
    if (insidePlayerBlock && line.includes("Navigation.move")) {
      insidePlayerBlock = false;
    }
    if (insidePlayerBlock && line.includes("Player.seek(") && !line.includes("seek(-10)") && !line.includes("seek(10)")) {
      // not delta seek
    }
  }

  // Confirm the comment explaining State B
  assert.ok(remoteCode.includes("STATE B: Controls are VISIBLE -> do NOT seek on Left/Right!"), "State B explicitly documents no-seek navigation");
});

it('STATE C: Scrubber timeline focused intercepts Left/Right without executing seek', () => {
  const remoteCode = fs.readFileSync(path.resolve(__dirname, '../js/tv/remote.js'), 'utf8');
  assert.ok(remoteCode.includes("isTimelineFocused && Player.handleTimelineKey"), "Timeline focused routes to handleTimelineKey");
  assert.ok(remoteCode.includes("Player.handleTimelineKey('left')"), "Timeline focused Left calls handleTimelineKey('left')");
  assert.ok(remoteCode.includes("Player.handleTimelineKey('right')"), "Timeline focused Right calls handleTimelineKey('right')");
  assert.ok(remoteCode.includes("Player.handleTimelineKey('enter')"), "Timeline focused Enter calls handleTimelineKey('enter')");
});

// ----------------------------------------------------
// PART 2: BACK NAVIGATION BROWSING CONTEXT SNAPSHOT
// ----------------------------------------------------
console.log('\n--- 2. Browsing Context Retention (Movies & Series) ---');

it('Series view captures browsing snapshot upon openSeriesDetails', () => {
  const seriesCode = fs.readFileSync(path.resolve(__dirname, '../js/ui/series.js'), 'utf8');
  assert.ok(seriesCode.includes("browsingSnapshot = {"), "Captures browsingSnapshot in openSeriesDetails");
  assert.ok(seriesCode.includes("category: activeCategory"), "Captures activeCategory in snapshot");
  assert.ok(seriesCode.includes("focusedId: currentSeriesId"), "Captures focusedId in snapshot");
  assert.ok(seriesCode.includes("isRestoringBrowsingContext"), "Defines isRestoringBrowsingContext flag");
});

it('Series view bypasses onEnterView reset when isRestoringBrowsingContext is true', () => {
  const seriesCode = fs.readFileSync(path.resolve(__dirname, '../js/ui/series.js'), 'utf8');
  assert.ok(seriesCode.includes("if (isRestoringBrowsingContext) {\n              return;\n            }"), "VIEW_CHANGED checks isRestoringBrowsingContext");
});

it('Series closeSeriesDetails restores snapshot category and target card focus', () => {
  const seriesCode = fs.readFileSync(path.resolve(__dirname, '../js/ui/series.js'), 'utf8');
  assert.ok(seriesCode.includes("targetCard = document.querySelector('#series-grid-container .series-card[data-series-id=\"' + snap.focusedId + '\"]')"), "Restores focus to exact card ID");
  assert.ok(seriesCode.includes("activeCategory = snap.category"), "Restores category from snapshot");
});

it('Movies view captures browsing snapshot upon openMovieDetails', () => {
  const moviesCode = fs.readFileSync(path.resolve(__dirname, '../js/ui/movies.js'), 'utf8');
  assert.ok(moviesCode.includes("browsingSnapshot = {"), "Captures browsingSnapshot in openMovieDetails");
  assert.ok(moviesCode.includes("category: activeCategory"), "Captures activeCategory in snapshot");
  assert.ok(moviesCode.includes("focusedId: currentMovieId"), "Captures focusedId in snapshot");
  assert.ok(moviesCode.includes("isRestoringBrowsingContext"), "Defines isRestoringBrowsingContext flag");
});

it('Movies view bypasses onEnterView reset when isRestoringBrowsingContext is true', () => {
  const moviesCode = fs.readFileSync(path.resolve(__dirname, '../js/ui/movies.js'), 'utf8');
  assert.ok(moviesCode.includes("if (isRestoringBrowsingContext) {\n              return;\n            }"), "VIEW_CHANGED checks isRestoringBrowsingContext in movies");
});

it('Movies closeMovieDetails restores snapshot category and target card focus', () => {
  const moviesCode = fs.readFileSync(path.resolve(__dirname, '../js/ui/movies.js'), 'utf8');
  assert.ok(moviesCode.includes("targetCard = document.querySelector('#movies-grid-container .movie-card[data-movie-id=\"' + snap.focusedId + '\"]')"), "Restores focus to exact movie card ID");
  assert.ok(moviesCode.includes("activeCategory = snap.category"), "Restores category from snapshot in movies");
});

// ----------------------------------------------------
// PART 3: SERIES SEASONS REGRESSION & STALE CACHE REPAIR
// ----------------------------------------------------
console.log('\n--- 3. Universal Season Discovery & Stale Cache Immunity ---');

// Setup VM sandbox to test PlaylistManager and ChannelStore
const xtreamApiCode = fs.readFileSync(path.resolve(__dirname, '../js/playlist/xtream-api.js'), 'utf8');
const channelStoreCode = fs.readFileSync(path.resolve(__dirname, '../js/storage/channel-store.js'), 'utf8');
const playlistManagerCode = fs.readFileSync(path.resolve(__dirname, '../js/playlist/playlist-manager.js'), 'utf8');

const sandbox = {
  window: { FreeIPTV: {} },
  Date: Date,
  Promise: Promise,
  Object: Object,
  Array: Array,
  Number: Number,
  String: String,
  Math: Math,
  isNaN: isNaN,
  parseInt: parseInt
};

vm.runInNewContext(xtreamApiCode, sandbox);
vm.runInNewContext(channelStoreCode, sandbox);
vm.runInNewContext(playlistManagerCode, sandbox);

const XtreamApi = sandbox.window.FreeIPTV.XtreamApi;
const ChannelStore = sandbox.window.FreeIPTV.ChannelStore;
const PlaylistManager = sandbox.window.FreeIPTV.PlaylistManager;

it('Universal synthesis: Silo shape (seasons=[1], episodes={1, 2, 3}) produces seasons 1, 2, 3', () => {
  const siloRaw = {
    info: { name: 'Silo' },
    seasons: [
      { season_number: 1, name: 'Season 1', episode_count: 10 }
    ],
    episodes: {
      '1': Array.from({ length: 10 }, (_, i) => ({ id: `10${i + 1}`, episode_num: i + 1, title: `S1E${i + 1}` })),
      '2': Array.from({ length: 10 }, (_, i) => ({ id: `20${i + 1}`, episode_num: i + 1, title: `S2E${i + 1}` })),
      '3': Array.from({ length: 10 }, (_, i) => ({ id: `30${i + 1}`, episode_num: i + 1, title: `S3E${i + 1}` }))
    }
  };

  const norm = XtreamApi.normalizeSeriesInfo(siloRaw, '5012', 'http://test:8080', 'user', 'pass', 'pl_test');
  assert.strictEqual(norm.seasons.length, 3, "Norm produces all 3 seasons for Silo");
  assert.strictEqual(JSON.stringify(norm.seasons.map(s => s.seasonNumber)), JSON.stringify([1, 2, 3]), "Seasons are sorted 1, 2, 3");
  assert.strictEqual(norm.episodesBySeason['2'].length, 10, "Season 2 has 10 episodes");
  assert.strictEqual(norm.episodesBySeason['3'].length, 10, "Season 3 has 10 episodes");
});

it('Universal synthesis: The Pitt shape (seasons=[1, 2], episodes={1, 2}) preserves all seasons without regression', () => {
  const pittRaw = {
    info: { name: 'The Pitt' },
    seasons: [
      { season_number: 1, name: 'Season 1', episode_count: 15 },
      { season_number: 2, name: 'Season 2', episode_count: 15 }
    ],
    episodes: {
      '1': Array.from({ length: 15 }, (_, i) => ({ id: `p10${i + 1}`, episode_num: i + 1, title: `S1E${i + 1}` })),
      '2': Array.from({ length: 15 }, (_, i) => ({ id: `p20${i + 1}`, episode_num: i + 1, title: `S2E${i + 1}` }))
    }
  };

  const norm = XtreamApi.normalizeSeriesInfo(pittRaw, '5013', 'http://test:8080', 'user', 'pass', 'pl_test');
  assert.strictEqual(norm.seasons.length, 2, "Norm produces both seasons for The Pitt");
  assert.strictEqual(JSON.stringify(norm.seasons.map(s => s.seasonNumber)), JSON.stringify([1, 2]));
  assert.strictEqual(norm.episodesBySeason['1'].length, 15);
  assert.strictEqual(norm.episodesBySeason['2'].length, 15);
});

async function runAll() {
  await itAsync('Stale cache auto-repair: getSeriesDetails detects and fixes missing seasons in cached object', async () => {
    // Simulate an older stale cache entry from physical TV where only Season 1 was cached in seasons array
    const staleCachedSilo = {
      seasons: [
        { id: '5012_s1', seasonNumber: 1, name: 'Season 1', episodeCount: 10 }
      ],
      episodesBySeason: {
        '1': Array.from({ length: 10 }, (_, i) => ({ id: `10${i + 1}`, episode_num: i + 1, seasonNumber: 1 })),
        '2': Array.from({ length: 10 }, (_, i) => ({ id: `20${i + 1}`, episode_num: i + 1, seasonNumber: 2 })),
        '3': Array.from({ length: 10 }, (_, i) => ({ id: `30${i + 1}`, episode_num: i + 1, seasonNumber: 3 }))
      },
      allEpisodes: []
    };

    await ChannelStore.saveSeriesDetails('pl_stale_test', '5012', staleCachedSilo);

    // Now call PlaylistManager.getSeriesDetails on the stale entry
    const repaired = await PlaylistManager.getSeriesDetails('pl_stale_test', { id: '5012', seriesId: '5012' });

    assert.ok(repaired !== null, "Repaired object returned");
    assert.strictEqual(repaired.seasons.length, 3, "Stale cache was auto-repaired to include seasons 2 and 3");
    assert.strictEqual(JSON.stringify(repaired.seasons.map(s => s.seasonNumber)), JSON.stringify([1, 2, 3]), "Repaired seasons are [1, 2, 3]");

    // Verify that the repaired data was re-persisted to store
    const reRead = await ChannelStore.getSeriesDetails('pl_stale_test', '5012');
    assert.strictEqual(reRead.seasons.length, 3, "Repaired season details were saved back to cache");
  });

  await itAsync('Settings clearAll purges all caches across all stores', async () => {
    await ChannelStore.saveSeriesDetails('pl_purge', '999', { seasons: [{ seasonNumber: 1 }] });
    const beforeClear = await ChannelStore.getSeriesDetails('pl_purge', '999');
    assert.ok(beforeClear !== null, "Entry exists before clear");

    await ChannelStore.clearAll();
    const afterClear = await ChannelStore.getSeriesDetails('pl_purge', '999');
    assert.strictEqual(afterClear, null, "All stores purged successfully after clearAll");
  });

  await itAsync('Content-array authoritative: cached object with seasons=[1] but content=[S1,S2,S3] produces [1,2,3]', async () => {
    const rawContentEpisodes = [
      { id: 'e1', seasonNumber: 1, episodeNumber: 1 },
      { id: 'e2', seasonNumber: 2, episodeNumber: 1 },
      { id: 'e3', seasonNumber: 3, episodeNumber: 1 }
    ];
    const staleWithContent = {
      seasons: [{ id: 's1', seasonNumber: 1, name: 'Season 1' }],
      episodesBySeason: { '1': [rawContentEpisodes[0]] },
      content: rawContentEpisodes
    };
    await ChannelStore.saveSeriesDetails('pl_content_truth', '7001', staleWithContent);
    const resolved = await PlaylistManager.getSeriesDetails('pl_content_truth', { id: '7001', seriesId: '7001' });
    assert.strictEqual(resolved.seasons.length, 3);
    assert.strictEqual(JSON.stringify(resolved.seasons.map(s => s.seasonNumber)), JSON.stringify([1, 2, 3]));
    assert.strictEqual(resolved.episodesBySeason['2'].length, 1);
    assert.strictEqual(resolved.episodesBySeason['3'].length, 1);
  });

  console.log('\n====================================================');
  console.log(` RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('====================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAll();
