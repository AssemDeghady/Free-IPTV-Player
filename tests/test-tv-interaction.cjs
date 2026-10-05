/**
 * Free IPTV Player — TV Interaction & Playback Validation Suite (Phase 3.9)
 * Tests complete end-to-end user workflows:
 * - App Launch & Bootstrapping
 * - TV Remote Navigation (Spatial Movement, Enter, Back, Zones)
 * - Home View UI & Action Buttons
 * - Settings, Language Switching & Arabic/RTL Support
 * - Add Playlist Modal (Validation, States, Cancel, Submit)
 * - M3U Parsing & Category / Channel Data Pipeline
 * - Live TV Channel Browser (Categories, Search, Favorites, Scrolling)
 * - AVPlay Media Playback (Open, SetDisplayArea, PrepareAsync, Play, Stop)
 * - Channel Zapping & Rapid Switching (Safe Teardown, Stale Callbacks)
 * - Player OSD Auto-Hide & Remote Controls
 * - Playback Error Handling (Retries, Max Retry Limit, Fatal Overlay)
 * - App Lifecycle & Clean State Restoration
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

console.log('\n--- Running Real TV Interaction & Playback Validation (Phase 3.9) ---');

// Lightweight DOM Mock for 10-foot TV Environment
function createDOMEnvironment() {
  const listeners = {};
  const elements = {};

  class MockClassList {
    constructor(el) {
      this._el = el;
      this._classes = new Set();
    }
    add(...cls) { cls.forEach(c => this._classes.add(c)); }
    remove(...cls) { cls.forEach(c => this._classes.delete(c)); }
    contains(c) { return this._classes.has(c); }
    toggle(c, force) {
      if (typeof force === 'boolean') {
        if (force) this.add(c); else this.remove(c);
        return force;
      }
      if (this.contains(c)) { this.remove(c); return false; }
      this.add(c); return true;
    }
    get length() { return this._classes.size; }
    toString() { return Array.from(this._classes).join(' '); }
  }

  class MockElement {
    constructor(tagName, id = '') {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.classList = new MockClassList(this);
      this.children = [];
      this.parentNode = null;
      this.attributes = {};
      this.style = {};
      this.textContent = '';
      this._eventListeners = {};
      this.value = '';
      this._innerHTML = '';
      if (id) elements[id] = this;
    }

    get innerHTML() {
      return this._innerHTML || '';
    }

    set innerHTML(val) {
      this._innerHTML = val;
      if (val === '') {
        this.children = [];
      }
    }

    get className() {
      return this.classList.toString();
    }

    set className(val) {
      this.classList._classes.clear();
      String(val).split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
    }

    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'id') { this.id = value; elements[value] = this; }
      if (name === 'class') {
        value.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
      }
    }

    getAttribute(name) {
      return this.attributes[name] !== undefined ? this.attributes[name] : null;
    }

    removeAttribute(name) {
      delete this.attributes[name];
    }

    appendChild(child) {
      if (!child) return;
      child.parentNode = this;
      this.children.push(child);
      return child;
    }

    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }

    addEventListener(event, handler) {
      this._eventListeners[event] = this._eventListeners[event] || [];
      this._eventListeners[event].push(handler);
    }

    removeEventListener(event, handler) {
      if (!this._eventListeners[event]) return;
      this._eventListeners[event] = this._eventListeners[event].filter(h => h !== handler);
    }

    dispatchEvent(evt) {
      const handlers = this._eventListeners[evt.type] || [];
      handlers.forEach(h => h.call(this, evt));
      return !evt.defaultPrevented;
    }

    click() {
      const evt = { type: 'click', target: this, currentTarget: this, defaultPrevented: false, preventDefault: () => { evt.defaultPrevented = true; } };
      this.dispatchEvent(evt);
    }

    focus() {
      if (mockDocument._activeElement && mockDocument._activeElement !== this) {
        mockDocument._activeElement.dispatchEvent({ type: 'blur', target: mockDocument._activeElement });
      }
      mockDocument._activeElement = this;
      this.dispatchEvent({ type: 'focus', target: this });
    }

    blur() {
      if (mockDocument._activeElement === this) {
        mockDocument._activeElement = null;
      }
      this.dispatchEvent({ type: 'blur', target: this });
    }

    contains(node) {
      let cur = node;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentNode;
      }
      return false;
    }

    closest(selector) {
      let current = this;
      while (current) {
        if (matchesSingleSelector(current, selector)) {
          return current;
        }
        current = current.parentNode;
      }
      return null;
    }

    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    }

    querySelectorAll(sel) {
      const parts = sel.trim().split(/\s+/);
      if (parts.length === 1) {
        const matches = [];
        function traverse(node) {
          for (const child of node.children) {
            if (matchesSingleSelector(child, parts[0])) {
              matches.push(child);
            }
            traverse(child);
          }
        }
        traverse(this);
        return matches;
      }

      // Handle two-part descendant selector (parent child)
      const parentSel = parts[0];
      const childSel = parts.slice(1).join(' ');
      const matchingParents = this.querySelectorAll(parentSel);
      const allMatches = [];
      matchingParents.forEach(p => {
        const children = p.querySelectorAll(childSel);
        children.forEach(c => {
          if (!allMatches.includes(c)) allMatches.push(c);
        });
      });
      return allMatches;
    }

    getBoundingClientRect() {
      return { top: 0, left: 0, width: 100, height: 40, bottom: 40, right: 100 };
    }

    get offsetParent() {
      let cur = this;
      while (cur) {
        if (cur.classList && cur.classList.contains('hidden')) return null;
        cur = cur.parentNode;
      }
      return this.parentNode || mockDocument.body;
    }

    scrollIntoView() {}
    scrollIntoViewIfNeeded() {}
  }

  function matchesSingleSelector(el, sel) {
    if (!el || !el.tagName) return false;
    // Strip :not(...) for simple matching
    const clean = sel.replace(/:not\([^)]+\)/g, '');
    if (!clean) return true;
    if (clean.startsWith('#')) return el.id === clean.slice(1);
    if (clean.startsWith('.')) return el.classList.contains(clean.slice(1));
    if (clean.startsWith('[') && clean.endsWith(']')) {
      const [attr, val] = clean.slice(1, -1).split('=');
      const cleanVal = val ? val.replace(/['"]/g, '') : null;
      return cleanVal ? el.getAttribute(attr) === cleanVal : el.getAttribute(attr) !== null;
    }
    return el.tagName.toLowerCase() === clean.toLowerCase();
  }

  const mockDocument = {
    _activeElement: null,
    documentElement: new MockElement('HTML'),
    body: new MockElement('BODY'),
    getElementById: (id) => elements[id] || null,
    querySelector: (sel) => mockDocument.body.querySelector(sel),
    querySelectorAll: (sel) => mockDocument.body.querySelectorAll(sel),
    createElement: (tag) => new MockElement(tag),
    addEventListener: (evt, h) => { listeners[evt] = listeners[evt] || []; listeners[evt].push(h); },
    dispatchEvent: (evt) => { (listeners[evt.type] || []).forEach(h => h(evt)); },
    contains: (node) => {
      let cur = node;
      while (cur) {
        if (cur === mockDocument.body) return true;
        cur = cur.parentNode;
      }
      return false;
    }
  };

  mockDocument.documentElement.appendChild(mockDocument.body);

  // Parse static index.html structure to populate elements
  function buildStaticUI() {
    mockDocument.body.contains = function (node) { return mockDocument.contains(node); };

    // Top Bar
    const btnSearch = new MockElement('button', 'btn-header-search');
    btnSearch.classList.add('focusable');
    mockDocument.body.appendChild(btnSearch);

    const btnSettings = new MockElement('button', 'btn-header-settings');
    btnSettings.classList.add('focusable');
    mockDocument.body.appendChild(btnSettings);

    // Sidebar
    const sidebar = new MockElement('div', 'app-sidebar');
    sidebar.classList.add('app-sidebar');
    const routes = ['home', 'live_tv', 'movies', 'series', 'favorites', 'settings'];
    routes.forEach((r, idx) => {
      const link = new MockElement('button', `nav-link-${r}`);
      link.classList.add('nav-link', 'focusable');
      link.setAttribute('data-route', r);
      link.setAttribute('data-nav-zone', 'sidebar');
      if (idx === 0) {
        link.classList.add('active');
        link.setAttribute('data-initial-focus', 'true');
      }
      sidebar.appendChild(link);
    });
    mockDocument.body.appendChild(sidebar);

    // Views
    const viewHome = new MockElement('div', 'view-home');
    viewHome.classList.add('view-screen');
    const btnAddPl = new MockElement('button', 'btn-add-playlist');
    btnAddPl.classList.add('focusable', 'btn-primary');
    btnAddPl.setAttribute('data-nav-zone', 'home_actions');
    viewHome.appendChild(btnAddPl);
    mockDocument.body.appendChild(viewHome);

    const viewLive = new MockElement('div', 'view-live_tv');
    viewLive.classList.add('view-screen', 'hidden');
    const badge = new MockElement('span', 'live-tv-playlist-badge');
    const countLabel = new MockElement('span', 'live-channel-count-label');
    const searchInput = new MockElement('input', 'live-search-input');
    searchInput.classList.add('focusable');
    searchInput.setAttribute('data-nav-zone', 'live_search');
    const catList = new MockElement('div', 'live-categories-list');
    const chanList = new MockElement('div', 'live-channels-container');
    viewLive.appendChild(badge);
    viewLive.appendChild(countLabel);
    viewLive.appendChild(searchInput);
    viewLive.appendChild(catList);
    viewLive.appendChild(chanList);
    mockDocument.body.appendChild(viewLive);

    const viewSettings = new MockElement('div', 'view-settings');
    viewSettings.classList.add('view-screen', 'hidden');
    const btnAddFromSettings = new MockElement('button', 'settings-btn-add-playlist');
    btnAddFromSettings.classList.add('focusable');
    btnAddFromSettings.setAttribute('data-nav-zone', 'settings_actions');
    const btnLangEn = new MockElement('button', 'btn-lang-en');
    btnLangEn.classList.add('focusable');
    btnLangEn.setAttribute('data-nav-zone', 'settings_language');
    const btnLangAr = new MockElement('button', 'btn-lang-ar');
    btnLangAr.classList.add('focusable');
    btnLangAr.setAttribute('data-nav-zone', 'settings_language');
    const plContainer = new MockElement('div', 'settings-playlists-container');
    viewSettings.appendChild(btnAddFromSettings);
    viewSettings.appendChild(btnLangEn);
    viewSettings.appendChild(btnLangAr);
    viewSettings.appendChild(plContainer);
    mockDocument.body.appendChild(viewSettings);

    // Modal
    const modalOverlay = new MockElement('div', 'modal-overlay');
    modalOverlay.classList.add('modal-backdrop', 'hidden');
    const formState = new MockElement('div', 'modal-state-form');
    const loadState = new MockElement('div', 'modal-state-loading');
    loadState.classList.add('hidden');
    const errState = new MockElement('div', 'modal-state-error');
    errState.classList.add('hidden');
    const errMsg = new MockElement('p', 'modal-error-message');
    const nameInput = new MockElement('input', 'input-playlist-name');
    nameInput.classList.add('focusable');
    nameInput.setAttribute('data-nav-zone', 'modal');
    const urlInput = new MockElement('input', 'input-playlist-url');
    urlInput.classList.add('focusable');
    urlInput.setAttribute('data-nav-zone', 'modal');
    const btnCancel = new MockElement('button', 'modal-btn-cancel');
    btnCancel.classList.add('focusable');
    btnCancel.setAttribute('data-nav-zone', 'modal');
    const btnSubmit = new MockElement('button', 'modal-btn-submit');
    btnSubmit.classList.add('focusable');
    btnSubmit.setAttribute('data-nav-zone', 'modal');
    const btnRetry = new MockElement('button', 'modal-btn-retry');
    btnRetry.classList.add('focusable');
    btnRetry.setAttribute('data-nav-zone', 'modal');
    const btnErrCancel = new MockElement('button', 'modal-btn-error-cancel');
    btnErrCancel.classList.add('focusable');
    btnErrCancel.setAttribute('data-nav-zone', 'modal');

    formState.appendChild(nameInput);
    formState.appendChild(urlInput);
    formState.appendChild(btnCancel);
    formState.appendChild(btnSubmit);
    errState.appendChild(errMsg);
    errState.appendChild(btnRetry);
    errState.appendChild(btnErrCancel);

    modalOverlay.appendChild(formState);
    modalOverlay.appendChild(loadState);
    modalOverlay.appendChild(errState);
    mockDocument.body.appendChild(modalOverlay);

    // Player View
    const viewPlayer = new MockElement('div', 'view-player');
    viewPlayer.classList.add('view-player', 'hidden');
    const controlsOverlay = new MockElement('div', 'player-controls-overlay');
    const errorOverlay = new MockElement('div', 'player-error-overlay');
    errorOverlay.classList.add('hidden');
    const bufferOverlay = new MockElement('div', 'player-buffering-overlay');
    bufferOverlay.classList.add('hidden');
    const devNotice = new MockElement('div', 'player-dev-notice');
    devNotice.classList.add('hidden');

    const chTitle = new MockElement('h2', 'player-channel-name');
    const chGroup = new MockElement('span', 'player-channel-category');
    const chNumber = new MockElement('span', 'player-channel-number');
    const btnPlayPause = new MockElement('button', 'player-btn-play-pause');
    btnPlayPause.classList.add('focusable');
    btnPlayPause.setAttribute('data-nav-zone', 'player_controls');
    const btnPrev = new MockElement('button', 'player-btn-prev');
    btnPrev.classList.add('focusable');
    btnPrev.setAttribute('data-nav-zone', 'player_controls');
    const btnNext = new MockElement('button', 'player-btn-next');
    btnNext.classList.add('focusable');
    const btnBack = new MockElement('button', 'player-btn-back');
    btnBack.classList.add('focusable');
    btnBack.setAttribute('data-nav-zone', 'player_controls');

    const errRetry = new MockElement('button', 'player-error-retry');
    errRetry.classList.add('focusable');
    errRetry.setAttribute('data-nav-zone', 'player_error');
    const errPrev = new MockElement('button', 'player-error-prev');
    errPrev.classList.add('focusable');
    errPrev.setAttribute('data-nav-zone', 'player_error');
    const errNext = new MockElement('button', 'player-error-next');
    errNext.classList.add('focusable');
    errNext.setAttribute('data-nav-zone', 'player_error');

    controlsOverlay.appendChild(chTitle);
    controlsOverlay.appendChild(chGroup);
    controlsOverlay.appendChild(chNumber);
    controlsOverlay.appendChild(btnPrev);
    controlsOverlay.appendChild(btnPlayPause);
    controlsOverlay.appendChild(btnNext);
    controlsOverlay.appendChild(btnBack);

    errorOverlay.appendChild(errRetry);
    errorOverlay.appendChild(errPrev);
    errorOverlay.appendChild(errNext);

    viewPlayer.appendChild(controlsOverlay);
    viewPlayer.appendChild(errorOverlay);
    viewPlayer.appendChild(bufferOverlay);
    viewPlayer.appendChild(devNotice);
    mockDocument.body.appendChild(viewPlayer);
  }

  buildStaticUI();

  return {
    document: mockDocument,
    window: {
      document: mockDocument,
      innerWidth: 1920,
      innerHeight: 1080,
      addEventListener: (evt, h) => { listeners[evt] = listeners[evt] || []; listeners[evt].push(h); },
      removeEventListener: (evt, h) => { if (listeners[evt]) listeners[evt] = listeners[evt].filter(l => l !== h); },
      dispatchEvent: (evt) => { (listeners[evt.type] || []).forEach(h => h(evt)); },
      localStorage: {
        _data: {},
        getItem(k) { return this._data[k] || null; },
        setItem(k, v) { this._data[k] = String(v); },
        removeItem(k) { delete this._data[k]; },
        clear() { this._data = {}; }
      },
      console: console,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      Promise: Promise,
      Date: Date,
      Math: Math,
      FreeIPTV: {}
    }
  };
}

// Mock Samsung Native AVPlay Implementation
function createMockAVPlay() {
  let state = 'NONE';
  let currentUrl = null;
  let displayRect = null;
  let displayMethod = null;
  let listener = null;
  let stopCalls = 0;
  let closeCalls = 0;

  return {
    getState: () => state,
    open: (url) => {
      currentUrl = url;
      state = 'IDLE';
    },
    setDisplayRect: (x, y, w, h) => {
      displayRect = { x, y, width: w, height: h };
    },
    setDisplayMethod: (method) => {
      displayMethod = method;
    },
    setListener: (l) => {
      listener = l;
    },
    prepareAsync: function (successCb, errorCb) {
      state = 'PREPARING';
      setTimeout(() => {
        state = 'READY';
        if (successCb) successCb();
      }, 10);
    },
    play: function () {
      if (state !== 'READY' && state !== 'PAUSED' && state !== 'PLAYING') {
        throw new Error('WebAPIException: INVALID_STATE_ERR');
      }
      state = 'PLAYING';
    },
    pause: function () {
      if (state !== 'PLAYING') {
        throw new Error('WebAPIException: INVALID_STATE_ERR');
      }
      state = 'PAUSED';
    },
    stop: function () {
      if (state !== 'READY' && state !== 'PLAYING' && state !== 'PAUSED') {
        throw new Error('WebAPIException: INVALID_STATE_ERR');
      }
      stopCalls++;
      state = 'IDLE';
    },
    close: function () {
      if (state === 'PLAYING' || state === 'PAUSED' || state === 'READY') {
        throw new Error('WebAPIException: INVALID_STATE_ERR - close without stop');
      }
      closeCalls++;
      state = 'NONE';
      currentUrl = null;
    },
    _triggerListener(evt, data) {
      if (listener && typeof listener[evt] === 'function') {
        listener[evt](data);
      }
    },
    _getStats() {
      return { state, currentUrl, displayRect, displayMethod, stopCalls, closeCalls };
    }
  };
}

async function runInteractionValidation() {
  const env = createDOMEnvironment();
  const mockAvplay = createMockAVPlay();

  env.window.webapis = { avplay: mockAvplay };
  env.window.tizen = {
    tvinputdevice: {
      registerKey: (key) => {}
    },
    application: {
      getCurrentApplication: () => ({ exit: () => {} })
    }
  };

  const context = vm.createContext(env.window);
  context.window = env.window;
  context.document = env.document;

  // Load all production scripts in exact sequence as index.html
  const scriptsToLoad = [
    '../js/core/constants.js',
    '../js/core/logger.js',
    '../js/core/events.js',
    '../js/core/http.js',
    '../js/storage/storage.js',
    '../js/storage/channel-store.js',
    '../js/playlist/m3u-parser.js',
    '../js/playlist/playlist-manager.js',
    '../js/player/avplay-engine.js',
    '../js/i18n/i18n.js',
    '../js/tv/remote.js',
    '../js/ui/navigation.js',
    '../js/ui/modal.js',
    '../js/ui/home.js',
    '../js/ui/live-tv.js',
    '../js/ui/settings.js',
    '../js/ui/player.js',
    '../js/app.js'
  ];

  for (const scriptFile of scriptsToLoad) {
    const code = fs.readFileSync(path.resolve(__dirname, scriptFile), 'utf8');
    vm.runInContext(code, context);
  }

  const FreeIPTV = env.window.FreeIPTV;

  // Re-bind UI controllers with full selector capabilities
  FreeIPTV.Home.init();
  FreeIPTV.LiveTV.init();
  FreeIPTV.Settings.init();
  FreeIPTV.Modal.init();
  FreeIPTV.Player.init();
  FreeIPTV.Navigation.init();
  FreeIPTV.Remote.init();

  // ============================================================
  // TASK 1 & 3: APP BOOTSTRAP & HOME SCREEN VALIDATION
  // ============================================================
  console.log('\n--- Task 1 & 3: App Bootstrap & Home Screen ---');
  // App.init() is already called on load by app.js

  assert(FreeIPTV.Navigation.getCurrent() !== null, 'Initial focus set upon application launch');
  const initialFocused = FreeIPTV.Navigation.getCurrent();
  assert(initialFocused.classList.contains('focused'), 'Focused element contains .focused class');
  assert(initialFocused.classList.contains('nav-link'), 'Initial focus rests on primary navigation sidebar');

  const viewHome = env.document.getElementById('view-home');
  assert(!viewHome.classList.contains('hidden'), 'Home screen (#view-home) is initially visible');

  const addPlBtn = env.document.getElementById('btn-add-playlist');
  assert(addPlBtn !== null, 'Home CTA button (#btn-add-playlist) exists');

  // ============================================================
  // TASK 2: REMOTE NAVIGATION SIMULATION
  // ============================================================
  console.log('\n--- Task 2: Remote Navigation System ---');

  // Test Down navigation along sidebar
  const navLinkHome = env.document.getElementById('nav-link-home');
  const navLinkLive = env.document.getElementById('nav-link-live_tv');

  FreeIPTV.Navigation.focus(navLinkHome);
  assert(FreeIPTV.Navigation.getCurrent() === navLinkHome, 'Focus on Home nav link');

  // Simulate DOWN key (keyCode 40)
  const movedDown = FreeIPTV.Navigation.move('down');
  assert(movedDown === true && FreeIPTV.Navigation.getCurrent() === navLinkLive, 'DOWN key moved focus to Live TV nav link');

  // Simulate UP key (keyCode 38)
  const movedUp = FreeIPTV.Navigation.move('up');
  assert(movedUp === true && FreeIPTV.Navigation.getCurrent() === navLinkHome, 'UP key returned focus to Home nav link');

  // Simulate ENTER key (keyCode 13) on Home action button
  FreeIPTV.Navigation.focus(addPlBtn);
  assert(FreeIPTV.Navigation.getCurrent() === addPlBtn, 'Focus moved to Add Playlist CTA button');

  // ============================================================
  // TASK 5: ADD PLAYLIST MODAL FLOW
  // ============================================================
  console.log('\n--- Task 5: Add Playlist Modal Flow ---');
  addPlBtn.click(); // Trigger modal open

  const modalOverlay = env.document.getElementById('modal-overlay');
  assert(!modalOverlay.classList.contains('hidden'), 'Add Playlist modal opened and visible');

  const inputUrl = env.document.getElementById('input-playlist-url');
  assert(inputUrl !== null, 'Modal URL input field exists');

  // Xtream is the default tab; switch to M3U for the URL validation check
  FreeIPTV.Modal.switchTab('m3u');
  // Submit with empty URL -> should show error state
  FreeIPTV.Modal.submit();
  const modalErrState = env.document.getElementById('modal-state-error');
  assert(!modalErrState.classList.contains('hidden'), 'Empty URL rejected with error state');
  const modalErrMsg = env.document.getElementById('modal-error-message');
  assert(modalErrMsg.textContent.includes('valid playlist URL'), 'Error message instructs user to enter valid URL');

  // Return to form state via error cancel
  const btnErrCancel = env.document.getElementById('modal-btn-error-cancel');
  btnErrCancel.click();
  const modalFormState = env.document.getElementById('modal-state-form');
  assert(!modalFormState.classList.contains('hidden'), 'Returned to form state from error state');

  // Close modal via Back key (keyCode 10009 / Return)
  FreeIPTV.Remote.handleBack();
  assert(modalOverlay.classList.contains('hidden'), 'Back key (10009) successfully closed modal');
  assert(FreeIPTV.Navigation.getCurrent() === addPlBtn, 'Focus restored to previous CTA button after modal close');

  // ============================================================
  // TASK 4: SETTINGS & ARABIC/RTL VALIDATION
  // ============================================================
  console.log('\n--- Task 4: Settings & Language/RTL ---');
  const navLinkSettings = env.document.getElementById('nav-link-settings');
  navLinkSettings.click(); // Navigate to Settings

  const viewSettings = env.document.getElementById('view-settings');
  assert(!viewSettings.classList.contains('hidden'), 'Navigated to Settings view (#view-settings)');
  assert(viewHome.classList.contains('hidden'), 'Home screen hidden when in Settings');

  // Test Arabic language toggle
  const btnLangAr = env.document.getElementById('btn-lang-ar');
  btnLangAr.click();
  assert(FreeIPTV.I18n.getLanguage() === 'ar', 'I18n language switched to Arabic (ar)');
  assert(env.document.documentElement.getAttribute('dir') === 'rtl', 'Document direction switched to RTL');
  assert(env.document.documentElement.getAttribute('lang') === 'ar', 'Document lang set to ar');
  assert(btnLangAr.classList.contains('active'), 'Arabic button has active class');

  // Test English language toggle
  const btnLangEn = env.document.getElementById('btn-lang-en');
  btnLangEn.click();
  assert(FreeIPTV.I18n.getLanguage() === 'en', 'I18n language switched back to English (en)');
  assert(env.document.documentElement.getAttribute('dir') === 'ltr', 'Document direction switched to LTR');
  assert(btnLangEn.classList.contains('active'), 'English button has active class');

  // ============================================================
  // TASK 6 & 7: M3U RUNTIME PARSING & CHANNEL BROWSER
  // ============================================================
  console.log('\n--- Task 6 & 7: M3U Parsing & Live TV Channel List ---');
  const basicM3UContent = fs.readFileSync(path.resolve(__dirname, 'fixtures/basic.m3u'), 'utf8');

  // Add fixture playlist to PlaylistManager
  const addResult = await FreeIPTV.PlaylistManager.addPlaylist('Basic IPTV Test', 'https://example.com/basic.m3u', basicM3UContent);
  assert(addResult.playlist.channelCount === 5, 'PlaylistManager added playlist with 5 channels');
  assert(FreeIPTV.PlaylistManager.getActivePlaylistId() === addResult.playlist.id, 'New playlist is set as active');

  // Switch to Live TV screen
  navLinkLive.click();
  const viewLive = env.document.getElementById('view-live_tv');
  assert(!viewLive.classList.contains('hidden'), 'Navigated to Live TV view (#view-live_tv)');

  // Wait for async loadChannels and DOM render
  await new Promise(r => setTimeout(r, 60));

  // Verify Categories
  const catItems = env.document.querySelectorAll('.category-item');
  assert(catItems.length >= 4, `Live TV rendered ${catItems.length} category items (All + News, Sports, etc.)`);

  // Verify Channel List
  const channelCards = env.document.querySelectorAll('.channel-card');
  assert(channelCards.length === 5, `Live TV rendered all 5 channels in channel list`);

  // Test Category Filtering (select News)
  const newsCat = Array.from(catItems).find(c => c.getAttribute('data-category') === 'News');
  assert(newsCat !== undefined, 'Found "News" category tab');
  newsCat.click();

  const newsCards = env.document.querySelectorAll('.channel-card');
  assert(newsCards.length === 2, `Category "News" filters list to 2 channels (got ${newsCards.length})`);

  // Test Search (search "ESPN")
  const allCat = Array.from(catItems).find(c => c.getAttribute('data-category') === 'all');
  allCat.click(); // Reset to all
  FreeIPTV.LiveTV.setSearchQuery('ESPN');

    const searchCards = env.document.querySelectorAll('.channel-card');
  assert(searchCards.length === 1, `Search query "ESPN" filters list to 1 channel`);
  const espnNameEl = searchCards[0].querySelector('.channel-name');
  assert(espnNameEl && espnNameEl.textContent === 'ESPN HD', 'Search result contains ESPN HD');

  // Reset search
  FreeIPTV.LiveTV.setSearchQuery('');
  assert(env.document.querySelectorAll('.channel-card').length === 5, 'Cleared search restores all 5 channels');

  // ============================================================
  // TASK 8: AVPLAY MEDIA ENGINE PLAYBACK
  // ============================================================
  console.log('\n--- Task 8: AVPlay Stream Playback ---');
  const firstCard = env.document.querySelectorAll('.channel-card')[0];
  firstCard.click(); // Select channel for playback

  const viewPlayer = env.document.getElementById('view-player');
  assert(!viewPlayer.classList.contains('hidden'), 'Player view (#view-player) opened upon channel selection');

  const avplayStats = mockAvplay._getStats();
  assert(avplayStats.state === 'IDLE' || avplayStats.state === 'PREPARING' || avplayStats.state === 'READY' || avplayStats.state === 'PLAYING', 'AVPlay native state transitioned out of NONE');
  assert(avplayStats.currentUrl === 'https://example.com/streams/bbc_news.m3u8', 'AVPlay opened target channel stream URL');
  assert(avplayStats.displayRect.width === 1920 && avplayStats.displayRect.height === 1080, 'AVPlay display rect set to standard 1920x1080');

  // Wait for async prepareAsync callback
  await new Promise(r => setTimeout(r, 30));
  assert(mockAvplay.getState() === 'PLAYING', 'AVPlay native state transitioned to PLAYING');
  assert(FreeIPTV.AVPlayEngine.isPlaying(), 'AVPlayEngine reports isPlaying() === true');

  const chTitleEl = env.document.getElementById('player-channel-name');
  assert(chTitleEl.textContent === 'BBC News', 'Player header displays channel name "BBC News"');

  // ============================================================
  // TASK 9: CHANNEL ZAPPING & RAPID SWITCHING
  // ============================================================
  console.log('\n--- Task 9: Channel Zapping & Rapid Switching ---');
  const initialStopCalls = mockAvplay._getStats().stopCalls;

  // Zap to next channel
  FreeIPTV.Player.zapNext();
  assert(mockAvplay._getStats().stopCalls > initialStopCalls, 'Old stream was stopped before zapping to next channel');
  assert(chTitleEl.textContent === 'CNN International', 'Zapped to next channel "CNN International"');

  await new Promise(r => setTimeout(r, 30));
  assert(FreeIPTV.AVPlayEngine.isPlaying(), 'New channel is playing');

  // Zap to previous channel
  FreeIPTV.Player.zapPrevious();
  assert(chTitleEl.textContent === 'BBC News', 'Zapped back to previous channel "BBC News"');

  await new Promise(r => setTimeout(r, 30));

  // Rapid switching test: 5 consecutive zaps
  for (let i = 0; i < 5; i++) {
    FreeIPTV.Player.zapNext();
  }
  await new Promise(r => setTimeout(r, 40));
  assert(FreeIPTV.AVPlayEngine.isPlaying(), 'Engine safely stabilized in PLAYING state after rapid zapping');

  // ============================================================
  // TASK 10: PLAYER OSD & AUTO-HIDE
  // ============================================================
  console.log('\n--- Task 10: Player OSD Auto-Hide & Controls ---');
  const controlsOverlay = env.document.getElementById('player-controls-overlay');
  assert(!controlsOverlay.classList.contains('hidden'), 'Player controls overlay is initially visible');

  // Test manual hide
  FreeIPTV.Player.hideControls();
  assert(controlsOverlay.classList.contains('hidden'), 'Controls overlay hidden via hideControls()');

  // Test show on remote activity / Enter
  FreeIPTV.Player.showControls();
  assert(!controlsOverlay.classList.contains('hidden'), 'Controls overlay restored via showControls()');

  // Test Back key when controls are open -> hides controls first
  env.window.dispatchEvent({ type: 'keydown', keyCode: 10009, preventDefault: () => {} });
  assert(controlsOverlay.classList.contains('hidden'), 'Back key hid controls overlay without closing player');
  assert(!viewPlayer.classList.contains('hidden'), 'Player remains active after first Back');

  // Second Back key -> closes player and returns to Live TV
  env.window.dispatchEvent({ type: 'keydown', keyCode: 10009, preventDefault: () => {} });
  assert(viewPlayer.classList.contains('hidden'), 'Second Back key closed player view');
  assert(!viewLive.classList.contains('hidden'), 'Returned to Live TV view');
  assert(FreeIPTV.AVPlayEngine.getState() === 'IDLE', 'AVPlay engine returned to IDLE state after player close');

  // ============================================================
  // TASK 11: ERROR HANDLING & RETRY BEHAVIOR
  // ============================================================
  console.log('\n--- Task 11: Error Handling & Retry Logic ---');
  firstCard.click(); // Re-open player
  await new Promise(r => setTimeout(r, 30));

  const errorOverlay = env.document.getElementById('player-error-overlay');
  assert(errorOverlay.classList.contains('hidden'), 'Error overlay is initially hidden during normal playback');

  // Simulate native error callback from AVPlay
  mockAvplay._triggerListener('onerror', 'PLAYER_MSG_CONNECTION_FAILED');

  // First error triggers auto-retry 1
  assert(FreeIPTV.AVPlayEngine.getState() === 'ERROR' || FreeIPTV.AVPlayEngine.getState() === 'OPENING', 'Player entered retry flow after error');

  // Simulate second error
  mockAvplay._triggerListener('onerror', 'PLAYER_MSG_CONNECTION_FAILED');

  // Simulate third error (exceeds MAX_RETRIES = 2)
  mockAvplay._triggerListener('onerror', 'PLAYER_MSG_CONNECTION_FAILED');

  assert(!errorOverlay.classList.contains('hidden'), 'Fatal error overlay displayed after max retries exceeded');

  // Error overlay action button: Previous Channel
  const btnErrPrev = env.document.getElementById('player-error-prev');
  btnErrPrev.click();
  assert(errorOverlay.classList.contains('hidden'), 'Selecting adjacent channel from error overlay clears error state');

  await new Promise(r => setTimeout(r, 30));
  assert(FreeIPTV.AVPlayEngine.isPlaying(), 'Adjacent channel successfully playing');

  // Close player
  FreeIPTV.Player.closePlayer();
  assert(viewPlayer.classList.contains('hidden'), 'Player closed and cleaned up');

  // ============================================================
  // TASK 12: LIFECYCLE & TEARDOWN
  // ============================================================
  console.log('\n--- Task 12: Application Lifecycle & Clean Teardown ---');
  assert(FreeIPTV.AVPlayEngine.getState() === 'IDLE', 'AVPlay state is IDLE after full session teardown');
  assert(FreeIPTV.AVPlayEngine.getCurrentUrl() === null, 'Active URL is null after teardown');
  assert(!viewLive.classList.contains('hidden'), 'Active view is Live TV');

  // Re-open Home view
  navLinkHome.click();
  assert(!viewHome.classList.contains('hidden'), 'Returned cleanly to Home view');

  console.log(`\nInteraction Validation Results: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

runInteractionValidation().catch(e => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
