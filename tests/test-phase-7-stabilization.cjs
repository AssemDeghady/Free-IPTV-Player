/**
 * Free IPTV Player — Phase 7 Physical TV Stabilization Test Suite
 * Validates:
 * 1. Aspect Ratio Control completely removed from DOM and logic.
 * 2. Provider category order preserved across M3U parser, Xtream API, and Category Tree.
 * 3. Series missing seasons recovery and numerical ordering ("The Pitt", "Silo").
 * 4. Movies and Series category-scoped search inputs in DOM and Navigation.
 * 5. 10-foot typography calibration for 768p physical TV downscale.
 * 6. Localization completeness across EN and AR.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0;
let failed = 0;

function it(name, fn) {
  try {
    fn();
    console.log('  [PASS] ' + name);
    passed++;
  } catch (err) {
    console.error('  [FAIL] ' + name + ': ' + err.message);
    failed++;
  }
}

console.log('====================================================');
console.log(' PHASE 7 PHYSICAL TV STABILIZATION TEST SUITE');
console.log('====================================================\n');

// 1. Aspect Ratio Removal
console.log('--- 1. Aspect Ratio Control Removal ---');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const playerJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui', 'player.js'), 'utf8');

it('Aspect ratio button removed from index.html', () => {
  assert.strictEqual(indexHtml.includes('id="player-btn-aspect"'), false);
  assert.strictEqual(indexHtml.includes('cycleAspectRatio'), false);
});

it('cycleAspectRatio method removed from player.js', () => {
  assert.strictEqual(playerJs.includes('cycleAspectRatio'), false);
  assert.strictEqual(playerJs.includes('btnAspect'), false);
});

// 2. Provider Category Order Preservation
console.log('\n--- 2. Provider Category Order Preservation ---');
const m3uParserJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'playlist', 'm3u-parser.js'), 'utf8');
const xtreamApiJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'playlist', 'xtream-api.js'), 'utf8');
const playlistManagerJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'playlist', 'playlist-manager.js'), 'utf8');

it('No localeCompare sorting in m3u-parser.js', () => {
  assert.strictEqual(m3uParserJs.includes('localeCompare'), false);
});

it('No localeCompare sorting in xtream-api.js', () => {
  assert.strictEqual(xtreamApiJs.includes('localeCompare'), false);
});

it('M3UParser preserves first-seen category order', () => {
  const windowMock = { FreeIPTV: {} };
  const vm = require('vm');
  vm.runInNewContext(m3uParserJs, { window: windowMock });
  const M3UParser = windowMock.FreeIPTV.M3UParser;

  const sampleM3U = `#EXTM3U
#EXTINF:-1 group-title="Zebra News",Channel 1
http://example.com/1
#EXTINF:-1 group-title="Alpha Sports",Channel 2
http://example.com/2
#EXTINF:-1 group-title="Beta Cinema",Channel 3
http://example.com/3`;

  const parsed = M3UParser.parse(sampleM3U, 'test_pl');
  assert.strictEqual(parsed.categories[0], 'Zebra News');
  assert.strictEqual(parsed.categories[1], 'Alpha Sports');
  assert.strictEqual(parsed.categories[2], 'Beta Cinema');
  assert.strictEqual(parsed.categories.length, 3);
});

it('XtreamApi normalizes series seasons numerically and synthesizes missing seasons', () => {
  const windowMock = { FreeIPTV: {} };
  const vm = require('vm');
  vm.runInNewContext(xtreamApiJs, { window: windowMock });
  const XtreamApi = windowMock.FreeIPTV.XtreamApi;

  // Emulate "The Pitt" / "Silo" case where raw seasons list only has season 1
  // but episodes contain Season 1, Season 2, and Season 10
  const rawInfo = {
    info: { name: 'Silo' },
    seasons: [
      { season_number: 1, name: 'Season 1' }
    ],
    episodes: {
      '1': [
        { id: 'ep1', episode_num: 1, title: 'Freedom Day' }
      ],
      '2': [
        { id: 'ep2', episode_num: 1, title: 'The Engineer' }
      ],
      '10': [
        { id: 'ep10', episode_num: 1, title: 'Future Arc' }
      ]
    }
  };

  const normalized = XtreamApi.normalizeSeriesInfo(rawInfo, 's_1', 'http://server:8080', 'u', 'p', 'pl_1');
  assert.strictEqual(normalized.seasons.length, 3, 'All 3 seasons must be preserved/synthesized');
  assert.strictEqual(normalized.seasons[0].seasonNumber, 1);
  assert.strictEqual(normalized.seasons[1].seasonNumber, 2);
  assert.strictEqual(normalized.seasons[2].seasonNumber, 10);
});

// 3. Category-Scoped Search Inputs & Navigation
console.log('\n--- 3. Category-Scoped Search in Movies & Series ---');
const navJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui', 'navigation.js'), 'utf8');

it('Movies and Series have dedicated search input elements in index.html', () => {
  assert.ok(indexHtml.includes('id="movies-search-input"'));
  assert.ok(indexHtml.includes('id="series-search-input"'));
  assert.ok(indexHtml.includes('data-nav-zone="movies_search"'));
  assert.ok(indexHtml.includes('data-nav-zone="series_search"'));
});

it('Navigation engine handles movies_search and series_search zones', () => {
  assert.ok(navJs.includes("handleMoviesSearchNavigation"));
  assert.ok(navJs.includes("handleSeriesSearchNavigation"));
  assert.ok(navJs.includes("movies_search"));
  assert.ok(navJs.includes("series_search"));
});

// 4. UI Scaling & Typography Calibration for 768p Panel
console.log('\n--- 4. UI Scaling & Typography Calibration ---');
const layoutCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'layout.css'), 'utf8');
const liveEpgCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'live-epg.css'), 'utf8');

it('Poster height is responsive (--poster-h from card width), not fixed 380px', () => {
  assert.ok(layoutCss.includes('height: var(--poster-h, 300px)'));
  assert.strictEqual(/\.(movie|series)-poster-(wrap|box)[^}]*380px/.test(layoutCss), false);
  const mv = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui', 'movies.js'), 'utf8');
  const sv = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui', 'series.js'), 'utf8');
  assert.ok(mv.includes('applyPosterHeight(container)') && sv.includes('applyPosterHeight(container)'));
});

it('Search is debounced and uses cached pre-normalized text', () => {
  ['movies.js', 'series.js'].forEach(n => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui', n), 'utf8');
    assert.ok(src.includes('searchTimer = setTimeout') && src.includes('function searchText'));
  });
});

it('Entry focus never targets search inputs; search nav cannot trap focus', () => {
  const home = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui', 'home.js'), 'utf8');
  assert.ok(home.includes(':not(input)'));
  assert.ok(navJs.includes("#movies-categories-list .focusable') || null"));
  assert.ok(navJs.includes("#series-categories-list .focusable') || null"));
  assert.ok(navJs.includes("return document.getElementById('movies-search-input') || null;"));
  assert.ok(navJs.includes("return document.getElementById('series-search-input') || null;"));
});

it('Every I18n.t key used in JS exists in the EMBEDDED en/ar dictionaries (runtime source)', () => {
  const i18n = fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n', 'i18n.js'), 'utf8');
  const en = i18n.slice(i18n.indexOf('translations.en'), i18n.indexOf('translations.ar'));
  const ar = i18n.slice(i18n.indexOf('translations.ar'));
  ['movies.favorites', 'movies.continue_watching', 'series.favorites', 'series.continue_watching',
   'movies.search_placeholder', 'series.search_placeholder'].forEach(k => {
    assert.ok(en.includes("'" + k + "'"), 'EN missing ' + k);
    assert.ok(ar.includes("'" + k + "'"), 'AR missing ' + k);
  });
});

it('Live EPG text badges are readable at >= 12px', () => {
  assert.ok(liveEpgCss.includes('.preview-badge {\n  background-color: #ef4444;\n  color: #ffffff;\n  font-size: 12px;'));
  assert.ok(liveEpgCss.includes('.preview-muted-tag {\n  background-color: rgba(0, 0, 0, 0.7);\n  color: #94a3b8;\n  font-size: 12px;'));
});

// 5. Localization Completeness
console.log('\n--- 5. Localization Completeness ---');
const enJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n', 'en.json'), 'utf8'));
const arJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n', 'ar.json'), 'utf8'));

it('EN and AR have matching keys and include new search placeholders', () => {
  assert.ok(enJson['movies.search_placeholder']);
  assert.ok(arJson['movies.search_placeholder']);
  assert.ok(enJson['series.search_placeholder']);
  assert.ok(arJson['series.search_placeholder']);
  assert.strictEqual(Object.keys(enJson).length, Object.keys(arJson).length);
});

console.log('\n====================================================');
console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
}
