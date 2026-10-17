/**
 * FREE IPTV PLAYER — COVER PLACEHOLDER, CONTINUE WATCHING & IN-PLAYER EPISODES TEST SUITE
 *
 * Verifies:
 * 1. Movie & Series image cover placeholders remain visible while waiting for image load
 *    (including lazy data-src) and hide cleanly upon img.onload.
 * 2. Continue Watching in Movies, Series, and Home directly resumes the movie or latest
 *    watched episode from its saved watch point instead of opening details or starting at 0.
 * 3. In-Player Episodes button (#player-btn-episodes) and interactive Episodes/Seasons
 *    overlay (#player-episodes-overlay) with season switching, D-pad navigation, and episode playback.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log(' COVER PLACEHOLDER, CONTINUE WATCHING & PLAYER EPISODES SUITE');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}`);
    failed++;
  }
}

// Minimal DOM mock for UI & Player controllers
class MockElement {
  constructor(tag, id = '') {
    this.tagName = String(tag || 'DIV').toUpperCase();
    this.id = id;
    this.classList = {
      _set: new Set(),
      _syncFromClassName: (cn) => {
        this.classList._set = new Set(String(cn || '').split(/\s+/).filter(Boolean));
      },
      _syncToClassName: () => {
        this._rawClassName = Array.from(this.classList._set).join(' ');
      },
      add: (...cls) => {
        cls.forEach(c => { if (c) this.classList._set.add(c); });
        this.classList._syncToClassName();
      },
      remove: (...cls) => {
        cls.forEach(c => this.classList._set.delete(c));
        this.classList._syncToClassName();
      },
      contains: (c) => this.classList._set.has(c),
      toggle: (c, force) => {
        const shouldAdd = force !== undefined ? Boolean(force) : !this.classList._set.has(c);
        if (shouldAdd) this.classList._set.add(c);
        else this.classList._set.delete(c);
        this.classList._syncToClassName();
        return shouldAdd;
      }
    };
    this._rawClassName = '';
    this.attributes = {};
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.textContent = '';
    this._innerHTML = '';
    this._listeners = {};
    this.offsetParent = {};
    this.complete = false;
    this.naturalWidth = 0;
  }

  get className() {
    return this._rawClassName || '';
  }

  set className(val) {
    this._rawClassName = String(val || '');
    this.classList._syncFromClassName(this._rawClassName);
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(val) {
    this._innerHTML = String(val || '');
    if (val === '') {
      this.children = [];
    }
  }

  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'id') this.id = String(v);
    if (k === 'class') this.className = String(v);
  }

  getAttribute(k) {
    if (k === 'id') return this.id || null;
    if (k === 'class') return this.className || null;
    return this.attributes[k] !== undefined ? this.attributes[k] : null;
  }

  removeAttribute(k) {
    delete this.attributes[k];
  }

  appendChild(child) {
    if (!child) return child;
    if (child.tagName === 'DOCUMENT-FRAGMENT') {
      const list = child.children.slice();
      child.children = [];
      list.forEach(c => this.appendChild(c));
      return child;
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  addEventListener(evt, fn) {
    this._listeners[evt] = this._listeners[evt] || [];
    this._listeners[evt].push(fn);
  }

  dispatchEvent(e) {
    (this._listeners[e.type] || []).forEach(fn => fn.call(this, e));
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this, preventDefault: () => {}, stopPropagation: () => {} });
  }

  focus() {
    globalDoc.activeElement = this;
  }

  contains(node) {
    let cur = node;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentNode;
    }
    return false;
  }

  closest(sel) {
    let cur = this;
    while (cur) {
      if (matchesSingleSelector(cur, sel)) return cur;
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
    const groups = String(sel).split(',').map(s => s.trim()).filter(Boolean);
    const walk = (node) => {
      for (const g of groups) {
        if (matchesSelectorChain(node, g)) {
          results.push(node);
          break;
        }
      }
      (node.children || []).forEach(walk);
    };
    (this.children || []).forEach(walk);
    return results;
  }
}

function matchesSingleSelector(node, sel) {
  if (!node || !sel) return false;
  let s = sel.trim();

  // Check :not(...)
  const notMatches = s.match(/:not\(([^)]+)\)/g);
  if (notMatches) {
    for (const nm of notMatches) {
      const inner = nm.slice(5, -1);
      if (matchesSingleSelector(node, inner)) return false;
      s = s.replace(nm, '');
    }
  }

  // Check attribute selectors [attr="val"] or [attr]
  const attrMatches = s.match(/\[([^\]]+)\]/g);
  if (attrMatches) {
    for (const am of attrMatches) {
      const inner = am.slice(1, -1);
      if (inner.includes('=')) {
        const [k, rawV] = inner.split('=');
        const v = rawV.replace(/^["']|["']$/g, '');
        if (String(node.getAttribute(k.trim())) !== v) return false;
      } else {
        if (node.getAttribute(inner.trim()) === null) return false;
      }
      s = s.replace(am, '');
    }
  }

  // Check ID
  const idMatch = s.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    if (node.id !== idMatch[1]) return false;
    s = s.replace(idMatch[0], '');
  }

  // Check classes
  const classMatches = s.match(/\.([a-zA-Z0-9_-]+)/g);
  if (classMatches) {
    for (const cm of classMatches) {
      const cls = cm.slice(1);
      if (!node.classList || !node.classList.contains(cls)) return false;
      s = s.replace(cm, '');
    }
  }

  // Check tag name if remaining
  s = s.trim();
  if (s && s !== '*') {
    if (!node.tagName || node.tagName.toLowerCase() !== s.toLowerCase()) return false;
  }

  return true;
}

function matchesSelectorChain(node, chainStr) {
  const parts = chainStr.trim().split(/\s+/);
  if (!matchesSingleSelector(node, parts[parts.length - 1])) return false;
  let cur = node.parentNode;
  for (let i = parts.length - 2; i >= 0; i--) {
    while (cur && !matchesSingleSelector(cur, parts[i])) {
      cur = cur.parentNode;
    }
    if (!cur) return false;
    cur = cur.parentNode;
  }
  return true;
}

const globalDoc = {
  documentElement: new MockElement('html'),
  body: new MockElement('body'),
  activeElement: null,
  createElement: (tag) => new MockElement(tag),
  createDocumentFragment: () => new MockElement('document-fragment'),
  getElementById: function (id) {
    return this.body.querySelector('#' + id);
  },
  querySelector: function (sel) {
    return this.body.querySelector(sel);
  },
  querySelectorAll: function (sel) {
    return this.body.querySelectorAll(sel);
  },
  addEventListener: () => {},
  contains: function (node) {
    return this.body.contains(node);
  }
};
globalDoc.documentElement.appendChild(globalDoc.body);

const localStorageStore = {};
const mockLocalStorage = {
  getItem: (k) => (localStorageStore[k] !== undefined ? localStorageStore[k] : null),
  setItem: (k, v) => { localStorageStore[k] = String(v); },
  removeItem: (k) => { delete localStorageStore[k]; }
};

const mockWindow = {
  document: globalDoc,
  localStorage: mockLocalStorage,
  innerWidth: 1920,
  innerHeight: 1080,
  addEventListener: () => {},
  removeEventListener: () => {},
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: () => 1,
  clearInterval: () => {},
  console: console,
  Date: Date,
  Math: Math,
  Number: Number,
  String: String,
  Array: Array,
  Object: Object,
  JSON: JSON,
  Promise: Promise,
  FreeIPTV: {}
};

const ctx = vm.createContext(mockWindow);
ctx.window = mockWindow;
ctx.document = globalDoc;
ctx.localStorage = mockLocalStorage;

const scripts = [
  '../js/core/constants.js',
  '../js/core/logger.js',
  '../js/core/events.js',
  '../js/storage/storage.js',
  '../js/storage/channel-store.js',
  '../js/playlist/playlist-manager.js',
  '../js/player/avplay-engine.js',
  '../js/tv/remote.js',
  '../js/ui/navigation.js',
  '../js/ui/home.js',
  '../js/ui/player.js',
  '../js/ui/movies.js',
  '../js/ui/series.js'
];

for (const rel of scripts) {
  const code = fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
  vm.runInContext(code, ctx);
}

const { FreeIPTV } = mockWindow;

// Build required DOM containers
function setupDom() {
  const viewHome = new MockElement('div', 'view-home');
  viewHome.className = 'view-screen';
  const homeRecentSection = new MockElement('section', 'home-recent-section');
  const homeRecentGrid = new MockElement('div', 'home-recent-grid');
  homeRecentSection.appendChild(homeRecentGrid);
  viewHome.appendChild(homeRecentSection);
  globalDoc.body.appendChild(viewHome);

  const viewMovies = new MockElement('div', 'view-movies');
  viewMovies.className = 'view-screen hidden';
  const moviesSearchInput = new MockElement('input', 'movies-search-input');
  moviesSearchInput.className = 'live-search-input focusable';
  moviesSearchInput.setAttribute('data-nav-zone', 'movies_search');
  const moviesCats = new MockElement('div', 'movies-categories-list');
  const moviesGrid = new MockElement('div', 'movies-grid-container');
  viewMovies.appendChild(moviesSearchInput);
  viewMovies.appendChild(moviesCats);
  viewMovies.appendChild(moviesGrid);
  globalDoc.body.appendChild(viewMovies);

  const viewMovieDetails = new MockElement('div', 'view-movie_details');
  viewMovieDetails.className = 'view-screen hidden';
  const moviePosterImg = new MockElement('img', 'movie-details-poster');
  const moviePosterPlaceholder = new MockElement('div', 'movie-details-poster-placeholder');
  moviePosterPlaceholder.className = 'poster-fallback-icon cover-placeholder details-cover-placeholder';
  viewMovieDetails.appendChild(moviePosterImg);
  viewMovieDetails.appendChild(moviePosterPlaceholder);
  globalDoc.body.appendChild(viewMovieDetails);

  const viewSeries = new MockElement('div', 'view-series');
  viewSeries.className = 'view-screen hidden';
  const seriesSearchInput = new MockElement('input', 'series-search-input');
  seriesSearchInput.className = 'live-search-input focusable';
  seriesSearchInput.setAttribute('data-nav-zone', 'series_search');
  const seriesCats = new MockElement('div', 'series-categories-list');
  const seriesGrid = new MockElement('div', 'series-grid-container');
  viewSeries.appendChild(seriesSearchInput);
  viewSeries.appendChild(seriesCats);
  viewSeries.appendChild(seriesGrid);
  globalDoc.body.appendChild(viewSeries);

  const viewSeriesDetails = new MockElement('div', 'view-series_details');
  viewSeriesDetails.className = 'view-screen hidden';
  const seriesPosterImg = new MockElement('img', 'series-details-poster');
  const seriesPosterPlaceholder = new MockElement('div', 'series-details-poster-placeholder');
  seriesPosterPlaceholder.className = 'poster-fallback-icon cover-placeholder details-cover-placeholder';
  viewSeriesDetails.appendChild(seriesPosterImg);
  viewSeriesDetails.appendChild(seriesPosterPlaceholder);
  globalDoc.body.appendChild(viewSeriesDetails);

  // Player view & controls
  const viewPlayer = new MockElement('div', 'view-player');
  viewPlayer.className = 'view-screen player-screen hidden';
  const controlsOverlay = new MockElement('div', 'player-controls-overlay');
  controlsOverlay.className = 'player-overlay player-controls-overlay';
  const progressContainer = new MockElement('div', 'player-progress-container');
  const seekTrack = new MockElement('div', 'player-seek-bar-track');
  seekTrack.className = 'player-seek-bar-track focusable';
  progressContainer.appendChild(seekTrack);
  controlsOverlay.appendChild(progressContainer);

  const controlsRow = new MockElement('div', 'player-controls-row');
  controlsRow.className = 'player-controls-row';
  const btnPrev = new MockElement('button', 'player-btn-prev');
  btnPrev.className = 'player-ctrl-btn focusable';
  const btnRewind = new MockElement('button', 'player-btn-rewind');
  btnRewind.className = 'player-ctrl-btn focusable';
  const btnPlayPause = new MockElement('button', 'player-btn-play-pause');
  btnPlayPause.className = 'player-ctrl-btn focusable';
  const btnForward = new MockElement('button', 'player-btn-forward');
  btnForward.className = 'player-ctrl-btn focusable';
  const btnNext = new MockElement('button', 'player-btn-next');
  btnNext.className = 'player-ctrl-btn focusable';
  const btnEpisodes = new MockElement('button', 'player-btn-episodes');
  btnEpisodes.className = 'player-ctrl-btn player-btn-with-label focusable hidden';
  const btnBack = new MockElement('button', 'player-btn-back');
  btnBack.className = 'player-ctrl-btn focusable';

  controlsRow.appendChild(btnPrev);
  controlsRow.appendChild(btnRewind);
  controlsRow.appendChild(btnPlayPause);
  controlsRow.appendChild(btnForward);
  controlsRow.appendChild(btnNext);
  controlsRow.appendChild(btnEpisodes);
  controlsRow.appendChild(btnBack);
  controlsOverlay.appendChild(controlsRow);
  viewPlayer.appendChild(controlsOverlay);

  // In-player episodes overlay
  const epOverlay = new MockElement('div', 'player-episodes-overlay');
  epOverlay.className = 'player-episodes-overlay hidden';
  const epTitle = new MockElement('h3', 'player-episodes-series-title');
  const epClose = new MockElement('button', 'player-episodes-close');
  epClose.className = 'player-episodes-close-btn focusable';
  epClose.setAttribute('data-nav-zone', 'player_episodes_seasons');
  const epSeasons = new MockElement('div', 'player-episodes-seasons');
  epSeasons.className = 'player-episodes-seasons-bar';
  const epList = new MockElement('div', 'player-episodes-list');
  epList.className = 'player-episodes-list';

  epOverlay.appendChild(epTitle);
  epOverlay.appendChild(epClose);
  epOverlay.appendChild(epSeasons);
  epOverlay.appendChild(epList);
  viewPlayer.appendChild(epOverlay);

  const errOverlay = new MockElement('div', 'player-error-overlay');
  errOverlay.className = 'player-overlay hidden';
  viewPlayer.appendChild(errOverlay);

  globalDoc.body.appendChild(viewPlayer);
}

setupDom();
FreeIPTV.Navigation.init();
FreeIPTV.Player.init();

// =========================================================================
// 1. COVER PLACEHOLDER WHILE WAITING FOR IMAGE TO LOAD
// =========================================================================
console.log('--- 1. Movie & Series Cover Placeholder While Image Loads ---');

const sampleMovie = {
  id: 'mov_1',
  streamId: 'mov_1',
  name: 'Interstellar',
  posterUrl: 'http://example.com/interstellar.jpg',
  year: '2014'
};

// Direct src movie card (index < 15)
const movieCardEl = FreeIPTV.Movies.createMovieCard(sampleMovie, 0);
const movieImg = movieCardEl.querySelector('.movie-poster-img');
const moviePlaceholder = movieCardEl.querySelector('.cover-placeholder');

assert(movieImg !== null, 'Movie card renders .movie-poster-img');
assert(moviePlaceholder !== null, 'Movie card renders .cover-placeholder alongside image');
assert(moviePlaceholder.style.display === 'flex', 'Movie cover placeholder is visible (display: flex) while image is loading');
assert(movieImg.classList.contains('poster-img-loading'), 'Movie image starts with .poster-img-loading class');

// Simulate image onload completion
movieImg.onload();
assert(moviePlaceholder.style.display === 'none', 'Movie cover placeholder hides (display: none) once img.onload fires');
assert(movieImg.classList.contains('poster-img-loaded'), 'Movie image transitions to .poster-img-loaded once loaded');

// Lazy-loaded Series card (index >= 25 uses data-src)
const sampleSeries = {
  id: 'ser_10',
  seriesId: 'ser_10',
  name: 'Severance',
  posterUrl: 'http://example.com/severance.jpg'
};
const seriesCardEl = FreeIPTV.Series.createSeriesCard(sampleSeries, 30);
const seriesImg = seriesCardEl.querySelector('.series-poster-img');
const seriesPlaceholder = seriesCardEl.querySelector('.cover-placeholder');

assert(seriesImg.getAttribute('data-src') === 'http://example.com/severance.jpg', 'Lazy series card sets data-src');
assert(seriesPlaceholder !== null && seriesPlaceholder.style.display === 'flex', 'Lazy series card displays cover placeholder while waiting for data-src load');
seriesImg.onload();
assert(seriesPlaceholder.style.display === 'none', 'Lazy series card hides cover placeholder once image loads');

// Details view poster placeholder
FreeIPTV.Movies.populateDetailsUI(sampleMovie);
const detailsImg = globalDoc.getElementById('movie-details-poster');
const detailsPlaceholder = globalDoc.getElementById('movie-details-poster-placeholder');
assert(detailsPlaceholder.style.display === 'flex', 'Movie Details cover placeholder is visible while detail poster loads');
detailsImg.onload();
assert(detailsPlaceholder.style.display === 'none', 'Movie Details cover placeholder hides when detail poster finishes loading');

// =========================================================================
// 2. CONTINUE WATCHING DIRECT RESUME (MOVIES, SERIES, HOME)
// =========================================================================
console.log('\n--- 2. Continue Watching Direct Playback & Resume Position ---');

// Save playback progress for a movie (at 1250 seconds) and a series episode (S02E04 at 840 seconds)
FreeIPTV.PlaylistManager.savePlaybackProgress({
  contentType: 'movie',
  contentId: 'mov_1',
  title: 'Interstellar',
  poster: 'http://example.com/interstellar.jpg',
  streamUrl: 'http://example.com/movie/mov_1.mp4',
  positionSec: 1250,
  durationSec: 3600
});

FreeIPTV.PlaylistManager.savePlaybackProgress({
  contentType: 'episode',
  contentId: 'ep_204',
  seriesId: 'ser_10',
  seriesName: 'Severance',
  seasonNumber: 2,
  episodeNumber: 4,
  title: 'Severance - S02E04',
  subtitle: 'Woe\'s Hollow',
  poster: 'http://example.com/severance.jpg',
  streamUrl: 'http://example.com/series/ep_204.mp4',
  positionSec: 840,
  durationSec: 2700
});

// Verify that recordWatchHistory on stream start does NOT overwrite saved positionSeconds with 0
FreeIPTV.PlaylistManager.recordWatchHistory({
  contentType: 'movie',
  contentId: 'mov_1',
  title: 'Interstellar',
  poster: 'http://example.com/interstellar.jpg',
  streamUrl: 'http://example.com/movie/mov_1.mp4'
});

const cwItems = FreeIPTV.PlaylistManager.getContinueWatching(10);
const cwMovie = cwItems.find(x => String(x.contentId) === 'mov_1');
const cwEp = cwItems.find(x => String(x.contentId) === 'ep_204');

assert(cwMovie && cwMovie.positionSeconds === 1250, `Movie watch history preserved saved positionSeconds (${cwMovie && cwMovie.positionSeconds}s === 1250s)`);
assert(cwEp && cwEp.positionSeconds === 840 && cwEp.seasonNumber === 2 && cwEp.episodeNumber === 4, 'Episode watch history preserved saved positionSeconds (840s), seasonNumber (2), and episodeNumber (4)');

// Test A: Clicking Movie in Movies -> Continue Watching plays movie directly at 1250 * 1000 ms
let playedMovieCapture = null;
const origPlayMovie = FreeIPTV.Player.playMovie;
FreeIPTV.Player.playMovie = function (movie, startMs) {
  playedMovieCapture = { movie, startMs };
};

FreeIPTV.Movies.selectCategory('continue_watching');
const cwMovieCard = Object.assign({}, sampleMovie, {
  cwPositionSeconds: 1250,
  cwDurationSeconds: 3600,
  cwProgressPercent: 35
});
const renderedCwMovieCard = FreeIPTV.Movies.createMovieCard(cwMovieCard, 0);
assert(renderedCwMovieCard.querySelector('.poster-progress-track') !== null, 'Continue Watching movie card renders progress bar track');
renderedCwMovieCard.click();

assert(playedMovieCapture !== null, 'Clicking movie in Continue Watching directly invokes Player.playMovie (does NOT open details)');
assert(playedMovieCapture.startMs === 1250 * 1000, `Movie resumed at exact saved watch point (${playedMovieCapture.startMs}ms === 1250000ms)`);
FreeIPTV.Player.playMovie = origPlayMovie;

// Test B: Clicking Series in Series -> Continue Watching directly plays latest watched episode (S02E04 at 840 * 1000 ms)
const mockSeriesDetails = {
  seasons: [
    { seasonNumber: 1, name: 'Season 1', episodeCount: 2 },
    { seasonNumber: 2, name: 'Season 2', episodeCount: 4 }
  ],
  episodesBySeason: {
    '1': [
      { id: 'ep_101', episodeNumber: 1, seasonNumber: 1, name: 'Good News About Hell', streamUrl: 'http://example.com/series/ep_101.mp4' },
      { id: 'ep_102', episodeNumber: 2, seasonNumber: 1, name: 'Half Loop', streamUrl: 'http://example.com/series/ep_102.mp4' }
    ],
    '2': [
      { id: 'ep_201', episodeNumber: 1, seasonNumber: 2, name: 'Hello, Ms. Cobel', streamUrl: 'http://example.com/series/ep_201.mp4' },
      { id: 'ep_202', episodeNumber: 2, seasonNumber: 2, name: 'Goodbye, Mrs. Selvig', streamUrl: 'http://example.com/series/ep_202.mp4' },
      { id: 'ep_203', episodeNumber: 3, seasonNumber: 2, name: 'Who Is Alive?', streamUrl: 'http://example.com/series/ep_203.mp4' },
      { id: 'ep_204', episodeNumber: 4, seasonNumber: 2, name: 'Woe\'s Hollow', streamUrl: 'http://example.com/series/ep_204.mp4' }
    ]
  }
};

FreeIPTV.PlaylistManager.getSeriesDetails = function () {
  return {
    then: function (cb) {
      cb(mockSeriesDetails);
      return { catch: function () {} };
    }
  };
};

let playedEpisodeCapture = null;
const origPlayEpisode = FreeIPTV.Player.playEpisode;
FreeIPTV.Player.playEpisode = function (series, seasonNum, episode, startMs, queue) {
  playedEpisodeCapture = { series, seasonNum, episode, startMs, queue };
  return origPlayEpisode.call(FreeIPTV.Player, series, seasonNum, episode, startMs, queue);
};

FreeIPTV.Series.selectCategory('continue_watching');
const cwSeriesItem = Object.assign({}, sampleSeries, {
  cwLatestEpisode: cwEp,
  cwPositionSeconds: 840,
  cwDurationSeconds: 2700,
  cwProgressPercent: 31
});
const renderedCwSeriesCard = FreeIPTV.Series.createSeriesCard(cwSeriesItem, 0);
assert(renderedCwSeriesCard.querySelector('.poster-progress-track') !== null, 'Continue Watching series card renders progress bar track');
assert(renderedCwSeriesCard.querySelector('.series-card-sub').textContent === 'S02E04', 'Continue Watching series card displays latest watched S02E04 badge');

renderedCwSeriesCard.click();

assert(playedEpisodeCapture !== null, 'Clicking series in Continue Watching directly invokes Player.playEpisode (does NOT open series details)');
assert(String(playedEpisodeCapture.episode.id) === 'ep_204', 'Series Continue Watching launches latest watched episode ep_204');
assert(playedEpisodeCapture.seasonNum === 2, 'Series Continue Watching launches Season 2');
assert(playedEpisodeCapture.startMs === 840 * 1000, `Series Continue Watching resumes episode at saved watch point (${playedEpisodeCapture.startMs}ms === 840000ms)`);
assert(Array.isArray(playedEpisodeCapture.queue) && playedEpisodeCapture.queue.length === 4, 'Series Continue Watching populates full Season 2 episode queue (4 episodes)');

// =========================================================================
// 3. IN-PLAYER EPISODES BUTTON & SEASON/EPISODE SWITCHER OVERLAY
// =========================================================================
console.log('\n--- 3. In-Player Episodes Button & Season/Episode Switcher ---');

const btnEpisodes = globalDoc.getElementById('player-btn-episodes');
const epOverlay = globalDoc.getElementById('player-episodes-overlay');

assert(!btnEpisodes.classList.contains('hidden'), '#player-btn-episodes is visible when playing a series episode');
assert(epOverlay.classList.contains('hidden'), '#player-episodes-overlay starts hidden before clicking Episodes button');

// Verify index.html has icon-only #player-episodes-close without data-i18n text span
const indexHtmlContent = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const closeBtnMatch = indexHtmlContent.match(/<button id="player-episodes-close"[\s\S]*?<\/button>/);
assert(closeBtnMatch && !closeBtnMatch[0].includes('data-i18n=') && closeBtnMatch[0].includes('<svg'), '#player-episodes-close in index.html is an icon-only button without data-i18n text span');

// Mock I18n.t('series.season') returning 'Season {num}' to verify {num} placeholder interpolation
FreeIPTV.I18n = {
  t: function (key, params) {
    if (key === 'series.season') return 'Season {num}';
    if (key === 'player.now_playing') return 'Now Playing';
    return key;
  },
  isRTL: function () { return false; }
};

// Focus #player-btn-episodes and simulate document.activeElement staying on #player-btn-episodes
FreeIPTV.Navigation.focus(btnEpisodes);
globalDoc.activeElement = btnEpisodes;

// Trigger #player-btn-episodes via Navigation.triggerActive()
FreeIPTV.Navigation.triggerActive();
// Simulate browser keeping document.activeElement on btnEpisodes before move
globalDoc.activeElement = btnEpisodes;

assert(!epOverlay.classList.contains('hidden'), 'Clicking #player-btn-episodes opens #player-episodes-overlay');
assert(FreeIPTV.Player.isEpisodesModalOpen() === true, 'Player.isEpisodesModalOpen() returns true when overlay is open');
assert(globalDoc.getElementById('player-controls-overlay').classList.contains('hidden'), 'Opening #player-episodes-overlay hides #player-controls-overlay');

const seasonTabs = globalDoc.querySelectorAll('#player-episodes-seasons .player-season-tab');
assert(seasonTabs.length === 2, `In-player episodes overlay renders both Season 1 and Season 2 tabs (found ${seasonTabs.length})`);
assert(seasonTabs[0].textContent === 'Season 1 (2)', `Season 1 tab interpolates {num} cleanly as "Season 1 (2)" (got "${seasonTabs[0].textContent}")`);
assert(seasonTabs[1].classList.contains('active'), 'Season 2 tab is marked .active matching current episode S02E04');

let episodeItems = globalDoc.querySelectorAll('#player-episodes-list .player-episode-item');
assert(episodeItems.length === 4, `Season 2 episode list renders 4 episodes (found ${episodeItems.length})`);
assert(episodeItems[3].classList.contains('active') && episodeItems[3].classList.contains('playing'), 'Episode 4 (currently playing) is highlighted as .active.playing');
assert(episodeItems[3].querySelector('.player-episode-now-badge') !== null, 'Episode 4 displays "Now Playing" badge');

// Test D-pad navigation inside the episodes overlay even when globalDoc.activeElement was btnEpisodes:
// Currently focused on Episode 4 (index 3). Pressing UP 3 times reaches Episode 1 (index 0), and pressing UP once more reaches active Season 2 tab!
assert(FreeIPTV.Navigation.getCurrent() === episodeItems[3], 'Initial focus inside episodes overlay is placed on currently playing episode (E04)');
FreeIPTV.Navigation.move('up');
assert(FreeIPTV.Navigation.getCurrent() === episodeItems[2], 'D-pad UP moves focus to E03 (not stolen by #player-btn-episodes)');
FreeIPTV.Navigation.move('up');
assert(FreeIPTV.Navigation.getCurrent() === episodeItems[1], 'D-pad UP moves focus to E02');
FreeIPTV.Navigation.move('up');
assert(FreeIPTV.Navigation.getCurrent() === episodeItems[0], 'D-pad UP moves focus to E01');
FreeIPTV.Navigation.move('up');
assert(FreeIPTV.Navigation.getCurrent() === seasonTabs[1], 'D-pad UP from first episode moves focus to active Season 2 tab');

// Move LEFT to Season 1 tab and select it
FreeIPTV.Navigation.move('left');
assert(FreeIPTV.Navigation.getCurrent() === seasonTabs[0], 'D-pad LEFT moves focus from Season 2 tab to Season 1 tab');

seasonTabs[0].click();
episodeItems = globalDoc.querySelectorAll('#player-episodes-list .player-episode-item');
assert(episodeItems.length === 2, `Selecting Season 1 tab switches episode list to Season 1's 2 episodes (found ${episodeItems.length})`);
assert(episodeItems[0].getAttribute('data-episode-id') === 'ep_101', 'First episode in Season 1 list is ep_101');

// Move DOWN from Season 1 tab into the episode list and select Episode 2 (ep_102)
FreeIPTV.Navigation.move('down');
assert(FreeIPTV.Navigation.getCurrent() === episodeItems[0], 'D-pad DOWN from Season 1 tab focuses Season 1 Episode 1');
FreeIPTV.Navigation.move('down');
assert(FreeIPTV.Navigation.getCurrent() === episodeItems[1], 'D-pad DOWN focuses Season 1 Episode 2');

episodeItems[1].click();
assert(epOverlay.classList.contains('hidden'), 'Selecting an episode from the overlay closes #player-episodes-overlay');
assert(FreeIPTV.Player.getCurrentMedia().id === 'ep_102', 'Selecting Season 1 Episode 2 immediately starts playing ep_102');
assert(FreeIPTV.Player.getCurrentMedia().seasonNumber === 1 && FreeIPTV.Player.getCurrentMedia().episodeNumber === 2, 'Current media updated to S01E02');

// Verify #player-btn-episodes is hidden when playing a Movie
FreeIPTV.Player.playMovie(sampleMovie, 0);
assert(btnEpisodes.classList.contains('hidden'), '#player-btn-episodes is hidden when playing a Movie');
FreeIPTV.Player.closePlayer();

// =========================================================================
// 4. PRESSING UP FROM MOVIES & SERIES TOP GRID ROW FOCUSES SEARCH INPUT
// =========================================================================
console.log('\n--- 4. Movies & Series Grid UP Navigation to Search Input ---');

const viewMoviesEl = globalDoc.getElementById('view-movies');
const viewSeriesEl = globalDoc.getElementById('view-series');
const moviesGridEl = globalDoc.getElementById('movies-grid-container');
const seriesGridEl = globalDoc.getElementById('series-grid-container');
const moviesSearchEl = globalDoc.getElementById('movies-search-input');
const seriesSearchEl = globalDoc.getElementById('series-search-input');

// Populate top row of Movies grid (indices 0..4)
viewMoviesEl.classList.remove('hidden');
const mCard0 = FreeIPTV.Movies.createMovieCard({ id: 'm0', name: 'Movie 0' }, 0);
const mCard4 = FreeIPTV.Movies.createMovieCard({ id: 'm4', name: 'Movie 4' }, 4);
moviesGridEl.appendChild(mCard0);
moviesGridEl.appendChild(mCard4);

FreeIPTV.Navigation.focus(mCard4);
assert(FreeIPTV.Navigation.getCurrent() === mCard4, 'Focused top-row movie card (index 4)');
FreeIPTV.Navigation.move('up');
assert(FreeIPTV.Navigation.getCurrent() === moviesSearchEl, 'Pressing UP from top row of Movies grid focuses #movies-search-input');
FreeIPTV.Navigation.move('down');
assert(FreeIPTV.Navigation.getCurrent() === mCard4, 'Pressing DOWN from #movies-search-input returns focus to last focused movie card');
viewMoviesEl.classList.add('hidden');

// Populate top row of Series grid (indices 0..4)
viewSeriesEl.classList.remove('hidden');
const sCard0 = FreeIPTV.Series.createSeriesCard({ id: 's0', name: 'Series 0' }, 0);
const sCard4 = FreeIPTV.Series.createSeriesCard({ id: 's4', name: 'Series 4' }, 4);
seriesGridEl.appendChild(sCard0);
seriesGridEl.appendChild(sCard4);

FreeIPTV.Navigation.focus(sCard4);
assert(FreeIPTV.Navigation.getCurrent() === sCard4, 'Focused top-row series card (index 4)');
FreeIPTV.Navigation.move('up');
assert(FreeIPTV.Navigation.getCurrent() === seriesSearchEl, 'Pressing UP from top row of Series grid focuses #series-search-input');
FreeIPTV.Navigation.move('down');
assert(FreeIPTV.Navigation.getCurrent() === sCard4, 'Pressing DOWN from #series-search-input returns focus to last focused series card');

console.log('\n================================================================');
console.log(` SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
