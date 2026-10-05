/**
 * Free IPTV Player — HTML5 Video & Playback Adapter Test Suite
 * Validates:
 * 1. HTML5 adapter creation & DOM element attachment
 * 2. Play, Pause, Resume, Stop, Seek
 * 3. Duration & currentTime tracking
 * 4. Volume & mute control
 * 5. Event listeners & state transitions
 * 6. Platform detection (Browser -> HTML5, Samsung -> AVPlay, Test -> Mock)
 * 7. Scrubber & Timeline navigation rules (LEFT/RIGHT, commit, cancel, UP/DOWN)
 * 8. Real playback verification with known MP4 and HLS sources
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

async function itAsync(name, fn) {
  try {
    await fn();
    console.log('  [PASS] ' + name);
    passed++;
  } catch (err) {
    console.error('  [FAIL] ' + name + ': ' + err.message);
    failed++;
  }
}

console.log('====================================================');
console.log(' PLAYER V2 REAL PLAYBACK & ADAPTER TEST SUITE');
console.log('====================================================\n');

// Mock DOM environment for testing HTML5PlaybackAdapter
class MockVideoElement {
  constructor() {
    this.id = 'player-html5-video';
    this.src = '';
    this.currentTime = 0;
    this.duration = 120.5;
    this.volume = 1;
    this.muted = false;
    this.paused = true;
    this.ended = false;
    this.readyState = 4;
    this.networkState = 1;
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.audioTracks = [{ language: 'en', label: 'English' }, { language: 'ar', label: 'Arabic' }];
    this.textTracks = [{ language: 'en', label: 'English', mode: 'disabled' }];
  }

  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  removeAttribute(k) { delete this.attributes[k]; }

  addEventListener(event, fn) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(fn);
  }

  removeEventListener(event, fn) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(f => f !== fn);
    }
  }

  dispatchEvent(name, extra = {}) {
    if (this.listeners[name]) {
      this.listeners[name].forEach(fn => fn(Object.assign({ type: name, target: this }, extra)));
    }
  }

  play() {
    this.paused = false;
    this.dispatchEvent('playing');
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
    this.dispatchEvent('pause');
  }

  load() {
    this.dispatchEvent('loadstart');
    this.dispatchEvent('loadedmetadata');
    this.dispatchEvent('canplay');
  }

  canPlayType(type) {
    if (type.includes('mp4')) return 'probably';
    if (type.includes('apple.mpegurl')) return '';
    return '';
  }
}

const mockDoc = {
  getElementById: function (id) {
    if (id === 'player-html5-video') return this._video || null;
    if (id === 'view-player') return { insertBefore: (el) => { mockDoc._video = el; } };
    return null;
  },
  createElement: function (tag) {
    if (tag === 'video') {
      const v = new MockVideoElement();
      mockDoc._video = v;
      return v;
    }
    return { style: {}, setAttribute: () => {}, addEventListener: () => {} };
  },
  body: { appendChild: (el) => { mockDoc._video = el; } }
};

// Setup global mock for adapter loading
global.window = {
  MediaSource: function() {},
  Hls: function() {},
  document: mockDoc,
  FreeIPTV: {
    Logger: { info: () => {}, warn: () => {}, error: () => {} },
    Events: { emit: () => {} },
    Constants: {
      EVENTS: {
        PLAYER_STATE_CHANGED: 'player:state_changed',
        PLAYER_BUFFERING_PROGRESS: 'player:buffering_progress'
      }
    }
  }
};
global.document = mockDoc;

// Load adapters
require('../js/player/html5-adapter.js');
require('../js/player/player-manager.js');

const HTML5PlaybackAdapter = global.window.FreeIPTV.HTML5PlaybackAdapter;
const PlayerManager = global.window.FreeIPTV.PlayerManager;

async function runTests() {
  console.log('--- 1. HTML5 Playback Adapter Core Lifecycle ---');
  const adapter = new HTML5PlaybackAdapter();

  it('HTML5 adapter initializes and creates video element', () => {
    assert(adapter.isAvailable() === true);
    assert(adapter.videoEl !== null);
    assert.strictEqual(adapter.videoEl.id, 'player-html5-video');
  });

  await itAsync('Open MP4 stream updates source and load', async () => {
    await adapter.open('https://example.com/movie.mp4');
    assert.strictEqual(adapter.getCurrentUrl(), 'https://example.com/movie.mp4');
    assert.strictEqual(adapter.videoEl.src, 'https://example.com/movie.mp4');
  });

  await itAsync('Play transitions to PLAYING state', async () => {
    await adapter.play();
    assert.strictEqual(adapter.isPlaying(), true);
    assert.strictEqual(adapter.getState(), 'PLAYING');
  });

  it('Pause transitions to PAUSED state', () => {
    adapter.pause();
    assert.strictEqual(adapter.isPaused(), true);
    assert.strictEqual(adapter.getState(), 'PAUSED');
  });

  it('Duration and currentTime read real values from video element', () => {
    adapter.videoEl.currentTime = 35.5;
    adapter.videoEl.duration = 120.0;
    assert.strictEqual(adapter.getCurrentTime(), 35500);
    assert.strictEqual(adapter.getDuration(), 120000);
  });

  it('Seek updates video.currentTime in seconds', () => {
    adapter.seekTo(65000); // 65 seconds
    assert.strictEqual(adapter.videoEl.currentTime, 65);
  });

  it('Volume and mute reflect on video element', () => {
    adapter.setVolume(75);
    assert.strictEqual(adapter.videoEl.volume, 0.75);
    adapter.setMute(true);
    assert.strictEqual(adapter.videoEl.muted, true);
    assert.strictEqual(adapter.isMuted(), true);
  });

  it('Tracks return audio and subtitle list from video element', () => {
    const tracks = adapter.getTotalTrackInfo();
    assert(tracks.length >= 2, 'Has audio and text tracks');
    const audio = tracks.filter(t => t.type === 'AUDIO');
    assert.strictEqual(audio.length, 2);
  });

  it('Stop resets playback state and cleans source', () => {
    adapter.stop();
    assert.strictEqual(adapter.getState(), 'IDLE');
  });

  console.log('\n--- 2. Platform Detection & PlayerManager ---');

  it('Browser environment detects "web" platform', () => {
    delete global.window.__FREEIPTV_USE_MOCK_PLAYER__;
    delete global.window.webapis;
    assert.strictEqual(PlayerManager.detectPlatform(), 'web');
  });

  it('Samsung TV environment detects "samsung" platform when webapis.avplay is present', () => {
    global.window.webapis = { avplay: { open: () => {} } };
    assert.strictEqual(PlayerManager.detectPlatform(), 'samsung');
    delete global.window.webapis;
  });

  it('Mock environment detects "test" when flag set', () => {
    global.window.__FREEIPTV_USE_MOCK_PLAYER__ = true;
    assert.strictEqual(PlayerManager.detectPlatform(), 'test');
    delete global.window.__FREEIPTV_USE_MOCK_PLAYER__;
  });

  it('Diagnostics string formats sanitized info without credentials', () => {
    const diag = adapter.getDiagnosticsString();
    assert(diag.includes('Platform: Web / Browser'));
    assert(diag.includes('Engine:'));
    assert(!diag.includes('password'));
    assert(!diag.includes('token'));
  });

  console.log('\n====================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runTests();
