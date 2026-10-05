/**
 * Free IPTV Player — Complete Xtream Series Season Discovery Test Suite
 * Tests universal season discovery, normalization, grouping, synthesis, and caching
 * across all real-world Xtream API edge cases without hardcoding series or credentials.
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

console.log('============================================================');
console.log(' XTREAM SERIES SEASON DISCOVERY & CACHE TEST SUITE');
console.log('============================================================\n');

// Load XtreamApi into sandbox
const xtreamApiCode = fs.readFileSync(path.resolve(__dirname, '../js/playlist/xtream-api.js'), 'utf8');
const channelStoreCode = fs.readFileSync(path.resolve(__dirname, '../js/storage/channel-store.js'), 'utf8');
const fakeWindow = { FreeIPTV: {} };

vm.runInNewContext(xtreamApiCode, { window: fakeWindow });
vm.runInNewContext(channelStoreCode, { window: fakeWindow });

const XtreamApi = fakeWindow.FreeIPTV.XtreamApi;
const ChannelStore = fakeWindow.FreeIPTV.ChannelStore;

// TEST 1: Complete metadata
it('TEST 1: Complete metadata (seasons = [1,2,3], episodes = {1,2,3})', () => {
  const raw = {
    seasons: [
      { season_number: 1, name: 'Season 1' },
      { season_number: 2, name: 'Season 2' },
      { season_number: 3, name: 'Season 3' }
    ],
    episodes: {
      '1': [{ id: 101, episode_num: 1, title: 'S1E1' }],
      '2': [{ id: 201, episode_num: 1, title: 'S2E1' }],
      '3': [{ id: 301, episode_num: 1, title: 'S3E1' }]
    }
  };
  const norm = XtreamApi.normalizeSeriesInfo(raw, '1001', 'http://test:8080', 'user', 'pass', 'pl_1');
  assert.strictEqual(norm.seasons.length, 3);
  assert.strictEqual(JSON.stringify(norm.seasons.map(s => s.seasonNumber)), JSON.stringify([1, 2, 3]));
  assert.strictEqual(norm.episodesBySeason['1'].length, 1);
  assert.strictEqual(norm.episodesBySeason['2'].length, 1);
  assert.strictEqual(norm.episodesBySeason['3'].length, 1);
});

// TEST 2: Incomplete metadata (seasons = [1], episodes = {1,2,3})
it('TEST 2: Incomplete metadata (seasons = [1], episodes = {1,2,3}) discovers all 3 seasons', () => {
  const raw = {
    seasons: [
      { season_number: 1, name: 'Season 1' }
    ],
    episodes: {
      '1': [{ id: 101, episode_num: 1 }],
      '2': [{ id: 201, episode_num: 1 }],
      '3': [{ id: 301, episode_num: 1 }]
    }
  };
  const norm = XtreamApi.normalizeSeriesInfo(raw, '1002', 'http://test:8080', 'user', 'pass', 'pl_1');
  assert.strictEqual(norm.seasons.length, 3);
  assert.strictEqual(JSON.stringify(norm.seasons.map(s => s.seasonNumber)), JSON.stringify([1, 2, 3]));
  assert.strictEqual(norm.seasons[1].name, 'Season 2');
  assert.strictEqual(norm.seasons[2].name, 'Season 3');
});

// TEST 3: Empty metadata (seasons = [], episodes = {1,2,3,4})
it('TEST 3: Empty metadata (seasons = [], episodes = {1,2,3,4}) produces [1,2,3,4]', () => {
  const raw = {
    seasons: [],
    episodes: {
      '1': [{ id: 1 }],
      '2': [{ id: 2 }],
      '3': [{ id: 3 }],
      '4': [{ id: 4 }]
    }
  };
  const norm = XtreamApi.normalizeSeriesInfo(raw, '1003', 'http://test:8080', 'user', 'pass', 'pl_1');
  assert.strictEqual(norm.seasons.length, 4);
  assert.strictEqual(JSON.stringify(norm.seasons.map(s => s.seasonNumber)), JSON.stringify([1, 2, 3, 4]));
});

// TEST 4: Metadata missing middle seasons (seasons = [1,3,5], episodes = {1,2,3,4,5})
it('TEST 4: Metadata missing middle seasons (seasons = [1,3,5], episodes = {1,2,3,4,5}) produces [1,2,3,4,5]', () => {
  const raw = {
    seasons: [
      { season_number: 1, name: 'Season 1 Custom' },
      { season_number: 3, name: 'Season 3 Custom' },
      { season_number: 5, name: 'Season 5 Custom' }
    ],
    episodes: {
      '1': [{ id: 1 }],
      '2': [{ id: 2 }],
      '3': [{ id: 3 }],
      '4': [{ id: 4 }],
      '5': [{ id: 5 }]
    }
  };
  const norm = XtreamApi.normalizeSeriesInfo(raw, '1004', 'http://test:8080', 'user', 'pass', 'pl_1');
  assert.strictEqual(norm.seasons.length, 5);
  assert.strictEqual(JSON.stringify(norm.seasons.map(s => s.seasonNumber)), JSON.stringify([1, 2, 3, 4, 5]));
  assert.strictEqual(norm.seasons[0].name, 'Season 1 Custom');
  assert.strictEqual(norm.seasons[1].name, 'Season 2');
  assert.strictEqual(norm.seasons[2].name, 'Season 3 Custom');
});

// TEST 5: Metadata has season with no episodes (seasons = [1,2,3], episodes = {1,3})
it('TEST 5: Metadata has season with no episodes (seasons = [1,2,3], episodes = {1,3}) retains [1,2,3]', () => {
  const raw = {
    seasons: [
      { season_number: 1, name: 'Season 1' },
      { season_number: 2, name: 'Season 2 (Upcoming)', episode_count: 0 },
      { season_number: 3, name: 'Season 3' }
    ],
    episodes: {
      '1': [{ id: 1 }],
      '3': [{ id: 3 }]
    }
  };
  const norm = XtreamApi.normalizeSeriesInfo(raw, '1005', 'http://test:8080', 'user', 'pass', 'pl_1');
  assert.strictEqual(norm.seasons.length, 3);
  assert.strictEqual(JSON.stringify(norm.seasons.map(s => s.seasonNumber)), JSON.stringify([1, 2, 3]));
  assert.strictEqual(Array.isArray(norm.episodesBySeason['2']), true);
  assert.strictEqual(norm.episodesBySeason['2'].length, 0);
});

// TEST 6: String keys and numeric ordering (episodes = {"1":[...], "2":[...], "10":[...]})
it('TEST 6: String keys sort numerically [1, 2, 10] not lexicographically [1, 10, 2]', () => {
  const raw = {
    seasons: [],
    episodes: {
      '10': [{ id: 100, episode_num: 1 }],
      '2': [{ id: 20, episode_num: 1 }],
      '1': [{ id: 10, episode_num: 1 }]
    }
  };
  const norm = XtreamApi.normalizeSeriesInfo(raw, '1006', 'http://test:8080', 'user', 'pass', 'pl_1');
  assert.strictEqual(norm.seasons.length, 3);
  assert.strictEqual(JSON.stringify(norm.seasons.map(s => s.seasonNumber)), JSON.stringify([1, 2, 10]));
});

// TEST 7: Episode season fields discovery
it('TEST 7: Episode season fields discovered from flat or generic episode objects', () => {
  const raw = {
    seasons: [{ season_number: 1, name: 'Season 1' }],
    episodes: [
      { id: 101, season: 1, episode_num: 1 },
      { id: 201, season: 2, episode_num: 1 },
      { id: 301, season: 3, episode_num: 1 }
    ]
  };
  const norm = XtreamApi.normalizeSeriesInfo(raw, '1007', 'http://test:8080', 'user', 'pass', 'pl_1');
  assert.strictEqual(norm.seasons.length, 3);
  assert.strictEqual(JSON.stringify(norm.seasons.map(s => s.seasonNumber)), JSON.stringify([1, 2, 3]));
  assert.strictEqual(norm.episodesBySeason['2'][0].id.includes('201'), true);
  assert.strictEqual(norm.episodesBySeason['3'][0].id.includes('301'), true);
});

// TEST 8: Duplicate season discovery produces single season entry
it('TEST 8: Duplicate season appearances merged into unique entry', () => {
  const raw = {
    seasons: [
      { season_number: 2, name: 'Season 2 Metadata', episode_count: 1 }
    ],
    episodes: {
      '2': [
        { id: 201, season: 2, episode_num: 1 },
        { id: 202, season: 2, episode_num: 2 }
      ]
    }
  };
  const norm = XtreamApi.normalizeSeriesInfo(raw, '1008', 'http://test:8080', 'user', 'pass', 'pl_1');
  assert.strictEqual(norm.seasons.length, 1);
  assert.strictEqual(norm.seasons[0].seasonNumber, 2);
  assert.strictEqual(norm.seasons[0].name, 'Season 2 Metadata');
  assert.strictEqual(norm.seasons[0].episodeCount, 2); // Actual episode count takes precedence
});

// TEST 9: Silo real-world shape (seasons = [Season 1], episodes = {"1": 10, "2": 10, "3": 10})
it('TEST 9: Silo real-world shape preserves Season 1 (10 eps), Season 2 (10 eps), Season 3 (10 eps)', () => {
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
  const norm = XtreamApi.normalizeSeriesInfo(siloRaw, '5012', 'http://test:8080', 'user', 'pass', 'pl_1');
  assert.strictEqual(norm.seasons.length, 3, 'Discovers 3 seasons for Silo');
  assert.strictEqual(JSON.stringify(norm.seasons.map(s => s.seasonNumber)), JSON.stringify([1, 2, 3]));
  assert.strictEqual(norm.seasons[0].episodeCount, 10);
  assert.strictEqual(norm.seasons[1].episodeCount, 10);
  assert.strictEqual(norm.seasons[2].episodeCount, 10);
  assert.strictEqual(norm.episodesBySeason['1'].length, 10);
  assert.strictEqual(norm.episodesBySeason['2'].length, 10);
  assert.strictEqual(norm.episodesBySeason['3'].length, 10);
  assert.strictEqual(norm.episodesBySeason['2'][0].seasonNumber, 2);
  assert.strictEqual(norm.episodesBySeason['3'][0].seasonNumber, 3);
});

// TEST 10: Cache round-trip
it('TEST 10: Cache round-trip preserves all seasons and episodes', async () => {
  const testDetails = {
    seasons: [
      { id: 's1', seasonNumber: 1, name: 'Season 1', episodeCount: 10 },
      { id: 's2', seasonNumber: 2, name: 'Season 2', episodeCount: 10 },
      { id: 's3', seasonNumber: 3, name: 'Season 3', episodeCount: 10 }
    ],
    episodesBySeason: {
      '1': [{ id: 'e1', seasonNumber: 1, episodeNumber: 1 }],
      '2': [{ id: 'e2', seasonNumber: 2, episodeNumber: 1 }],
      '3': [{ id: 'e3', seasonNumber: 3, episodeNumber: 1 }]
    },
    allEpisodes: [
      { id: 'e1', seasonNumber: 1, episodeNumber: 1 },
      { id: 'e2', seasonNumber: 2, episodeNumber: 1 },
      { id: 'e3', seasonNumber: 3, episodeNumber: 1 }
    ]
  };

  await ChannelStore.saveSeriesDetails('pl_test', '5012', testDetails);
  const retrieved = await ChannelStore.getSeriesDetails('pl_test', '5012');
  assert.ok(retrieved !== null, 'Retrieved cached details');
  assert.strictEqual(retrieved.seasons.length, 3, 'Cached seasons length is 3');
  assert.strictEqual(JSON.stringify(retrieved.seasons.map(s => s.seasonNumber)), JSON.stringify([1, 2, 3]));
  assert.strictEqual(retrieved.episodesBySeason['1'].length, 1);
  assert.strictEqual(retrieved.episodesBySeason['2'].length, 1);
  assert.strictEqual(retrieved.episodesBySeason['3'].length, 1);
});

// TEST 11: 20+ seasons support without hardcoded caps
it('TEST 11: Supports arbitrarily large numbers of seasons (25 seasons)', () => {
  const eps = {};
  for (let i = 1; i <= 25; i++) {
    eps[String(i)] = [{ id: i * 100, episode_num: 1 }];
  }
  const norm = XtreamApi.normalizeSeriesInfo({ seasons: [], episodes: eps }, '9999', 'http://test:8080', 'user', 'pass', 'pl_1');
  assert.strictEqual(norm.seasons.length, 25, 'Supports 25 seasons');
  assert.strictEqual(norm.seasons[0].seasonNumber, 1);
  assert.strictEqual(norm.seasons[24].seasonNumber, 25);
});

// TEST 12: Episode numbers within seasons sorted numerically
it('TEST 12: Episode numbers within seasons are strictly sorted numerically', () => {
  const raw = {
    seasons: [{ season_number: 1, name: 'Season 1' }],
    episodes: {
      '1': [
        { id: 10, episode_num: '10', title: 'Ep 10' },
        { id: 2, episode_num: '2', title: 'Ep 2' },
        { id: 1, episode_num: '1', title: 'Ep 1' }
      ]
    }
  };
  const norm = XtreamApi.normalizeSeriesInfo(raw, '1012', 'http://test:8080', 'user', 'pass', 'pl_1');
  assert.strictEqual(norm.episodesBySeason['1'][0].episodeNumber, 1);
  assert.strictEqual(norm.episodesBySeason['1'][1].episodeNumber, 2);
  assert.strictEqual(norm.episodesBySeason['1'][2].episodeNumber, 10);
});

// TEST 13: Content only contains Season 1 -> [1]
it('TEST 13: Content only contains Season 1 -> [1]', () => {
  const raw = {
    seasons: [],
    episodes: {
      '1': [{ id: 1, episode_num: 1, season: 1 }]
    }
  };
  const norm = XtreamApi.normalizeSeriesInfo(raw, '2001', 'http://test:8080', 'user', 'pass', 'pl_1');
  assert.strictEqual(norm.seasons.length, 1);
  assert.strictEqual(JSON.stringify(norm.seasons.map(s => s.seasonNumber)), JSON.stringify([1]));
});

// TEST 14: Content contains 1, 2 -> [1, 2]
it('TEST 14: Content contains 1, 2 -> [1, 2]', () => {
  const raw = {
    seasons: [{ season_number: 1, name: 'Season 1' }],
    episodes: {
      '1': [{ id: 1, episode_num: 1, season: 1 }],
      '2': [{ id: 2, episode_num: 1, season: 2 }]
    }
  };
  const norm = XtreamApi.normalizeSeriesInfo(raw, '2002', 'http://test:8080', 'user', 'pass', 'pl_1');
  assert.strictEqual(norm.seasons.length, 2);
  assert.strictEqual(JSON.stringify(norm.seasons.map(s => s.seasonNumber)), JSON.stringify([1, 2]));
});

// TEST 15: Content contains 1, 2, 3 -> [1, 2, 3]
it('TEST 15: Content contains 1, 2, 3 -> [1, 2, 3]', () => {
  const raw = {
    seasons: [{ season_number: 1, name: 'Season 1' }],
    episodes: {
      '1': [{ id: 1, episode_num: 1, season: 1 }],
      '2': [{ id: 2, episode_num: 1, season: 2 }],
      '3': [{ id: 3, episode_num: 1, season: 3 }]
    }
  };
  const norm = XtreamApi.normalizeSeriesInfo(raw, '2003', 'http://test:8080', 'user', 'pass', 'pl_1');
  assert.strictEqual(norm.seasons.length, 3);
  assert.strictEqual(JSON.stringify(norm.seasons.map(s => s.seasonNumber)), JSON.stringify([1, 2, 3]));
});

// TEST 16: Content contains 1, 3 -> [1, 3]
it('TEST 16: Content contains 1, 3 -> [1, 3]', () => {
  const raw = {
    seasons: [{ season_number: 1, name: 'Season 1' }],
    episodes: {
      '1': [{ id: 1, episode_num: 1, season: 1 }],
      '3': [{ id: 3, episode_num: 1, season: 3 }]
    }
  };
  const norm = XtreamApi.normalizeSeriesInfo(raw, '2004', 'http://test:8080', 'user', 'pass', 'pl_1');
  assert.strictEqual(norm.seasons.length, 2);
  assert.strictEqual(JSON.stringify(norm.seasons.map(s => s.seasonNumber)), JSON.stringify([1, 3]));
});

// TEST 17: Content contains 1, 2, 10 -> [1, 2, 10]
it('TEST 17: Content contains 1, 2, 10 -> [1, 2, 10]', () => {
  const raw = {
    seasons: [],
    episodes: {
      '10': [{ id: 10, episode_num: 1, season: 10 }],
      '2': [{ id: 2, episode_num: 1, season: 2 }],
      '1': [{ id: 1, episode_num: 1, season: 1 }]
    }
  };
  const norm = XtreamApi.normalizeSeriesInfo(raw, '2005', 'http://test:8080', 'user', 'pass', 'pl_1');
  assert.strictEqual(norm.seasons.length, 3);
  assert.strictEqual(JSON.stringify(norm.seasons.map(s => s.seasonNumber)), JSON.stringify([1, 2, 10]));
});

// TEST 18: Authoritative content property exposed and populated
it('TEST 18: Authoritative content array property is exposed alongside allEpisodes', () => {
  const raw = {
    seasons: [{ season_number: 1 }],
    episodes: {
      '1': [{ id: 101, season: 1, episode_num: 1 }],
      '2': [{ id: 201, season: 2, episode_num: 1 }]
    }
  };
  const norm = XtreamApi.normalizeSeriesInfo(raw, '2006', 'http://test:8080', 'user', 'pass', 'pl_1');
  assert.ok(Array.isArray(norm.content), 'norm.content is an Array');
  assert.strictEqual(norm.content.length, 2);
  assert.strictEqual(norm.content, norm.allEpisodes);
});

(async function () {
  console.log('\n============================================================');
  console.log(`RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('============================================================');
  if (failedTests > 0) {
    process.exit(1);
  }
})();
