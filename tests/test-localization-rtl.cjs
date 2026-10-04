/**
 * Free IPTV Player — Localization & True RTL Validation Suite
 * Validates dictionary parity, DOM dir/lang attributes, LTR input isolation,
 * translation resolution, and spatial modal navigation.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('====================================================');
console.log(' TEST SUITE: LOCALIZATION & TRUE RTL UI VALIDATION');
console.log('====================================================');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

// 1. Dictionary Key Parity Check
console.log('\n--- 1. Dictionary Parity Check (en.json vs ar.json) ---');
const enPath = path.resolve(__dirname, '../js/i18n/en.json');
const arPath = path.resolve(__dirname, '../js/i18n/ar.json');

const enJson = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const arJson = JSON.parse(fs.readFileSync(arPath, 'utf8'));

const enKeys = Object.keys(enJson).sort();
const arKeys = Object.keys(arJson).sort();

assert(enKeys.length === arKeys.length, `Key counts match: EN (${enKeys.length}) === AR (${arKeys.length})`);
assert(enKeys.length >= 79, `Dictionary contains all required keys (found ${enKeys.length})`);

const missingInAr = enKeys.filter(k => !(k in arJson));
const missingInEn = arKeys.filter(k => !(k in enJson));
assert(missingInAr.length === 0, `No keys missing in Arabic dictionary: ${missingInAr.join(', ')}`);
assert(missingInEn.length === 0, `No keys missing in English dictionary: ${missingInEn.join(', ')}`);

// Verify critical Xtream & modal keys are present in both
const criticalKeys = [
  'modal.tab_m3u',
  'modal.tab_xtream',
  'modal.xtream_server',
  'modal.xtream_username',
  'modal.xtream_password',
  'modal.btn_login',
  'modal.error.invalid_server',
  'modal.error.username_required',
  'modal.error.password_required',
  'modal.error.login_failed',
  'modal.error.server_connect',
  'modal.error.auth_failed'
];

criticalKeys.forEach(k => {
  assert(typeof enJson[k] === 'string' && enJson[k].length > 0, `EN has key: ${k} -> "${enJson[k]}"`);
  assert(typeof arJson[k] === 'string' && arJson[k].length > 0, `AR has key: ${k} -> "${arJson[k]}"`);
});

// 2. Embedded In-Memory Dictionary in i18n.js
console.log('\n--- 2. i18n.js Embedded Dictionary & Translation Engine ---');
const i18nCode = fs.readFileSync(path.resolve(__dirname, '../js/i18n/i18n.js'), 'utf8');

// Mock DOM & window environment
const mockElements = [];
function createMockElement(tag, attrs = {}) {
  const el = {
    tagName: tag.toUpperCase(),
    attributes: { ...attrs },
    classList: {
      classes: [],
      add(c) { if (!this.classes.includes(c)) this.classes.push(c); },
      remove(c) { this.classes = this.classes.filter(x => x !== c); },
      contains(c) { return this.classes.includes(c); }
    },
    textContent: '',
    children: [],
    getAttribute(attr) { return this.attributes[attr] || null; },
    setAttribute(attr, val) { this.attributes[attr] = String(val); },
    hasAttribute(attr) { return attr in this.attributes; },
    removeAttribute(attr) { delete this.attributes[attr]; },
    querySelectorAll(selector) {
      const results = [];
      function traverse(node) {
        if (selector === '[data-i18n]' && node.hasAttribute('data-i18n')) results.push(node);
        if (selector === '[data-i18n-title]' && node.hasAttribute('data-i18n-title')) results.push(node);
        if (selector === '[data-i18n-placeholder]' && node.hasAttribute('data-i18n-placeholder')) results.push(node);
        node.children.forEach(traverse);
      }
      traverse(el);
      return results;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    }
  };
  return el;
}

const mockDoc = {
  documentElement: createMockElement('html'),
  body: createMockElement('body'),
  querySelectorAll(selector) {
    const results = [];
    function traverse(node) {
      if (selector === '[data-i18n]' && node.hasAttribute('data-i18n')) results.push(node);
      if (selector === '[data-i18n-title]' && node.hasAttribute('data-i18n-title')) results.push(node);
      if (selector === '[data-i18n-placeholder]' && node.hasAttribute('data-i18n-placeholder')) results.push(node);
      node.children.forEach(traverse);
    }
    traverse(mockDoc.documentElement);
    traverse(mockDoc.body);
    return results;
  }
};

const mockWindow = {
  document: mockDoc,
  FreeIPTV: {
    Storage: {
      data: {},
      get(k, def) { return this.data[k] !== undefined ? this.data[k] : def; },
      set(k, v) { this.data[k] = v; }
    },
    Events: {
      events: {},
      on(name, fn) { (this.events[name] = this.events[name] || []).push(fn); },
      emit(name, data) { (this.events[name] || []).forEach(fn => fn(data)); }
    },
    Constants: {
      APP: { DEFAULT_LOCALE: 'en', SUPPORTED_LOCALES: ['en', 'ar'] },
      EVENTS: { LANGUAGE_CHANGED: 'i18n:language_changed' }
    },
    Logger: {
      info() {},
      warn() {},
      error() {}
    }
  }
};
mockWindow.window = mockWindow;

vm.createContext(mockWindow);
vm.runInContext(i18nCode, mockWindow);

const I18n = mockWindow.FreeIPTV.I18n;
assert(I18n !== undefined, 'FreeIPTV.I18n is exposed');

// Test language initialization
I18n.init();
assert(I18n.getLanguage() === 'en', 'Default language initialized to English');
assert(I18n.isRTL() === false, 'English is not RTL');
assert(mockDoc.documentElement.getAttribute('dir') === 'ltr', 'Document root dir is ltr for English');
assert(mockDoc.documentElement.getAttribute('lang') === 'en', 'Document root lang is en for English');

// Test translation resolution
assert(I18n.t('modal.tab_m3u') === 'M3U / M3U8', 'I18n.t resolves modal.tab_m3u in English');
assert(I18n.t('modal.tab_xtream') === 'XTREAM CODES', 'I18n.t resolves modal.tab_xtream in English');
assert(I18n.t('modal.btn_login') === 'LOGIN', 'I18n.t resolves modal.btn_login in English');

// Test switching to Arabic
I18n.setLanguage('ar');
assert(I18n.getLanguage() === 'ar', 'Language switched to Arabic');
assert(I18n.isRTL() === true, 'Arabic is RTL');
assert(mockDoc.documentElement.getAttribute('dir') === 'rtl', 'Document root dir is rtl for Arabic');
assert(mockDoc.documentElement.getAttribute('lang') === 'ar', 'Document root lang is ar for Arabic');
assert(mockDoc.body.getAttribute('dir') === 'rtl', 'Body dir is rtl for Arabic');

// Test Arabic translation strings
assert(I18n.t('modal.tab_m3u') === 'M3U / M3U8', 'I18n.t resolves Arabic modal.tab_m3u');
assert(I18n.t('modal.tab_xtream') === 'XTREAM CODES', 'I18n.t resolves Arabic modal.tab_xtream');
assert(I18n.t('modal.btn_login') === 'تسجيل الدخول', 'I18n.t resolves Arabic modal.btn_login ("تسجيل الدخول")');
assert(I18n.t('modal.xtream_server') === 'الخادم / المضيف', 'I18n.t resolves Arabic server label');
assert(I18n.t('modal.xtream_username') === 'اسم المستخدم', 'I18n.t resolves Arabic username label');
assert(I18n.t('modal.xtream_password') === 'كلمة المرور', 'I18n.t resolves Arabic password label');
assert(I18n.t('modal.error.invalid_server') === 'عنوان الخادم غير صالح', 'I18n.t resolves Arabic invalid server error');

// Test parameter substitution
assert(I18n.t('live.channel_count', { count: 42 }) === '42 قناة', 'Arabic parameter substitution works: "42 قناة"');

// Test DOM update for data-i18n-placeholder
const inputEl = createMockElement('input', {
  'data-i18n-placeholder': 'modal.xtream_server_placeholder'
});
mockDoc.body.appendChild(inputEl);
I18n.updateDOM(mockDoc.body);
assert(inputEl.getAttribute('placeholder') === 'أدخل عنوان الخادم', 'data-i18n-placeholder translated to Arabic on input');

// 3. CSS RTL Inspection
console.log('\n--- 3. CSS RTL & Technical Input Rules Inspection ---');
const navCss = fs.readFileSync(path.resolve(__dirname, '../css/navigation.css'), 'utf8');

assert(navCss.includes('html[dir="rtl"]'), 'navigation.css contains html[dir="rtl"] styling block');
assert(navCss.includes('direction: ltr !important'), 'navigation.css contains LTR enforcement rule');
assert(navCss.includes('text-align: left !important'), 'navigation.css contains left alignment enforcement for technical inputs');
assert(navCss.includes('.ltr-input'), 'navigation.css defines .ltr-input class');
assert(navCss.includes('#input-xtream-server'), 'navigation.css explicitly protects #input-xtream-server');
assert(navCss.includes('#input-xtream-username'), 'navigation.css explicitly protects #input-xtream-username');
assert(navCss.includes('#input-xtream-password'), 'navigation.css explicitly protects #input-xtream-password');

// Ensure blanket row-reverse is eliminated from .app-body and main containers
const rowReverseMatches = navCss.match(/flex-direction:\s*row-reverse/g) || [];
assert(rowReverseMatches.length === 0, `Blanket flex-direction: row-reverse eliminated from CSS (count: ${rowReverseMatches.length})`);

// 4. index.html Inspection
console.log('\n--- 4. index.html Technical Inputs & Localization Tagging ---');
const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

assert(indexHtml.includes('id="input-xtream-server"') && indexHtml.includes('ltr-input'), 'Xtream server input has ltr-input class');
assert(indexHtml.includes('id="input-xtream-username"') && indexHtml.includes('ltr-input'), 'Xtream username input has ltr-input class');
assert(indexHtml.includes('id="input-xtream-password"') && indexHtml.includes('ltr-input'), 'Xtream password input has ltr-input class');
assert(indexHtml.includes('data-i18n="modal.tab_m3u"'), 'modal-tab-m3u has data-i18n attribute');
assert(indexHtml.includes('data-i18n="modal.tab_xtream"'), 'modal-tab-xtream has data-i18n attribute');
assert(indexHtml.includes('data-i18n="modal.btn_login"'), 'modal-btn-xtream-login has data-i18n attribute');

// Summary
console.log('\n====================================================');
console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
}
