/**
 * Free IPTV Player — Series Season Selector Automated Test Suite
 * Validates all 16 requirements specified in Section 14:
 * 1. Series details page renders the season dropdown button
 * 2. Dropdown button displays the initial season name
 * 3. Horizontal season tab row is not the primary selector
 * 4. getSeriesInfo correctly normalizes provider season formats
 * 5. String season numbers ('1', '2') convert correctly to numeric order
 * 6. Keyed season objects convert correctly to array
 * 7. Seasons are sorted in ascending order
 * 8. Opening dropdown displays all seasons
 * 9. D-pad UP/DOWN navigates between seasons in the open dropdown
 * 10. Pressing ENTER on a season selects that season
 * 11. Selecting a season closes the dropdown
 * 12. Selecting a season replaces episode list with that season's episodes
 * 13. Episodes belong strictly to the selected season
 * 14. Pressing RETURN closes the dropdown without changing selection
 * 15. Returning from player preserves the selected season
 * 16. Opening a series from Favorites/Search preserves this behavior
 */

const fs = require('fs');
const path = require('path');

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

console.log('\n============================================================');
console.log('FREE IPTV PLAYER — SERIES SEASON SELECTOR TEST SUITE');
console.log('============================================================\n');

// 1. Check index.html structure
const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

assert(html.includes('id="btn-season-selector"'), '1. index.html contains #btn-season-selector button');
assert(html.includes('id="season-selector-label"'), '1. index.html contains #season-selector-label');
assert(html.includes('id="season-dropdown-list"'), '1. index.html contains #season-dropdown-list menu');
assert(html.includes('class="series-season-selector-group"'), '1. index.html contains .series-season-selector-group');
assert(!html.includes('<div id="series-seasons-tabs" class="series-seasons-tabs" role="tablist"></div>\n              </div>'), '3. Horizontal season tab row is removed as primary selector');

// 2. Check CSS styling
const cssPath = path.join(__dirname, '..', 'css', 'layout.css');
const css = fs.readFileSync(cssPath, 'utf8');

assert(css.includes('.season-select-btn'), '1. layout.css defines .season-select-btn');
assert(css.includes('.season-dropdown-menu'), '1. layout.css defines .season-dropdown-menu');
assert(css.includes('.season-dropdown-item'), '1. layout.css defines .season-dropdown-item');
assert(css.includes('.series-season-selector-group'), '1. layout.css defines .series-season-selector-group');

// 3. Check Constants
const constantsPath = path.join(__dirname, '..', 'js', 'core', 'constants.js');
const constantsCode = fs.readFileSync(constantsPath, 'utf8');
assert(constantsCode.includes("SERIES_SEASON_DROPDOWN: 'series_season_dropdown'"), 'Constants defines SERIES_SEASON_DROPDOWN');

// 4. Test Data Normalization in XtreamApi
const mockWindow = {
  FreeIPTV: {
    Http: {
      get: () => Promise.resolve({ data: {} })
    }
  }
};

eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'playlist', 'xtream-api.js'), 'utf8').replace('(function (window) {', '(function (window) {').replace('})(window);', '})(mockWindow);'));

const XtreamAPI = mockWindow.FreeIPTV.XtreamAPI;

// Test 4, 5, 6, 7: Normalization of various season formats
console.log('\n--- Testing Season Normalization Formats ---');

// Standard array format
const arrayRaw = {
  seasons: [
    { season_number: 1, name: 'Season 1', episode_count: 7 },
    { season_number: 2, name: 'Season 2', episode_count: 13 }
  ],
  episodes: {
    '1': [{ id: 101, title: 'Pilot', episode_num: 1, info: { duration_secs: 3480 } }],
    '2': [{ id: 201, title: 'Seven Thirty-Seven', episode_num: 1, info: { duration_secs: 2820 } }]
  }
};

const normArray = XtreamAPI.normalizeSeriesInfo(arrayRaw, '123', 'http://test.com', 'user', 'pass', 'pl_1');
assert(normArray.seasons.length === 2, '4. Normalizes array seasons length = 2');
assert(normArray.seasons[0].seasonNumber === 1 && normArray.seasons[0].name === 'Season 1', '4. First season is Season 1');
assert(normArray.seasons[1].seasonNumber === 2 && normArray.seasons[1].name === 'Season 2', '4. Second season is Season 2');

// String season numbers and unsorted order
const stringRaw = {
  seasons: [
    { season_number: '3', name: 'Season 3' },
    { season_number: '1', name: 'Season 1' },
    { season_number: '2', name: 'Season 2' }
  ],
  episodes: {
    '1': [{ id: 101, title: 'Ep 1', episode_num: '1' }],
    '2': [{ id: 201, title: 'Ep 2', episode_num: '1' }],
    '3': [{ id: 301, title: 'Ep 3', episode_num: '1' }]
  }
};

const normString = XtreamAPI.normalizeSeriesInfo(stringRaw, '456', 'http://test.com', 'user', 'pass', 'pl_1');
assert(normString.seasons.length === 3, '5. Normalizes string season numbers');
assert(normString.seasons[0].seasonNumber === 1, '5. String season 1 converted to numeric 1');
assert(normString.seasons[1].seasonNumber === 2, '5. String season 2 converted to numeric 2');
assert(normString.seasons[2].seasonNumber === 3, '5. String season 3 converted to numeric 3');
assert(normString.seasons[0].seasonNumber < normString.seasons[1].seasonNumber && normString.seasons[1].seasonNumber < normString.seasons[2].seasonNumber, '7. Seasons sorted ascending numerically');

// Keyed map/object format
const keyedRaw = {
  seasons: {
    '2': { name: 'Season Two', episode_count: 10 },
    '1': { name: 'Season One', episode_count: 8 }
  },
  episodes: {
    '1': [{ id: 101, title: 'S1E1', episode_num: 1 }],
    '2': [{ id: 201, title: 'S2E1', episode_num: 1 }]
  }
};

const normKeyed = XtreamAPI.normalizeSeriesInfo(keyedRaw, '789', 'http://test.com', 'user', 'pass', 'pl_1');
assert(Array.isArray(normKeyed.seasons), '6. Keyed season object converted to Array');
assert(normKeyed.seasons.length === 2, '6. Keyed season has 2 entries');
assert(normKeyed.seasons[0].seasonNumber === 1 && normKeyed.seasons[0].name === 'Season One', '6 & 7. Keyed object sorted with Season 1 first');
assert(normKeyed.seasons[1].seasonNumber === 2 && normKeyed.seasons[1].name === 'Season Two', '6 & 7. Keyed object sorted with Season 2 second');

// 5. Test DOM Interaction & Series Controller
console.log('\n--- Testing UI Controller & Remote Navigation ---');

// Robust Mock Element
function createMockElement(id, tagName = 'div', className = '') {
  const el = {
    id: id || '',
    tagName: tagName.toUpperCase(),
    _className: className,
    get className() { return this._className; },
    set className(val) {
      this._className = val;
      this.classList._classes = new Set(val.split(' ').filter(Boolean));
    },
    classList: {
      _classes: new Set(className.split(' ').filter(Boolean)),
      add: function (...args) { args.forEach(c => this._classes.add(c)); },
      remove: function (...args) { args.forEach(c => this._classes.delete(c)); },
      contains: function (c) { return this._classes.has(c); },
      toggle: function (c, force) {
        if (typeof force === 'boolean') {
          if (force) this.add(c); else this.remove(c);
          return force;
        }
        if (this.contains(c)) { this.remove(c); return false; }
        this.add(c); return true;
      }
    },
    attributes: {},
    setAttribute: function (k, v) { this.attributes[k] = String(v); },
    getAttribute: function (k) { return this.attributes[k] || null; },
    removeAttribute: function (k) { delete this.attributes[k]; },
    children: [],
    appendChild: function (c) { c.parentElement = this; this.children.push(c); return c; },
    removeChild: function (c) {
      const idx = this.children.indexOf(c);
      if (idx !== -1) this.children.splice(idx, 1);
      return c;
    },
    _innerHTML: '',
    get innerHTML() { return this._innerHTML; },
    set innerHTML(val) {
      this._innerHTML = val;
      if (val === '') this.children = [];
    },
    textContent: '',
    style: {},
    listeners: {},
    addEventListener: function (evt, fn) {
      this.listeners[evt] = this.listeners[evt] || [];
      this.listeners[evt].push(fn);
    },
    click: function () {
      if (this.listeners['click']) {
        this.listeners['click'].forEach(fn => fn({ target: this, preventDefault: () => {} }));
      }
    },
    closest: function (sel) {
      let cur = this;
      while (cur) {
        if (sel.startsWith('#') && cur.id === sel.slice(1)) return cur;
        if (sel.startsWith('.') && cur.classList.contains(sel.slice(1))) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    querySelectorAll: function (sel) {
      const results = [];
      function recurse(node) {
        for (const child of node.children) {
          const parts = sel.split(',').map(s => s.trim());
          let anyMatch = false;
          for (const part of parts) {
            let pMatch = true;
            const subSelectors = part.split(/(?=[.#])/).filter(Boolean);
            for (const s of subSelectors) {
              if (s.startsWith('#') && child.id !== s.slice(1)) pMatch = false;
              if (s.startsWith('.') && !child.classList.contains(s.slice(1))) pMatch = false;
            }
            if (pMatch) { anyMatch = true; break; }
          }
          if (anyMatch) results.push(child);
          recurse(child);
        }
      }
      recurse(this);
      return results;
    },
    querySelector: function (sel) {
      const all = this.querySelectorAll(sel);
      return all[0] || null;
    }
  };
  return el;
}

const domElements = {
  'view-series_details': createMockElement('view-series_details', 'section', 'view-screen'),
  'btn-series-back': createMockElement('btn-series-back', 'button', 'focusable'),
  'btn-series-fav': createMockElement('btn-series-fav', 'button', 'focusable'),
  'btn-season-selector': createMockElement('btn-season-selector', 'button', 'season-select-btn focusable'),
  'season-selector-label': createMockElement('season-selector-label', 'span'),
  'season-dropdown-list': createMockElement('season-dropdown-list', 'div', 'season-dropdown-menu hidden'),
  'series-episodes-list': createMockElement('series-episodes-list', 'div', 'series-episodes-list'),
  'series-episodes-container': createMockElement('series-episodes-container', 'div', 'series-episodes-container hidden'),
  'series-seasons-tabs': createMockElement('series-seasons-tabs', 'div', 'series-seasons-tabs hidden'),
  'series-details-title': createMockElement('series-details-title', 'h1'),
  'series-details-desc': createMockElement('series-details-desc', 'p'),
  'series-details-meta': createMockElement('series-details-meta', 'div'),
  'series-details-poster': createMockElement('series-details-poster', 'img'),
  'series-details-backdrop': createMockElement('series-details-backdrop', 'div'),
  'series-details-cast': createMockElement('series-details-cast', 'div'),
  'view-player': createMockElement('view-player', 'section', 'player-screen hidden')
};

// Assemble DOM hierarchy
const detailsView = domElements['view-series_details'];
detailsView.appendChild(domElements['btn-series-back']);
detailsView.appendChild(domElements['btn-series-fav']);

const selectorGroup = createMockElement('', 'div', 'series-season-selector-group');
const dropdownWrap = createMockElement('', 'div', 'season-dropdown-wrapper');
const seasonBtn = domElements['btn-season-selector'];
seasonBtn.appendChild(domElements['season-selector-label']);
dropdownWrap.appendChild(seasonBtn);
dropdownWrap.appendChild(domElements['season-dropdown-list']);
selectorGroup.appendChild(dropdownWrap);
detailsView.appendChild(selectorGroup);

const epWrap = createMockElement('', 'div', 'series-episodes-wrap');
epWrap.appendChild(domElements['series-episodes-list']);
epWrap.appendChild(domElements['series-episodes-container']);
epWrap.appendChild(domElements['series-seasons-tabs']);
detailsView.appendChild(epWrap);

// Mock document
const mockDocument = {
  body: {
    contains: (el) => true,
    classList: createMockElement('').classList
  },
  getElementById: (id) => domElements[id] || null,
  querySelector: (sel) => {
    if (sel.startsWith('#')) return domElements[sel.slice(1)] || null;
    return detailsView.querySelector(sel);
  },
  querySelectorAll: (sel) => {
    if (sel.includes('#season-dropdown-list')) {
      const subSel = sel.replace(/#season-dropdown-list\s*/, '').trim();
      return domElements['season-dropdown-list'].querySelectorAll(subSel || '*');
    }
    if (sel.includes('#series-episodes-list')) {
      const subSel = sel.replace(/#series-episodes-list\s*/, '').trim();
      return domElements['series-episodes-list'].querySelectorAll(subSel || '*');
    }
    return detailsView.querySelectorAll(sel);
  },
  createElement: (tag) => createMockElement('', tag, '')
};

// Mock Remote
const mockRemote = {
  _handlers: [],
  pushBackHandler: function (h) { this._handlers.push(h); },
  popBackHandler: function () { return this._handlers.pop(); },
  triggerBack: function () {
    for (let i = this._handlers.length - 1; i >= 0; i--) {
      if (this._handlers[i]()) return true;
    }
    return false;
  }
};

const sampleDetails = {
  seasons: [
    { seasonNumber: 1, name: 'Season 1' },
    { seasonNumber: 2, name: 'Season 2' },
    { seasonNumber: 3, name: 'Season 3' }
  ],
  episodesBySeason: {
    1: [
      { id: 101, seasonNumber: 1, episodeNumber: 1, name: 'Pilot S1E1', streamUrl: 'http://s1e1' },
      { id: 102, seasonNumber: 1, episodeNumber: 2, name: 'Cat\'s in the Bag S1E2', streamUrl: 'http://s1e2' }
    ],
    2: [
      { id: 201, seasonNumber: 2, episodeNumber: 1, name: 'Seven Thirty-Seven S2E1', streamUrl: 'http://s2e1' },
      { id: 202, seasonNumber: 2, episodeNumber: 2, name: 'Grilled S2E2', streamUrl: 'http://s2e2' }
    ],
    3: [
      { id: 301, seasonNumber: 3, episodeNumber: 1, name: 'No Más S3E1', streamUrl: 'http://s3e1' }
    ]
  }
};

let playedEpisode = null;
let playedSeason = null;

const mockPlayer = {
  playEpisode: (series, seasonNum, ep, pos) => {
    playedEpisode = ep;
    playedSeason = seasonNum;
    domElements['view-player'].classList.remove('hidden');
    mockRemote.pushBackHandler(() => {
      mockPlayer.closePlayer();
      return true;
    });
  },
  closePlayer: () => {
    domElements['view-player'].classList.add('hidden');
    mockRemote.popBackHandler();
  }
};

const mockPlaylistMgr = {
  getActivePlaylistId: () => 'test_playlist_1',
  getPlaybackProgress: () => null,
  isFavoriteItem: () => false,
  getSeriesDetails: () => Promise.resolve(sampleDetails)
};

const envWindow = {
  document: mockDocument,
  FreeIPTV: {
    Constants: {
      NAV_ZONES: {
        SERIES_DETAILS: 'series_details',
        SERIES_SEASON_DROPDOWN: 'series_season_dropdown'
      },
      DIRECTIONS: { UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right' }
    },
    Remote: mockRemote,
    PlaylistManager: mockPlaylistMgr,
    Player: mockPlayer,
    I18n: {
      t: (k) => k
    },
    Home: {
      switchView: (v) => {}
    }
  }
};

// Load navigation.js into environment
const navCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui', 'navigation.js'), 'utf8');
const runNav = new Function('window', 'document', navCode);
runNav(envWindow, mockDocument);
const Navigation = envWindow.FreeIPTV.Navigation;

// Load series.js into environment
const seriesCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui', 'series.js'), 'utf8');
const runSeries = new Function('window', 'document', seriesCode);
runSeries(envWindow, mockDocument);

const Series = envWindow.FreeIPTV.Series;
Series.init();

// Open Series Details with sample series
const testSeries = {
  id: 'series_1',
  name: 'Breaking Bad',
  description: 'A chemistry teacher...',
  rating: '9.5',
  genre: 'Drama'
};

Series.openSeriesDetails(testSeries);

// Wait for getSeriesDetails promise
setTimeout(() => {
  console.log('\n--- Verifying Initial Series Details State ---');

  // Req 1 & 2: Dropdown button renders and shows Season 1
  const label = domElements['season-selector-label'];
  assert(label.textContent === 'Season 1', '2. Dropdown button displays initial season name (Season 1)');
  assert(Series.getActiveSeasonNumber() === 1, '2. Active season number is 1');

  // Check initial episodes belong strictly to Season 1
  const epList = domElements['series-episodes-list'];
  assert(epList.children.length === 2, '12. Initially renders Season 1 episodes (2 episodes)');
  assert(epList.children[0].querySelector('.episode-title') && epList.children[0].querySelector('.episode-title').textContent === 'Pilot S1E1', '13. First episode is strictly from Season 1');
  assert(epList.children[1].querySelector('.episode-title') && epList.children[1].querySelector('.episode-title').textContent === 'Cat\'s in the Bag S1E2', '13. Second episode is strictly from Season 1');

  // Req 8: Open dropdown displays all seasons
  console.log('\n--- Verifying Dropdown Open & Selection ---');
  Series.openSeasonDropdown();
  const menu = domElements['season-dropdown-list'];
  assert(!menu.classList.contains('hidden'), '8. Dropdown menu is opened (visible)');
  assert(seasonBtn.getAttribute('aria-expanded') === 'true', '8. aria-expanded is true');
  assert(menu.children.length === 3, '8. Dropdown contains all 3 seasons');
  assert(menu.children[0].textContent === 'Season 1', '8. Dropdown option 1 is Season 1');
  assert(menu.children[1].textContent === 'Season 2', '8. Dropdown option 2 is Season 2');
  assert(menu.children[2].textContent === 'Season 3', '8. Dropdown option 3 is Season 3');

  // Req 9: UP / DOWN navigation inside open dropdown
  Navigation.focus(menu.children[0]);
  const nextDown = Navigation.calculateNextElement('series_season_dropdown', 'down');
  assert(nextDown === menu.children[1], '9. D-pad DOWN navigates from Season 1 to Season 2');

  Navigation.focus(menu.children[1]);
  const nextDown2 = Navigation.calculateNextElement('series_season_dropdown', 'down');
  assert(nextDown2 === menu.children[2], '9. D-pad DOWN navigates from Season 2 to Season 3');

  const nextUp = Navigation.calculateNextElement('series_season_dropdown', 'up');
  assert(nextUp === menu.children[0], '9. D-pad UP navigates from Season 2 to Season 1');

  // Req 14: Pressing RETURN closes dropdown without changing selection
  console.log('\n--- Verifying RETURN key behavior ---');
  assert(Series.isSeasonDropdownOpen() === true, 'Dropdown is open before RETURN');
  const returnHandled = mockRemote.triggerBack();
  assert(returnHandled === true, '14. RETURN key handled by dropdown');
  assert(Series.isSeasonDropdownOpen() === false, '14. Dropdown closed by RETURN');
  assert(Series.getActiveSeasonNumber() === 1, '14. Season selection unchanged (remained Season 1)');
  assert(Navigation.getCurrent() === seasonBtn, '14. Focus returned to Season Dropdown button');

  // Req 10, 11, 12, 13: Pressing ENTER on Season 2 selects that season
  console.log('\n--- Verifying Season Selection (Season 2) ---');
  Series.openSeasonDropdown();
  // Simulate clicking Season 2 option
  menu.children[1].click();

  assert(Series.isSeasonDropdownOpen() === false, '11. Selecting a season closes the dropdown');
  assert(Series.getActiveSeasonNumber() === 2, '10. Active season updated to Season 2');
  assert(label.textContent === 'Season 2', '10. Dropdown button label updated to Season 2');
  assert(epList.children.length === 2, '12. Replaced episode list with Season 2 episodes');
  assert(epList.children[0].querySelector('.episode-title') && epList.children[0].querySelector('.episode-title').textContent === 'Seven Thirty-Seven S2E1', '13. Season 2 episode 1 rendered');
  assert(epList.children[1].querySelector('.episode-title') && epList.children[1].querySelector('.episode-title').textContent === 'Grilled S2E2', '13. Season 2 episode 2 rendered');

  // Req 15: Returning from player preserves selected season
  console.log('\n--- Verifying Playback Return State Preservation ---');
  // Click first episode of Season 2 to play
  const epCard = epList.children[0];
  epCard.click();

  assert(playedEpisode !== null && playedEpisode.name === 'Seven Thirty-Seven S2E1', '15. Episode playback launched');
  assert(playedSeason === 2, '15. Playback received Season 2');
  assert(Series.getActiveSeasonNumber() === 2, '15. Active season preserved as Season 2 during playback');

  // Now exit player with RETURN
  mockRemote.triggerBack();
  assert(domElements['view-player'].classList.contains('hidden'), '15. Player closed');
  assert(Series.getActiveSeasonNumber() === 2, '15. Returning from player preserves Season 2');
  assert(label.textContent === 'Season 2', '15. Season selector button still displays Season 2');
  assert(epList.children[0].querySelector('.episode-title') && epList.children[0].querySelector('.episode-title').textContent === 'Seven Thirty-Seven S2E1', '15. Episode list still shows Season 2 episodes');

  // Req 16: Opening from Search/Favorites preserves behavior
  console.log('\n--- Verifying Origin Route (Favorites/Search) ---');
  Series.closeSeriesDetails();
  assert(Series.isDetailsOpen() === false, '16. Series details closed cleanly');

  Series.openSeriesDetails(testSeries, 'favorites');
  setTimeout(() => {
    assert(Series.isDetailsOpen() === true, '16. Series opened from favorites route');
    assert(Series.getActiveSeasonNumber() === 1, '16. Opened with initial season 1');
    Series.selectSeason(3);
    assert(Series.getActiveSeasonNumber() === 3, '16. Switched to Season 3');
    assert(label.textContent === 'Season 3', '16. Displays Season 3');
    assert(epList.children.length === 1 && epList.children[0].querySelector('.episode-title').textContent === 'No Más S3E1', '16. Season 3 episode rendered');

    console.log(`\n============================================================`);
    console.log(`SEASON SELECTOR SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log(`============================================================\n`);

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }, 50);

}, 50);
