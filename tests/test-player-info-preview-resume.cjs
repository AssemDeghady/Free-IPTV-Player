const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('====================================================');
console.log(' TEST: PLAYER INFO BTN, RESUME BUTTONS & PREVIEW HLS');
console.log('====================================================');

// 1. Static HTML & CSS Validation
console.log('\n--- 1. Static HTML & CSS Verification ---');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(indexHtml.includes('id="player-btn-info"'), 'index.html contains #player-btn-info');
assert.ok(indexHtml.includes('data-i18n="player.info"'), 'index.html contains data-i18n="player.info"');

const epgCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'live-epg.css'), 'utf8');
assert.ok(epgCss.includes('.live-preview-video'), 'live-epg.css includes .live-preview-video class selector');
assert.ok(epgCss.includes('z-index: 5;'), 'live-epg.css styles preview video above placeholder (z-index: 5)');
assert.ok(epgCss.includes('.live-preview-placeholder'), 'live-epg.css includes .live-preview-placeholder');

// 2. Translations Verification
console.log('\n--- 2. i18n Dictionary Verification ---');
const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n', 'en.json'), 'utf8'));
const ar = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n', 'ar.json'), 'utf8'));
assert.strictEqual(en['player.info'], 'Info', 'en.json has player.info');
assert.strictEqual(ar['player.info'], 'معلومات', 'ar.json has player.info');

// 3. Mock DOM & Engine for Dynamic Logic
console.log('\n--- 3. Player Info Button & Remote Control ---');

class MockClassList {
  constructor() {
    this._set = new Set();
  }
  add(cls) { this._set.add(cls); }
  remove(cls) { this._set.delete(cls); }
  contains(cls) { return this._set.has(cls); }
  toggle(cls, force) {
    if (force !== undefined) {
      if (force) this.add(cls); else this.remove(cls);
      return force;
    }
    if (this._set.has(cls)) { this.remove(cls); return false; }
    this.add(cls); return true;
  }
  toString() { return Array.from(this._set).join(' '); }
}

class MockElement {
  constructor(tag, id, classes) {
    this.tagName = (tag || 'div').toUpperCase();
    this.id = id || '';
    this.classList = new MockClassList();
    if (classes) {
      classes.split(/\s+/).forEach(c => c && this.classList.add(c));
    }
    this.style = {};
    this.children = [];
    this._textContent = '';
    this._innerHTML = '';
    this._attributes = {};
    this._listeners = {};
    this.offsetParent = {};
  }
  setAttribute(name, val) { this._attributes[name] = String(val); }
  getAttribute(name) { return this._attributes[name] || null; }
  removeAttribute(name) { delete this._attributes[name]; }
  addEventListener(evt, fn) {
    if (!this._listeners[evt]) this._listeners[evt] = [];
    this._listeners[evt].push(fn);
  }
  removeEventListener(evt, fn) {
    if (!this._listeners[evt]) return;
    this._listeners[evt] = this._listeners[evt].filter(f => f !== fn);
  }
  dispatchEvent(evt) {
    const list = this._listeners[evt.type] || [];
    for (let i = 0; i < list.length; i++) list[i](evt);
  }
  click() { this.dispatchEvent({ type: 'click', stopPropagation: () => {} }); }
  querySelector(sel) {
    if (sel.startsWith('#')) {
      const targetId = sel.slice(1).split(/[:\.]/)[0];
      const findChild = (el) => {
        if (el.id === targetId) return el;
        for (let c of el.children) {
          const res = findChild(c);
          if (res) return res;
        }
        return null;
      };
      return findChild(this);
    }
    return this.children[0] || null;
  }
  querySelectorAll() { return this.children; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 320, height: 180 }; }
  set textContent(v) { this._textContent = v; }
  get textContent() {
    if (this.children.length > 0) {
      return this.children.map(c => c.textContent).join('') || this._textContent;
    }
    return this._textContent;
  }
  set innerHTML(v) { this._innerHTML = v; }
  get innerHTML() { return this._innerHTML; }
}

const elements = {};
function register(el) {
  if (el.id) elements[el.id] = el;
  return el;
}

const mockDoc = {
  documentElement: new MockElement('html', 'html'),
  body: new MockElement('body', 'body'),
  getElementById(id) { return elements[id] || null; },
  querySelector(sel) {
    if (sel.startsWith('#')) return elements[sel.slice(1).split(/[:\.]/)[0]] || null;
    return null;
  },
  querySelectorAll() { return []; },
  createElement(tag) { return new MockElement(tag); },
  addEventListener: () => {},
  removeEventListener: () => {}
};

global.document = mockDoc;
global.window = {
  document: mockDoc,
  FreeIPTV: {},
  addEventListener: () => {},
  removeEventListener: () => {}
};

// Setup DOM elements needed by player
register(new MockElement('div', 'player-progress-container', 'hidden'));
register(new MockElement('button', 'player-btn-prev'));
register(new MockElement('button', 'player-btn-next'));
register(new MockElement('button', 'player-btn-rewind', 'hidden'));
register(new MockElement('button', 'player-btn-forward', 'hidden'));
register(new MockElement('button', 'player-btn-episodes', 'hidden'));
const btnInfo = register(new MockElement('button', 'player-btn-info', 'hidden'));
register(new MockElement('button', 'player-btn-play-pause'));
register(new MockElement('button', 'player-btn-audio'));
register(new MockElement('button', 'player-btn-sub'));
register(new MockElement('button', 'player-btn-back'));
register(new MockElement('div', 'player-error-overlay', 'hidden'));
register(new MockElement('div', 'view-player', 'hidden'));
register(new MockElement('span', 'player-title'));
register(new MockElement('span', 'player-subtitle'));
register(new MockElement('div', 'player-controls-overlay'));

// Setup elements for Movies and Series details
const btnMovieResume = register(new MockElement('button', 'btn-movie-resume', 'hidden'));
btnMovieResume.children.push(new MockElement('span', 'movie-resume-span'));
const btnMoviePlay = register(new MockElement('button', 'btn-movie-play'));
register(new MockElement('button', 'btn-movie-fav'));
register(new MockElement('button', 'btn-movie-page-back'));
register(new MockElement('div', 'view-movie_details', 'hidden'));

const btnSeriesResume = register(new MockElement('button', 'btn-series-resume', 'hidden'));
btnSeriesResume.children.push(new MockElement('span', 'series-resume-span'));
const btnSeasonSelector = register(new MockElement('button', 'btn-season-selector'));
register(new MockElement('button', 'btn-series-fav'));
register(new MockElement('button', 'btn-series-page-back'));
register(new MockElement('div', 'view-series_details', 'hidden'));

// Setup elements for Live TV preview
register(new MockElement('div', 'live-preview-window'));
const previewVid = register(new MockElement('video', 'live-preview-video', 'hidden'));
previewVid.play = () => Promise.resolve();
previewVid.pause = () => {};
previewVid.load = () => {};
register(new MockElement('div', 'live-preview-status'));
register(new MockElement('div', 'live-preview-spinner', 'hidden'));
const epgContent = register(new MockElement('div', 'live-epg-content'));
const epgHeader = register(new MockElement('div', 'live-epg-header', 'hidden'));

// Load Constants, Logger, Events
window.FreeIPTV.Constants = {
  KEYS: {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    RETURN_TIZEN: 10009, ESCAPE: 27, BACKSPACE: 8,
    PLAY: 415, PAUSE: 19, PLAY_PAUSE: 10252, STOP: 413,
    FAST_FORWARD: 417, REWIND: 412, INFO: 457
  },
  EVENTS: { PLAYER_STATE_CHANGED: 'player:state_changed' },
  NAV_ZONES: {}
};

window.FreeIPTV.Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
};

window.FreeIPTV.I18n = {
  t: (k) => en[k] || k
};

window.FreeIPTV.Storage = {
  get: () => ({}),
  set: () => {}
};

let openedMovieDetails = null;
window.FreeIPTV.Movies = {
  openMovieDetails: (m) => { openedMovieDetails = m; },
  updateResumeButton: () => {}
};

let openedSeriesDetails = null;
window.FreeIPTV.Series = {
  openSeriesDetails: (s) => { openedSeriesDetails = s; },
  updateResumeButton: () => {}
};

window.FreeIPTV.PlaylistManager = {
  getActivePlaylistId: () => 'pl_test',
  getActivePlaylist: () => ({ id: 'pl_test', server: 'http://test.com', username: 'u', password: 'p' }),
  getPlaybackProgress: () => null,
  getContinueWatching: () => [],
  getWatchHistory: () => [],
  savePlaybackProgress: () => {},
  loadChannelEpg: () => Promise.resolve([])
};

window.FreeIPTV.AVPlayEngine = {
  open: () => Promise.resolve(),
  prepareAsync: () => Promise.resolve(),
  play: () => Promise.resolve(),
  pause: () => {},
  stop: () => {},
  close: () => {},
  getCurrentTime: () => 0,
  getDuration: () => 0,
  startPreview: () => Promise.resolve(),
  stopPreview: () => {}
};

window.FreeIPTV.Navigation = {
  focus: () => {},
  getCurrent: () => null,
  getCurrentRoute: () => 'home'
};

window.FreeIPTV.Remote = {
  pushBackHandler: () => {},
  popBackHandler: () => {}
};

// Load UI player
delete require.cache[require.resolve('../js/ui/player.js')];
require('../js/ui/player.js');
const Player = window.FreeIPTV.Player;
Player.init();

// Test configureControlsForMediaType
Player.configureControlsForMediaType('live');
assert.ok(!btnInfo.classList.contains('hidden'), 'player-btn-info is visible for live media');

Player.configureControlsForMediaType('movie');
assert.ok(!btnInfo.classList.contains('hidden'), 'player-btn-info is visible for movie media');

Player.configureControlsForMediaType('episode');
assert.ok(!btnInfo.classList.contains('hidden'), 'player-btn-info is visible for episode media');

// Test clicking player-btn-info during movie playback
openedMovieDetails = null;
Player.playMovie({ id: 101, name: 'Inception', streamUrl: 'http://test.com/movie.mp4' }, 0);
assert.ok(Player.isActive(), 'Player is active during movie');
btnInfo.click();
assert.ok(!Player.isActive(), 'Player is closed after clicking Info');
assert.ok(openedMovieDetails !== null && openedMovieDetails.name === 'Inception', 'Movie details view was opened for Inception');

// Test clicking player-btn-info during episode playback
openedSeriesDetails = null;
Player.playEpisode({ id: 's1', name: 'Severance' }, 1, { id: 'ep1', name: 'Good News' }, 0, []);
btnInfo.click();
assert.ok(openedSeriesDetails !== null && openedSeriesDetails.name === 'Severance', 'Series details view was opened for Severance');

console.log('[PASS] Player info button visibility & navigation to details working correctly');

// 4. Remote INFO key shortcut test
console.log('\n--- 4. Remote INFO Key Shortcut ---');
delete require.cache[require.resolve('../js/tv/remote.js')];
require('../js/tv/remote.js');
const Remote = window.FreeIPTV.Remote;

openedMovieDetails = null;
Player.playMovie({ id: 202, name: 'Interstellar' }, 0);
let prevented = false;
Remote.handleKeyDown({
  keyCode: 457, // INFO key
  preventDefault: () => { prevented = true; },
  stopPropagation: () => {}
});
assert.ok(prevented, 'Remote INFO key prevented default');
assert.ok(openedMovieDetails !== null && openedMovieDetails.name === 'Interstellar', 'Remote INFO opened Interstellar details');

// Test keyboard 'i' (73)
openedMovieDetails = null;
Player.playMovie({ id: 303, name: 'Dune' }, 0);
Remote.handleKeyDown({
  keyCode: 73, // 'i'
  preventDefault: () => {},
  stopPropagation: () => {}
});
assert.ok(openedMovieDetails !== null && openedMovieDetails.name === 'Dune', 'Keyboard "i" key opened Dune details');

console.log('[PASS] Remote INFO (457) and key "i" (73) successfully open details page');

// 5. Movies and Series Resume Button Dynamism
console.log('\n--- 5. Movies & Series updateResumeButton Dynamism ---');
delete require.cache[require.resolve('../js/ui/movies.js')];
require('../js/ui/movies.js');
const Movies = window.FreeIPTV.Movies;
Movies.init();

// Mock continuation progress
let mockMovieProgress = null;
window.FreeIPTV.PlaylistManager.getPlaybackProgress = () => mockMovieProgress;

// 0 seconds -> hidden
mockMovieProgress = { positionSeconds: 0, durationSeconds: 6000 };
Movies.updateResumeButton({ id: 999, name: 'Movie Zero' });
assert.ok(btnMovieResume.classList.contains('hidden'), 'Resume button hidden for 0 seconds progress');

// 4 seconds (< 5s threshold) -> hidden
mockMovieProgress = { positionSeconds: 4, durationSeconds: 6000 };
Movies.updateResumeButton({ id: 999, name: 'Movie Low' });
assert.ok(btnMovieResume.classList.contains('hidden'), 'Resume button hidden for < 5 seconds progress');

// 120 seconds (>= 5s) -> visible with Resume from 2:00
mockMovieProgress = { positionSeconds: 120, durationSeconds: 6000 };
Movies.updateResumeButton({ id: 999, name: 'Movie Resumed' });
assert.ok(!btnMovieResume.classList.contains('hidden'), 'Resume button visible for 120 seconds progress');
assert.ok(btnMovieResume.textContent.includes('2:00'), 'Resume button text contains formatted time 2:00');

// Test Series updateResumeButton
delete require.cache[require.resolve('../js/ui/series.js')];
require('../js/ui/series.js');
const Series = window.FreeIPTV.Series;
Series.init();

let mockSeriesCw = null;
window.FreeIPTV.PlaylistManager.getContinueWatching = () => mockSeriesCw;

// No CW -> hidden
mockSeriesCw = [];
Series.updateResumeButton({ id: 'ser_1', name: 'Empty Series' });
assert.ok(btnSeriesResume.classList.contains('hidden'), 'Series resume button hidden when no continue watching');

// CW with 600s on S02E03 -> visible with RESUME S02E03
mockSeriesCw = [{
  contentType: 'episode',
  seriesId: 'ser_1',
  seasonNumber: 2,
  episodeNumber: 3,
  positionSeconds: 600,
  durationSeconds: 3000
}];
Series.updateResumeButton({ id: 'ser_1', name: 'Test Series' });
assert.ok(!btnSeriesResume.classList.contains('hidden'), 'Series resume button visible when continuation exists');
assert.ok(btnSeriesResume.textContent.includes('S02E03'), 'Series resume button text contains S02E03');

console.log('[PASS] Movies and Series updateResumeButton correctly handles threshold & visibility');

// 6. Live TV Preview Player & EPG Cleaner
console.log('\n--- 6. Live TV Preview HLS & EPG Cleaner ---');
delete require.cache[require.resolve('../js/ui/live-tv.js')];
require('../js/ui/live-tv.js');
const LiveTV = window.FreeIPTV.LiveTV;
LiveTV.init();

// Mock Hls
let hlsCreated = false;
let hlsDestroyed = false;
let hlsAttachedVid = null;
let hlsSource = null;

class MockHls {
  constructor() {
    hlsCreated = true;
  }
  loadSource(src) { hlsSource = src; }
  attachMedia(v) { hlsAttachedVid = v; }
  on() {}
  destroy() { hlsDestroyed = true; }
}
MockHls.isSupported = () => true;
MockHls.Events = { MANIFEST_PARSED: 'manifest_parsed', ERROR: 'error' };
global.window.Hls = MockHls;

// Test LiveTV.setupPreviewVideo with m3u8
LiveTV.setupPreviewVideo(previewVid, 'http://test.com/stream.m3u8');
assert.ok(hlsCreated, 'Hls.js instance was instantiated for .m3u8 preview stream');
assert.strictEqual(hlsSource, 'http://test.com/stream.m3u8', 'Hls.js loaded the preview stream URL');
assert.strictEqual(hlsAttachedVid, previewVid, 'Hls.js attached the preview video element');

// Test LiveTV.stopChannelPreview cleans up Hls
LiveTV.stopChannelPreview();
assert.ok(hlsDestroyed, 'LiveTV.stopChannelPreview destroyed the Hls instance');

// Test LiveTV.renderChannelEpg does NOT produce "EPG Unavailable" on empty or error
const ch = { id: 'c1', name: 'BBC One', streamUrl: 'http://stream.m3u8' };
window.FreeIPTV.PlaylistManager.loadChannelEpg = () => Promise.resolve([]);
LiveTV.renderChannelEpg(ch);

// Verify after resolution
setImmediate(() => {
  assert.ok(!epgContent.innerHTML.includes('EPG Unavailable'), 'EPG Unavailable message is NOT in DOM on empty EPG');
  assert.ok(!epgContent.innerHTML.includes('live-epg-empty-notice'), 'live-epg-empty-notice is NOT in DOM');
  assert.ok(epgContent.innerHTML.includes('BBC One'), 'Channel header remains cleanly visible');

  // Test placeholder
  LiveTV.renderEpgPlaceholder();
  assert.strictEqual(epgContent.innerHTML, '', 'renderEpgPlaceholder leaves pane completely clean');

  console.log('[PASS] Live TV preview Hls and EPG cleaner verified successfully');
  console.log('\n====================================================');
  console.log(' ALL TESTS PASSED (100%)');
  console.log('====================================================');
});
