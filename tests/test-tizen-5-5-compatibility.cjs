/**
 * Free IPTV Player — Tizen 5.5 / Chromium M69 Compatibility Test Suite
 * Verifies layout fallbacks, flex margins, focus visibility, remote navigation,
 * and input field vertical traversal.
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
console.log(' TIZEN 5.5 / CHROMIUM M69 COMPATIBILITY SUITE');
console.log('====================================================\n');

// 1. CSS Syntax & Parser Compatibility
console.log('--- 1. CSS Syntax & Parser Compatibility ---');

const navCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'navigation.css'), 'utf8').replace(/\r\n/g, '\n');
const layoutCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'layout.css'), 'utf8').replace(/\r\n/g, '\n');
const epgCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'live-epg.css'), 'utf8').replace(/\r\n/g, '\n');

it('1. No :focus-visible selectors in navigation.css (prevents M69 parser rule dropping)', function () {
  assert.strictEqual(navCss.includes(':focus-visible'), false, 'navigation.css must not contain :focus-visible');
});

it('2. No :focus-visible selectors in layout.css (prevents M69 parser rule dropping)', function () {
  assert.strictEqual(layoutCss.includes(':focus-visible'), false, 'layout.css must not contain :focus-visible');
});

it('3. Inset property has top/right/bottom/left fallbacks in layout.css and live-epg.css', function () {
  assert.ok(layoutCss.includes('top: 0;\n  right: 0;\n  bottom: 0;\n  left: 0;'), 'layout.css must provide inset fallbacks');
  assert.ok(epgCss.includes('top: 0;\n  right: 0;\n  bottom: 0;\n  left: 0;'), 'live-epg.css must provide inset fallbacks');
});

it('4. Flexbox gap margin fallbacks exist for key layout elements', function () {
  assert.ok(layoutCss.includes('.brand-section > .brand-logo-img'), 'brand-section margin fallback exists');
  assert.ok(layoutCss.includes('.header-actions > * + *'), 'header-actions margin fallback exists');
  assert.ok(layoutCss.includes('.provider-tabs > * + *'), 'provider-tabs margin fallback exists');
  assert.ok(layoutCss.includes('.modal-actions > * + *'), 'modal-actions margin fallback exists');
  assert.ok(layoutCss.includes('html[dir="rtl"] .modal-actions > * + *'), 'modal-actions RTL fallback exists');
});

// 2. Navigation & Remote Control Integration
console.log('\n--- 2. Remote & Navigation Engine Logic ---');

// Setup minimal DOM mock environment for navigation testing
const { JSDOM } = (() => {
  // Simple Mock DOM if jsdom not installed in environment
  return {
    JSDOM: null
  };
})();

// Load and evaluate scripts in simulated environment
const vm = require('vm');

const mockWindow = {
  FreeIPTV: {
    Constants: {
      KEYS: {
        UP: 38,
        DOWN: 40,
        LEFT: 37,
        RIGHT: 39,
        ENTER: 13,
        RETURN_TIZEN: 10009,
        ESCAPE: 27,
        BACKSPACE: 8
      },
      DIRECTIONS: {
        UP: 'up',
        DOWN: 'down',
        LEFT: 'left',
        RIGHT: 'right'
      },
      NAV_ZONES: {
        HEADER: 'header',
        SIDEBAR: 'sidebar',
        MAIN: 'main'
      },
      EVENTS: {
        NAV_FOCUS_CHANGED: 'nav_focus_changed',
        NAV_ACTION_TRIGGERED: 'nav_action_triggered'
      }
    },
    Logger: {
      debug: function () {},
      info: function () {},
      warn: function () {},
      error: function () {}
    },
    Events: {
      emit: function () {}
    },
    I18n: {
      isRTL: function () { return mockWindow.__isRTL || false; }
    }
  }
};

// Create a DOM-like structure in mockWindow
class MockElement {
  constructor(tagName, id, classes) {
    this.tagName = tagName.toUpperCase();
    this.id = id || '';
    this.classList = {
      _classes: new Set(classes || []),
      contains: (c) => this.classList._classes.has(c),
      add: (c) => this.classList._classes.add(c),
      remove: (c) => this.classList._classes.delete(c)
    };
    this.attributes = {};
    this.children = [];
    this.parentElement = null;
    this.offsetParent = {};
    this.offsetWidth = 100;
    this.offsetHeight = 40;
    this.focused = false;
  }
  getAttribute(name) { return this.attributes[name] || null; }
  setAttribute(name, val) { this.attributes[name] = val; }
  focus() { this.focused = true; }
  blur() { this.focused = false; }
  click() { if (this.onclick) this.onclick(); }
  closest(selector) {
    let cur = this;
    while (cur) {
      if (selector.startsWith('#') && cur.id === selector.substring(1)) return cur;
      if (selector.startsWith('.') && cur.classList.contains(selector.substring(1))) return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  scrollIntoViewIfNeeded() {}
  scrollIntoView() {}
  querySelectorAll(sel) {
    return doc.querySelectorAll(sel).filter(e => {
      let cur = e.parentElement;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentElement;
      }
      return false;
    });
  }
  querySelector(sel) {
    const list = this.querySelectorAll(sel);
    return list.length > 0 ? list[0] : null;
  }
}

function matchesSelector(el, sel) {
  if (!sel || !el) return false;
  const parts = sel.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  if (last.startsWith('#')) {
    return el.id === last.substring(1);
  }
  if (last.startsWith('.')) {
    const clsList = last.split('.').filter(Boolean);
    return clsList.every(c => el.classList.contains(c));
  }
  return false;
}

const doc = {
  activeElement: null,
  body: new MockElement('body', 'body', []),
  _elements: [],
  createElement: (tag) => new MockElement(tag),
  getElementById: (id) => doc._elements.find(e => e.id === id) || null,
  querySelector: (sel) => {
    return doc._elements.find(e => matchesSelector(e, sel)) || null;
  },
  querySelectorAll: (sel) => {
    return doc._elements.filter(e => matchesSelector(e, sel));
  },
  addEventListener: () => {}
};

mockWindow.window = mockWindow;
mockWindow.self = mockWindow;
mockWindow.document = doc;
mockWindow.addEventListener = () => {};
mockWindow.setTimeout = setTimeout;
mockWindow.clearTimeout = clearTimeout;
mockWindow.setInterval = setInterval;
mockWindow.clearInterval = clearInterval;
doc.body.contains = (el) => doc._elements.includes(el);

// Load navigation and remote scripts
const navJsCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui', 'navigation.js'), 'utf8');
const remoteJsCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'tv', 'remote.js'), 'utf8');

const ctx = vm.createContext(mockWindow);
vm.runInContext(navJsCode, ctx);
vm.runInContext(remoteJsCode, ctx);

const Navigation = mockWindow.FreeIPTV.Navigation;
const Remote = mockWindow.FreeIPTV.Remote;
const Constants = mockWindow.FreeIPTV.Constants;

it('5. Navigation and Remote are loaded and initialized', function () {
  assert.ok(Navigation, 'Navigation object exists');
  assert.ok(Remote, 'Remote object exists');
  Navigation.init();
  Remote.init();
});

it('6. Button focus applies .focused class and calls focus()', function () {
  const btn = new MockElement('button', 'test-btn', ['focusable']);
  doc._elements.push(btn);
  Navigation.focus(btn);
  assert.strictEqual(Navigation.getCurrent(), btn);
  assert.strictEqual(btn.classList.contains('focused'), true);
  assert.strictEqual(btn.focused, true);
});

it('7. Card focus receives .focused class', function () {
  const card = new MockElement('div', 'test-card', ['focusable', 'channel-card']);
  doc._elements.push(card);
  Navigation.focus(card);
  assert.strictEqual(Navigation.getCurrent(), card);
  assert.strictEqual(card.classList.contains('focused'), true);
});

it('8. Focus transition from input calls blur() on previous input', function () {
  const inputEl = new MockElement('input', 'input-1', ['focusable']);
  const nextBtn = new MockElement('button', 'btn-submit', ['focusable']);
  doc._elements.push(inputEl, nextBtn);
  Navigation.focus(inputEl);
  assert.strictEqual(inputEl.focused, true);
  Navigation.focus(nextBtn);
  assert.strictEqual(inputEl.focused, false, 'previous input must be blurred to terminate IME session');
  assert.strictEqual(nextBtn.focused, true);
});

it('9. ENTER triggers click() on focused element', function () {
  let clicked = false;
  const btn = new MockElement('button', 'btn-trigger', ['focusable']);
  btn.onclick = () => { clicked = true; };
  doc._elements.push(btn);
  Navigation.focus(btn);
  const handled = Navigation.triggerActive();
  assert.strictEqual(handled, true);
  assert.strictEqual(clicked, true);
});

it('10. Add Playlist Modal navigation traverses DOWN between inputs and buttons', function () {
  // Create mock modal DOM
  const modalView = new MockElement('div', 'view-add_playlist', []);
  const tabXtream = new MockElement('button', 'modal-tab-xtream', ['focusable', 'provider-tab-btn']);
  tabXtream.setAttribute('data-nav-zone', 'modal');
  tabXtream.parentElement = modalView;

  const panelXtream = new MockElement('div', 'modal-panel-xtream', ['modal-provider-panel']);
  panelXtream.parentElement = modalView;

  const inputName = new MockElement('input', 'input-xtream-name', ['form-input', 'focusable']);
  inputName.setAttribute('data-nav-zone', 'modal');
  inputName.parentElement = panelXtream;

  const inputServer = new MockElement('input', 'input-xtream-server', ['form-input', 'focusable']);
  inputServer.setAttribute('data-nav-zone', 'modal');
  inputServer.parentElement = panelXtream;

  const inputUser = new MockElement('input', 'input-xtream-username', ['form-input', 'focusable']);
  inputUser.setAttribute('data-nav-zone', 'modal');
  inputUser.parentElement = panelXtream;

  const inputPass = new MockElement('input', 'input-xtream-password', ['form-input', 'focusable']);
  inputPass.setAttribute('data-nav-zone', 'modal');
  inputPass.parentElement = panelXtream;

  const modalActions = new MockElement('div', 'modal-actions', ['modal-actions']);
  modalActions.parentElement = panelXtream;

  const btnLogin = new MockElement('button', 'modal-btn-xtream-login', ['btn-primary', 'focusable']);
  btnLogin.setAttribute('data-nav-zone', 'modal');
  btnLogin.parentElement = modalActions;

  modalView.querySelector = (sel) => {
    if (sel.includes('.modal-provider-panel:not(.hidden)')) return panelXtream;
    if (sel.includes('.provider-tab-btn.active')) return tabXtream;
    return null;
  };
  panelXtream.querySelectorAll = (sel) => {
    if (sel.includes('.form-input')) return [inputName, inputServer, inputUser, inputPass];
    if (sel.includes('.modal-actions .focusable')) return [btnLogin];
    return [];
  };

  doc._elements.push(modalView, tabXtream, panelXtream, inputName, inputServer, inputUser, inputPass, btnLogin);

  // Focus inputName
  Navigation.focus(inputName);
  assert.strictEqual(Navigation.getCurrent(), inputName);

  // Move DOWN: from inputName -> inputServer
  let next = Navigation.calculateNextElement('modal', Constants.DIRECTIONS.DOWN);
  assert.strictEqual(next, inputServer, 'DOWN from inputName should be inputServer');

  // Focus inputServer, Move DOWN -> inputUser
  Navigation.focus(inputServer);
  next = Navigation.calculateNextElement('modal', Constants.DIRECTIONS.DOWN);
  assert.strictEqual(next, inputUser, 'DOWN from inputServer should be inputUser');

  // Focus inputPass, Move DOWN -> btnLogin
  Navigation.focus(inputPass);
  next = Navigation.calculateNextElement('modal', Constants.DIRECTIONS.DOWN);
  assert.strictEqual(next, btnLogin, 'DOWN from inputPass should be btnLogin');

  // Focus btnLogin, Move UP -> inputPass
  Navigation.focus(btnLogin);
  next = Navigation.calculateNextElement('modal', Constants.DIRECTIONS.UP);
  assert.strictEqual(next, inputPass, 'UP from btnLogin should be inputPass');
});

it('11. Remote handleKeyDown intercepts DOWN inside input in capture phase', function () {
  const inputEl = new MockElement('input', 'input-test', ['form-input', 'focusable']);
  const btnNext = new MockElement('button', 'btn-next', ['focusable']);
  doc._elements.push(inputEl, btnNext);
  Navigation.focus(inputEl);

  let defaultPrevented = false;
  let propagationStopped = false;
  let moveCalled = false;

  const origMove = Navigation.move;
  Navigation.move = (dir) => {
    moveCalled = true;
    assert.strictEqual(dir, Constants.DIRECTIONS.DOWN);
    return true;
  };

  Remote.handleKeyDown({
    keyCode: Constants.KEYS.DOWN,
    target: inputEl,
    preventDefault: () => { defaultPrevented = true; },
    stopPropagation: () => { propagationStopped = true; }
  });

  Navigation.move = origMove;

  assert.strictEqual(defaultPrevented, true, 'preventDefault must be called');
  assert.strictEqual(propagationStopped, true, 'stopPropagation must be called');
  assert.strictEqual(moveCalled, true, 'Navigation.move must be triggered');
});

it('12. Remote handleKeyDown intercepts UP inside input in capture phase', function () {
  const inputEl = new MockElement('input', 'input-test-2', ['form-input', 'focusable']);
  doc._elements.push(inputEl);
  Navigation.focus(inputEl);

  let defaultPrevented = false;
  let moveCalled = false;

  const origMove = Navigation.move;
  Navigation.move = (dir) => {
    moveCalled = true;
    assert.strictEqual(dir, Constants.DIRECTIONS.UP);
    return true;
  };

  Remote.handleKeyDown({
    keyCode: Constants.KEYS.UP,
    target: inputEl,
    preventDefault: () => { defaultPrevented = true; },
    stopPropagation: () => {}
  });

  Navigation.move = origMove;

  assert.strictEqual(defaultPrevented, true);
  assert.strictEqual(moveCalled, true);
});

it('13. RTL Navigation inverts horizontal axis', function () {
  mockWindow.__isRTL = true;
  const itemA = new MockElement('button', 'item-a', ['focusable']);
  const itemB = new MockElement('button', 'item-b', ['focusable']);
  doc._elements.push(itemA, itemB);

  // In RTL, moving LEFT should query RIGHT internally
  let directionChecked = null;
  const origCalc = Navigation.calculateNextElement;
  Navigation.calculateNextElement = (zone, dir) => {
    directionChecked = dir;
    return itemB;
  };

  Navigation.focus(itemA);
  Navigation.move(Constants.DIRECTIONS.LEFT);

  Navigation.calculateNextElement = origCalc;
  mockWindow.__isRTL = false;

  assert.strictEqual(directionChecked, Constants.DIRECTIONS.RIGHT, 'Horizontal left should invert to right in RTL');
});

it('14. Back key on input without Backspace triggers handleBack()', function () {
  let backTriggered = false;
  Remote.pushBackHandler(() => {
    backTriggered = true;
    return true;
  });

  const inputEl = new MockElement('input', 'input-test-3', ['focusable']);
  Remote.handleKeyDown({
    keyCode: Constants.KEYS.RETURN_TIZEN,
    target: inputEl,
    preventDefault: () => {},
    stopPropagation: () => {}
  });

  assert.strictEqual(backTriggered, true, 'RETURN_TIZEN inside input should trigger app back handler');
  Remote.popBackHandler();
});

it('15. Backspace on input is allowed for text editing', function () {
  let backTriggered = false;
  Remote.pushBackHandler(() => {
    backTriggered = true;
    return true;
  });

  const inputEl = new MockElement('input', 'input-test-4', ['focusable']);
  Remote.handleKeyDown({
    keyCode: Constants.KEYS.BACKSPACE,
    target: inputEl,
    preventDefault: () => {},
    stopPropagation: () => {}
  });

  assert.strictEqual(backTriggered, false, 'BACKSPACE inside input must NOT trigger app back handler');
  Remote.popBackHandler();
});

it('16. Search input handles DOWN when results are empty without trapping focus', function () {
  const sidebar = new MockElement('button', 'nav-sidebar-item', ['focusable', 'active']);
  doc._elements.push(sidebar);

  const next = Navigation.handleSearchNavigation('search_input', Constants.DIRECTIONS.DOWN);
  assert.ok(next !== null, 'Search input must not trap user when results are empty');
});

it('17. Search input handles UP to header', function () {
  const headerBtn = new MockElement('button', 'btn-header-search', ['focusable']);
  doc._elements.push(headerBtn);

  const next = Navigation.handleSearchNavigation('search_input', Constants.DIRECTIONS.UP);
  assert.strictEqual(next, headerBtn, 'UP from search input should move to header');
});

it('18. Navigation move resynchronizes currentElement if document.activeElement changes natively', function () {
  const strayInput = new MockElement('input', 'stray-input', ['focusable']);
  doc._elements.push(strayInput);
  doc.activeElement = strayInput;

  // Navigation.getCurrent() was something else
  assert.notStrictEqual(Navigation.getCurrent(), strayInput);

  Navigation.move(Constants.DIRECTIONS.DOWN);
  assert.strictEqual(Navigation.getCurrent(), strayInput, 'Navigation should resynchronize to activeElement');
  doc.activeElement = null;
});

it('19. Viewport meta is set to width=1920 for Samsung Smart TV 1080p hardware scaling', function () {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.includes('content="width=1920, user-scalable=no"'), 'index.html must set viewport to width=1920');
});

it('20. Search input wrap is full-width (100%) and not constrained to 680px', function () {
  assert.ok(layoutCss.includes('.search-input-wrap') && layoutCss.includes('max-width: 100%;'), 'search-input-wrap must be width: 100% and max-width: 100%');
  assert.ok(!layoutCss.includes('width: 680px;'), 'layout.css must not have hardcoded width: 680px for search input');
});

it('21. Universal focus outline and checkbox focus indicators are present', function () {
  assert.ok(navCss.includes('.focusable.focused,\n.focusable:focus'), 'navigation.css must have universal outline for .focusable.focused');
  assert.ok(navCss.includes('.settings-toggle-item.focused'), 'navigation.css must have focused state for settings checkboxes');
});

it('22. Poster images do not collapse on Chromium M69 (no height:0 with padding-top:150%)', function () {
  // In Chromium M69 flex/grid items, height:0 with padding-top:150% inside unconstrained height container collapses to 0px
  assert.ok(!layoutCss.includes('.movie-poster-wrap {\n  position: relative;\n  width: 100%;\n  height: 0 !important;'), 'movie-poster-wrap must not have height: 0 !important');
  assert.ok(layoutCss.includes('.movie-poster-wrap') && layoutCss.includes('height: var(--poster-h, 300px);'), 'movie-poster-wrap must have explicit (JS-derived, non-zero) height to prevent 0px collapse');
});

it('23. Quick access grid does not use destructive sibling margin that breaks columns', function () {
  assert.ok(!layoutCss.includes('.home-quick-access-grid > * + * {\n  margin-left: 20px;'), 'Must not have destructive margin-left on home-quick-access-grid children');
  assert.ok(!layoutCss.includes('.home-recent-grid > * + * {\n  margin-left: 20px;'), 'Must not have destructive margin-left on home-recent-grid children');
});

it('24. Aspect ratio control is completely removed from player UI and DOM', function () {
  const playerJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui', 'player.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(!playerJs.includes('cycleAspectRatio'), 'cycleAspectRatio must be completely removed');
  assert.ok(!indexHtml.includes('id="player-btn-aspect"'), 'player-btn-aspect must be completely removed from index.html');
});

it('25. Series episode playback synchronizes player title and subtitle', function () {
  const playerJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui', 'player.js'), 'utf8');
  assert.ok(playerJs.includes("title: sName + ' - S' + (sNum < 10 ? '0' + sNum : sNum) + 'E' + (epNumber < 10 ? '0' + epNumber : epNumber)"), 'playEpisode must format title with series name and SxxExx code');
  assert.ok(playerJs.includes('this.updatePlayerHeader(media)'), 'launchPlayback must immediately update player header');
});

it('26. Live TV restores category stack and selected channel state on return', function () {
  const liveTvJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui', 'live-tv.js'), 'utf8');
  assert.ok(liveTvJs.includes('restoreViewState: function ()'), 'LiveTV must implement restoreViewState');
  assert.ok(liveTvJs.includes('if (activePlaylist && currentPlaylistId === activePlaylist.id && allChannels.length > 0)'), 'onEnterView must restore state when returning with same playlist');
});

it('27. Movies and Series include All, Favorites, and Continue Watching smart categories', function () {
  const moviesJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui', 'movies.js'), 'utf8');
  const seriesJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui', 'series.js'), 'utf8');
  const enJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n', 'en.json'), 'utf8'));
  const arJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n', 'ar.json'), 'utf8'));

  assert.ok(moviesJs.includes("data-category', 'favorites'"), 'Movies must have Favorites category');
  assert.ok(moviesJs.includes("data-category', 'continue_watching'"), 'Movies must have Continue Watching category');
  assert.ok(seriesJs.includes("data-category', 'favorites'"), 'Series must have Favorites category');
  assert.ok(seriesJs.includes("data-category', 'continue_watching'"), 'Series must have Continue Watching category');

  assert.ok(enJson['movies.favorites'] && enJson['movies.continue_watching'], 'en.json must have movies smart categories');
  assert.ok(arJson['movies.favorites'] && arJson['movies.continue_watching'], 'ar.json must have movies smart categories');
  assert.ok(enJson['series.favorites'] && enJson['series.continue_watching'], 'en.json must have series smart categories');
  assert.ok(arJson['series.favorites'] && arJson['series.continue_watching'], 'ar.json must have series smart categories');
});

console.log('\n====================================================');
console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
}
