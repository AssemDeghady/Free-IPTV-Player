/**
 * Free IPTV Player — Category Quick Filter Test Suite
 * Validates real-time category quick filtering across Live TV, Movies, and Series,
 * including DOM elements, i18n parity, query filtering, and remote D-pad navigation.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failedTests++;
  }
}

console.log('============================================================');
console.log('FREE IPTV PLAYER — CATEGORY QUICK FILTER TEST SUITE');
console.log('============================================================\n');

// 1. Validate HTML structure
console.log('--- 1. HTML Structure & Input Attributes ---');
const htmlContent = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

assert(htmlContent.includes('id="live-category-search-input"'), 'Live TV contains #live-category-search-input');
assert(htmlContent.includes('id="movies-category-search-input"'), 'Movies contains #movies-category-search-input');
assert(htmlContent.includes('id="series-category-search-input"'), 'Series contains #series-category-search-input');

assert(htmlContent.includes('data-nav-zone="live_category_search"'), 'Live category search has data-nav-zone="live_category_search"');
assert(htmlContent.includes('data-nav-zone="movies_category_search"'), 'Movies category search has data-nav-zone="movies_category_search"');
assert(htmlContent.includes('data-nav-zone="series_category_search"'), 'Series category search has data-nav-zone="series_category_search"');

assert(htmlContent.includes('data-i18n-placeholder="categories.search_placeholder"'), 'Search inputs specify data-i18n-placeholder="categories.search_placeholder"');

// 2. Validate i18n Parity
console.log('\n--- 2. Localization Parity (EN & AR) ---');
const en = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../js/i18n/en.json'), 'utf8'));
const ar = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../js/i18n/ar.json'), 'utf8'));

assert(en['categories.search_placeholder'] !== undefined, 'EN contains categories.search_placeholder');
assert(ar['categories.search_placeholder'] !== undefined, 'AR contains categories.search_placeholder');
assert(en['categories.search_placeholder'] === 'Search categories...', 'EN placeholder is "Search categories..."');
assert(ar['categories.search_placeholder'] === 'البحث في الأقسام...', 'AR placeholder is "البحث في الأقسام..."');
assert(Object.keys(en).length === Object.keys(ar).length, `EN and AR key counts match exactly (${Object.keys(en).length})`);

// 3. Validate Constants
console.log('\n--- 3. Constants & NAV_ZONES ---');
const constantsCode = fs.readFileSync(path.resolve(__dirname, '../js/core/constants.js'), 'utf8');
const fakeWindow = {};
vm.runInNewContext(constantsCode, { window: fakeWindow });
const NAV_ZONES = fakeWindow.FreeIPTV.Constants.NAV_ZONES;

assert(NAV_ZONES.LIVE_CATEGORY_SEARCH === 'live_category_search', 'NAV_ZONES has LIVE_CATEGORY_SEARCH');
assert(NAV_ZONES.MOVIES_CATEGORY_SEARCH === 'movies_category_search', 'NAV_ZONES has MOVIES_CATEGORY_SEARCH');
assert(NAV_ZONES.SERIES_CATEGORY_SEARCH === 'series_category_search', 'NAV_ZONES has SERIES_CATEGORY_SEARCH');

// 4. Validate Movies & Series Category Quick Filtering in DOM Context
console.log('\n--- 4. Movies Category Quick Filtering Logic ---');

// Mock a lightweight DOM environment
function createMockElement(tagName, id, className) {
  const el = {
    tagName: (tagName || 'div').toUpperCase(),
    id: id || '',
    className: className || '',
    classList: {
      _classes: new Set((className || '').split(' ').filter(Boolean)),
      contains(c) { return this._classes.has(c); },
      add(c) { this._classes.add(c); el.className = Array.from(this._classes).join(' '); },
      remove(c) { this._classes.delete(c); el.className = Array.from(this._classes).join(' '); }
    },
    attributes: {},
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : null; },
    children: [],
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    },
    _listeners: {},
    addEventListener(event, fn) {
      this._listeners[event] = this._listeners[event] || [];
      this._listeners[event].push(fn);
    },
    dispatchEvent(event) {
      const list = this._listeners[event.type] || [];
      list.forEach(fn => fn(event));
    },
    textContent: '',
    value: '',
    style: {},
    closest(selector) {
      if (selector.startsWith('#') && this.id === selector.slice(1)) return this;
      if (selector.startsWith('.') && this.classList.contains(selector.slice(1))) return this;
      if (this.parentNode && this.parentNode.closest) return this.parentNode.closest(selector);
      return null;
    }
  };

  Object.defineProperty(el, 'innerHTML', {
    get() { return ''; },
    set(val) {
      if (val === '') {
        el.children = [];
      }
    }
  });

  return el;
}

const domElements = {};
function getElementById(id) {
  if (!domElements[id]) {
    domElements[id] = createMockElement('div', id);
  }
  return domElements[id];
}

const mockDoc = {
  getElementById,
  querySelector(sel) {
    if (sel.startsWith('#')) return getElementById(sel.slice(1));
    return null;
  },
  querySelectorAll(sel) {
    if (sel.includes('#movies-categories-list')) {
      return getElementById('movies-categories-list').children;
    }
    if (sel.includes('#series-categories-list')) {
      return getElementById('series-categories-list').children;
    }
    return [];
  },
  createElement(tag) {
    return createMockElement(tag);
  }
};

const mockSandbox = {
  window: {
    FreeIPTV: {
      Constants: fakeWindow.FreeIPTV.Constants,
      Logger: { info() {}, debug() {}, warn() {}, error() {} },
      Events: { on() {}, emit() {} },
      I18n: {
        t(k) { return k; }
      },
      PlaylistManager: {
        getActivePlaylist() { return { id: 'p1', name: 'Test' }; },
        loadMovies() { return Promise.resolve({ movies: [], categories: [] }); },
        loadSeries() { return Promise.resolve({ series: [], categories: [] }); }
      }
    }
  },
  document: mockDoc,
  console: console
};
mockSandbox.window.window = mockSandbox.window;

// Load movies.js into sandbox
const moviesCode = fs.readFileSync(path.resolve(__dirname, '../js/ui/movies.js'), 'utf8');
vm.runInNewContext(moviesCode, mockSandbox);
const Movies = mockSandbox.window.FreeIPTV.Movies;

assert(typeof Movies.setCategorySearchQuery === 'function', 'Movies has setCategorySearchQuery method');

// Test category filtering in Movies
const sampleMovieCategories = ['Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Documentary'];
Movies.renderCategories(sampleMovieCategories);

const moviesList = getElementById('movies-categories-list');
assert(moviesList.children.length === 10, `Initial Movies categories rendered (Recently Added + All Movies + Favorites + Continue Watching + 6 categories = 10 items, actual: ${moviesList.children.length})`);

// Filter by "act"
Movies.setCategorySearchQuery('act');
assert(moviesList.children.length === 1, `Filtered by "act": only 1 matching category rendered (actual: ${moviesList.children.length})`);
assert(moviesList.children[0].getAttribute('data-category') === 'Action', 'First matching category is "Action"');

// Filter by "do" -> should match Documentary
Movies.setCategorySearchQuery('do');
assert(moviesList.children.length === 1, `Filtered by "do": only 1 matching category rendered (actual: ${moviesList.children.length})`);
assert(moviesList.children[0].getAttribute('data-category') === 'Documentary', 'Matching category is "Documentary"');

// Clear search query
Movies.setCategorySearchQuery('');
assert(moviesList.children.length === 10, `Clearing category query restored all 10 items (actual: ${moviesList.children.length})`);

// 5. Validate Series Category Quick Filtering
console.log('\n--- 5. Series Category Quick Filtering Logic ---');
const seriesCode = fs.readFileSync(path.resolve(__dirname, '../js/ui/series.js'), 'utf8');
vm.runInNewContext(seriesCode, mockSandbox);
const Series = mockSandbox.window.FreeIPTV.Series;

assert(typeof Series.setCategorySearchQuery === 'function', 'Series has setCategorySearchQuery method');

const sampleSeriesCategories = ['Animation', 'Crime', 'Drama', 'Mystery', 'Sci-Fi & Fantasy'];
Series.renderCategories(sampleSeriesCategories);

const seriesList = getElementById('series-categories-list');
assert(seriesList.children.length === 9, `Initial Series categories rendered (Recently Added + All Series + Favorites + Continue Watching + 5 categories = 9 items, actual: ${seriesList.children.length})`);

// Filter by "crim"
Series.setCategorySearchQuery('crim');
assert(seriesList.children.length === 1, `Filtered by "crim": only 1 matching category rendered (actual: ${seriesList.children.length})`);
assert(seriesList.children[0].getAttribute('data-category') === 'Crime', 'Matching category is "Crime"');

// Filter by "sci"
Series.setCategorySearchQuery('sci');
assert(seriesList.children.length === 1, `Filtered by "sci": only 1 matching category rendered (actual: ${seriesList.children.length})`);
assert(seriesList.children[0].getAttribute('data-category') === 'Sci-Fi & Fantasy', 'Matching category is "Sci-Fi & Fantasy"');

// Clear series search query
Series.setCategorySearchQuery('');
assert(seriesList.children.length === 9, `Clearing series category query restored all 9 items (actual: ${seriesList.children.length})`);

// 6. Validate Navigation Zone Handlers
console.log('\n--- 6. Remote Navigation Zone Handlers ---');
const navCode = fs.readFileSync(path.resolve(__dirname, '../js/ui/navigation.js'), 'utf8');
vm.runInNewContext(navCode, mockSandbox);
const Navigation = mockSandbox.window.FreeIPTV.Navigation;

assert(typeof Navigation.handleMoviesCategorySearchNavigation === 'function', 'Navigation has handleMoviesCategorySearchNavigation');
assert(typeof Navigation.handleSeriesCategorySearchNavigation === 'function', 'Navigation has handleSeriesCategorySearchNavigation');

// Test zone detection
const moviesInput = getElementById('movies-category-search-input');
moviesInput.setAttribute('data-nav-zone', 'movies_category_search');
assert(Navigation.getElementZone(moviesInput) === 'movies_category_search', 'getElementZone returns "movies_category_search" for movies input');

const seriesInput = getElementById('series-category-search-input');
seriesInput.setAttribute('data-nav-zone', 'series_category_search');
assert(Navigation.getElementZone(seriesInput) === 'series_category_search', 'getElementZone returns "series_category_search" for series input');

console.log('\n============================================================');
console.log(`CATEGORY QUICK FILTER SUITE: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('============================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
