/**
 * FREE IPTV PLAYER — PHASE 6.4 VALIDATION SUITE
 * 
 * Verifies:
 * 1. AVPlay Native Hardware Display Plane & Transparency
 * 2. Dedicated Player Mode Lifecycle (enterPlayerMode / exitPlayerMode)
 * 3. Movie & Series Details Focus Isolation, Navigation Zones & Route Synchronization
 * 4. Official Free IPTV Player Logo & Branding Integration
 * 5. High-Visibility TV Focus Contrast
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('====================================================');
console.log(' FREE IPTV PLAYER — PHASE 6.4 VALIDATION SUITE');
console.log('====================================================');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
    failedTests++;
  }
}

// ------------------------------------------------------------
// 1. BRAND ASSET & LOGO INTEGRATION INTEGRITY
// ------------------------------------------------------------
console.log('\n--- 1. Official Logo Asset & Branding Integration ---');

const logoPath = path.resolve(__dirname, '..', 'assets/images/logo.png');
assert(fs.existsSync(logoPath), 'Official logo asset exists: assets/images/logo.png');
if (fs.existsSync(logoPath)) {
  const stats = fs.statSync(logoPath);
  assert(stats.size > 1000, `Official logo is valid non-empty image (${stats.size} bytes)`);
}

const htmlContent = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

// Splash screen
assert(htmlContent.includes('id="app-splash-screen"'), 'index.html contains #app-splash-screen');
assert(htmlContent.includes('class="splash-logo"') && htmlContent.includes('src="assets/images/logo.png"'), 'Splash screen embeds official logo assets/images/logo.png');
assert(htmlContent.includes('class="splash-title"') && htmlContent.includes('Free IPTV Player'), 'Splash screen includes application title');

// Header branding
assert(htmlContent.includes('class="brand-logo-img"') && htmlContent.includes('src="assets/images/logo.png"'), 'Header embeds official logo assets/images/logo.png');
assert(htmlContent.includes('class="brand-title"') && htmlContent.includes('Free IPTV Player'), 'Header includes Free IPTV Player title');
assert(!htmlContent.includes('<span class="brand-badge">PLAYER</span>'), 'Generic [PLAYER] badge completely removed from header');

// Header logo accessibility
assert(htmlContent.includes('class="brand-logo-img" alt=""') || htmlContent.includes('aria-hidden="true"'), 'Header logo marked non-interactive / decorative');

// Onboarding card branding
assert(htmlContent.includes('class="onboarding-logo-img"') && htmlContent.includes('src="assets/images/logo.png"'), 'Onboarding / empty-playlist view embeds official logo');

// CSS rules for logo and RTL preservation
const layoutCss = fs.readFileSync(path.resolve(__dirname, '..', 'css/layout.css'), 'utf8');
assert(layoutCss.includes('.app-splash-screen'), 'layout.css defines .app-splash-screen styling');
assert(layoutCss.includes('.brand-logo-img'), 'layout.css defines .brand-logo-img styling');
assert(layoutCss.includes('transform: none !important'), 'layout.css prevents logo mirroring in Arabic RTL');

// ------------------------------------------------------------
// 2. AVPLAY NATIVE HARDWARE DISPLAY PLANE & TRANSPARENCY
// ------------------------------------------------------------
console.log('\n--- 2. AVPlay Native Display Plane & Transparency ---');

// CSS Transparency when player-active
assert(layoutCss.includes('html.player-active,') && layoutCss.includes('body.player-active'), 'layout.css targets html.player-active and body.player-active');
assert(layoutCss.includes('body.player-active .app-root') && layoutCss.includes('background: transparent !important'), 'body.player-active makes .app-root completely transparent');
assert(layoutCss.includes('body.player-active .app-header,') && layoutCss.includes('display: none !important'), 'body.player-active completely hides .app-header and background views');

// ------------------------------------------------------------
// 3. JAVASCRIPT LIFECYCLE & DETAILS FOCUS TESTS
// ------------------------------------------------------------
console.log('\n--- 3. Player Lifecycle & Details Context Isolation ---');

// Simple DOM Mock
class MockElement {
  constructor(tag, id = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.className = '';
    this.classList = {
      _classes: new Set(),
      add: (...cls) => cls.forEach(c => this.classList._classes.add(c)),
      remove: (...cls) => cls.forEach(c => this.classList._classes.delete(c)),
      contains: (c) => this.classList._classes.has(c),
      toggle: (c, val) => {
        if (val !== undefined) {
          if (val) this.classList._classes.add(c);
          else this.classList._classes.delete(c);
        } else {
          if (this.classList._classes.has(c)) this.classList._classes.delete(c);
          else this.classList._classes.add(c);
        }
      }
    };
    this.attributes = {};
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.textContent = '';
    this.innerHTML = '';
    this._listeners = {};
    this.offsetParent = {};
  }
  contains(node) {
    let cur = node;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentNode;
    }
    return false;
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : null; }
  removeAttribute(k) { delete this.attributes[k]; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  addEventListener(evt, fn) { this._listeners[evt] = this._listeners[evt] || []; this._listeners[evt].push(fn); }
  dispatchEvent(e) { (this._listeners[e.type] || []).forEach(fn => fn.call(this, e)); }
  click() { this.dispatchEvent({ type: 'click', target: this }); }
  focus() {
    if (globalMockDoc.activeElement && globalMockDoc.activeElement !== this) {
      globalMockDoc.activeElement.dispatchEvent({ type: 'blur', target: globalMockDoc.activeElement });
    }
    globalMockDoc.activeElement = this;
    this.dispatchEvent({ type: 'focus', target: this });
  }
  closest(sel) {
    let cur = this;
    while (cur) {
      if (sel.startsWith('#') && cur.id === sel.slice(1)) return cur;
      if (sel.startsWith('.') && cur.classList.contains(sel.slice(1))) return cur;
      cur = cur.parentNode;
    }
    return null;
  }
  querySelector(sel) {
    const all = this.querySelectorAll(sel);
    return all.length > 0 ? all[0] : null;
  }
  querySelectorAll(sel) {
    const results = [];
    const check = (node) => {
      let match = false;
      if (sel.startsWith('#') && node.id === sel.slice(1)) match = true;
      else if (sel.startsWith('.') && node.classList.contains(sel.slice(1))) match = true;
      else if (sel.includes('[tabindex="-1"]') && node.getAttribute('tabindex') === '-1') match = true;
      else if (sel.includes('[data-route-target') && node.getAttribute('data-route-target')) match = true;
      else if (node.tagName && node.tagName.toLowerCase() === sel.toLowerCase()) match = true;
      
      // Class checks
      if (sel.includes('.focusable') && node.classList.contains('focusable')) {
        if (!sel.includes(':not([tabindex="-1"])') || node.getAttribute('tabindex') !== '-1') {
          match = true;
        }
      }
      if (match) results.push(node);
      node.children.forEach(check);
    };
    this.children.forEach(check);
    return results;
  }
}

const globalMockDoc = {
  documentElement: new MockElement('html'),
  body: new MockElement('body'),
  activeElement: null,
  getElementById: function(id) {
    return this.body.querySelector('#' + id) || (this.documentElement.id === id ? this.documentElement : null);
  },
  querySelector: function(sel) {
    return this.body.querySelector(sel);
  },
  querySelectorAll: function(sel) {
    return this.body.querySelectorAll(sel);
  },
  addEventListener: function(evt, fn) {},
  contains: function(node) {
    let cur = node;
    while (cur) {
      if (cur === this.body || cur === this.documentElement) return true;
      cur = cur.parentNode;
    }
    return false;
  }
};
globalMockDoc.documentElement.appendChild(globalMockDoc.body);

const mockWindow = {
  document: globalMockDoc,
  innerWidth: 1920,
  innerHeight: 1080,
  addEventListener: () => {},
  removeEventListener: () => {},
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  console: console,
  Date: Date,
  FreeIPTV: {}
};

const context = vm.createContext(mockWindow);
context.window = mockWindow;
context.document = globalMockDoc;

// Load Core Scripts
const scripts = [
  '../js/core/constants.js',
  '../js/core/logger.js',
  '../js/core/events.js',
  '../js/storage/storage.js',
  '../js/player/avplay-engine.js',
  '../js/ui/navigation.js',
  '../js/ui/home.js',
  '../js/ui/player.js',
  '../js/ui/movies.js',
  '../js/ui/series.js'
];

for (const s of scripts) {
  const code = fs.readFileSync(path.resolve(__dirname, s), 'utf8');
  vm.runInContext(code, context);
}

const { FreeIPTV } = mockWindow;

// Build mock DOM structure
const splashEl = new MockElement('div', 'app-splash-screen');
globalMockDoc.body.appendChild(splashEl);

const viewHome = new MockElement('div', 'view-home');
viewHome.classList.add('view-screen');
const homeBtn = new MockElement('button', 'home-quick-live');
homeBtn.classList.add('focusable');
viewHome.appendChild(homeBtn);
globalMockDoc.body.appendChild(viewHome);

const viewMovies = new MockElement('div', 'view-movies');
viewMovies.classList.add('view-screen', 'hidden');
const movieCard = new MockElement('button', 'movie-card-1');
movieCard.classList.add('focusable', 'movie-card');
viewMovies.appendChild(movieCard);
globalMockDoc.body.appendChild(viewMovies);

const viewMovieDetails = new MockElement('div', 'view-movie_details');
viewMovieDetails.classList.add('view-screen', 'hidden');
const btnMoviePlay = new MockElement('button', 'btn-movie-play');
btnMoviePlay.classList.add('focusable');
const btnMovieBack = new MockElement('button', 'btn-movie-page-back');
btnMovieBack.classList.add('focusable');
viewMovieDetails.appendChild(btnMovieBack);
viewMovieDetails.appendChild(btnMoviePlay);
globalMockDoc.body.appendChild(viewMovieDetails);

const viewSeries = new MockElement('div', 'view-series');
viewSeries.classList.add('view-screen', 'hidden');
const seriesCard = new MockElement('button', 'series-card-1');
seriesCard.classList.add('focusable', 'series-card');
viewSeries.appendChild(seriesCard);
globalMockDoc.body.appendChild(viewSeries);

const viewSeriesDetails = new MockElement('div', 'view-series_details');
viewSeriesDetails.classList.add('view-screen', 'hidden');
const btnSeasonSelect = new MockElement('button', 'btn-season-selector');
btnSeasonSelect.classList.add('focusable', 'season-select-btn');
const btnSeriesBack = new MockElement('button', 'btn-series-page-back');
btnSeriesBack.classList.add('focusable');
viewSeriesDetails.appendChild(btnSeriesBack);
viewSeriesDetails.appendChild(btnSeasonSelect);
globalMockDoc.body.appendChild(viewSeriesDetails);

const viewPlayer = new MockElement('div', 'view-player');
viewPlayer.classList.add('view-screen', 'hidden');
const btnPlayerPlay = new MockElement('button', 'player-btn-play-pause');
btnPlayerPlay.classList.add('focusable');
viewPlayer.appendChild(btnPlayerPlay);
globalMockDoc.body.appendChild(viewPlayer);

// Initialize subsystems
FreeIPTV.Navigation.init();
FreeIPTV.Player.init();

// Test 1: switchView audits focusables and updates tabindex
FreeIPTV.Home.switchView('movies');
assert(!viewMovies.classList.contains('hidden'), 'Home.switchView("movies") displays view-movies');
assert(viewHome.classList.contains('hidden'), 'view-home is hidden');
assert(movieCard.getAttribute('tabindex') === '0', 'Active view elements have tabindex="0"');
assert(homeBtn.getAttribute('tabindex') === '-1', 'Inactive view elements have tabindex="-1"');
assert(FreeIPTV.Navigation.getCurrentRoute() === 'movies', 'Navigation route synchronized to "movies"');

// Test 2: Movie Details Context Entry & Focus
FreeIPTV.Navigation.focus(movieCard);
assert(FreeIPTV.Navigation.getCurrent() === movieCard, 'Focus set on movie card');

FreeIPTV.Movies.openMovieDetails({ id: 101, name: 'Inception' }, 'movies');
assert(!viewMovieDetails.classList.contains('hidden'), 'openMovieDetails opens view-movie_details');
assert(viewMovies.classList.contains('hidden'), 'Previous movies grid view is hidden');
assert(movieCard.getAttribute('tabindex') === '-1', 'Movies grid cards disabled with tabindex="-1"');
assert(FreeIPTV.Navigation.getCurrent() === btnMoviePlay, 'Initial focus explicitly placed on Details Play button');
assert(FreeIPTV.Navigation.getElementZone(FreeIPTV.Navigation.getCurrent()) === 'movie_details', 'Element zone is movie_details');

// Test 3: Movie Details Back Navigation restores route & focus
FreeIPTV.Movies.closeMovieDetails();
assert(viewMovieDetails.classList.contains('hidden'), 'MovieDetails closed and hidden');
assert(!viewMovies.classList.contains('hidden'), 'Movies grid view restored');
assert(FreeIPTV.Navigation.getCurrent() === movieCard, 'Previous focused movie card restored');

// Test 4: Series Details Context Entry & Initial Focus on Season Selector
FreeIPTV.Home.switchView('series');
FreeIPTV.Navigation.focus(seriesCard);
FreeIPTV.Series.openSeriesDetails({ id: 202, name: 'Breaking Bad' }, 'series');
assert(!viewSeriesDetails.classList.contains('hidden'), 'openSeriesDetails opens view-series_details');
assert(viewSeries.classList.contains('hidden'), 'Previous series grid view is hidden');
assert(seriesCard.getAttribute('tabindex') === '-1', 'Series grid cards disabled with tabindex="-1"');
assert(FreeIPTV.Navigation.getCurrent() === btnSeasonSelect, 'Initial focus placed on Season Selector');
assert(FreeIPTV.Navigation.getElementZone(FreeIPTV.Navigation.getCurrent()) === 'series_details', 'Element zone is series_details');

FreeIPTV.Series.closeSeriesDetails();
assert(viewSeriesDetails.classList.contains('hidden'), 'SeriesDetails closed and hidden');
assert(!viewSeries.classList.contains('hidden'), 'Series grid view restored');
assert(FreeIPTV.Navigation.getCurrent() === seriesCard, 'Previous focused series card restored');

// Test 5: Dedicated Player Mode Lifecycle
let displayAreaCalls = 0;
let displayMethodCalls = 0;
FreeIPTV.AVPlayEngine.setDisplayArea = function(x, y, w, h) {
  displayAreaCalls++;
  assert(x === 0 && y === 0 && w === 1920 && h === 1080, `setDisplayArea called with full-screen bounds (${x},${y},${w},${h})`);
};
FreeIPTV.AVPlayEngine.setDisplayMethod = function(method) {
  displayMethodCalls++;
  assert(method === 'FULL', `setDisplayMethod called with 'FULL'`);
};

FreeIPTV.Navigation.setCurrentRoute('movies');
FreeIPTV.Navigation.focus(movieCard);

FreeIPTV.Player.enterPlayerMode({ type: 'movie', id: 101, title: 'Inception' });
assert(globalMockDoc.documentElement.classList.contains('player-active'), 'enterPlayerMode adds player-active to documentElement');
assert(globalMockDoc.body.classList.contains('player-active'), 'enterPlayerMode adds player-active to body');
assert(displayAreaCalls > 0, 'AVPlay display area configured on player enter');
assert(displayMethodCalls > 0, 'AVPlay display method configured on player enter');

FreeIPTV.Player.exitPlayerMode();
assert(!globalMockDoc.documentElement.classList.contains('player-active'), 'exitPlayerMode removes player-active from documentElement');
assert(!globalMockDoc.body.classList.contains('player-active'), 'exitPlayerMode removes player-active from body');
assert(FreeIPTV.Navigation.getCurrentRoute() === 'movies', 'exitPlayerMode restores origin route');
assert(FreeIPTV.Navigation.getCurrent() === movieCard, 'exitPlayerMode restores focus to previous card');

// ------------------------------------------------------------
// 4. HIGH-CONTRAST FOCUS STYLES
// ------------------------------------------------------------
console.log('\n--- 4. Navigation & High-Contrast TV Focus Styles ---');

const navCss = fs.readFileSync(path.resolve(__dirname, '..', 'css/navigation.css'), 'utf8');
assert(navCss.includes('.btn-page-back.focused'), 'navigation.css contains high-visibility focus for .btn-page-back');
assert(navCss.includes('.season-select-btn.focused'), 'navigation.css contains high-visibility focus for .season-select-btn');
assert(navCss.includes('.season-dropdown-item.focused'), 'navigation.css contains high-visibility focus for .season-dropdown-item');
assert(navCss.includes('.episode-card.focused') || navCss.includes('.series-episode-card.focused'), 'navigation.css contains focus for episode cards');

console.log('\n====================================================');
console.log(` PHASE 6.4 VALIDATION: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('====================================================');

if (failedTests > 0) {
  process.exit(1);
}
