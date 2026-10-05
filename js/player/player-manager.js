/**
 * Free IPTV Player — Playback Engine Factory & Platform Adapter Switcher
 * Intelligently routes between:
 * - SamsungAVPlayAdapter (Hardware Samsung Tizen TV runtime)
 * - HTML5PlaybackAdapter (Web browser / desktop runtime)
 * - MockPlaybackAdapter (Unit tests)
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  /**
   * Determine the current playback platform.
   * @returns {'samsung'|'web'|'test'}
   */
  function detectPlatform() {
    // 1. Explicit mock for automated unit test suites
    if (typeof window !== 'undefined' && window.__FREEIPTV_USE_MOCK_PLAYER__) {
      return 'test';
    }

    // 2. Hardware Samsung Tizen TV runtime check
    var isTizenWebapis = typeof window !== 'undefined' &&
                         window.webapis &&
                         typeof window.webapis.avplay === 'object' &&
                         window.webapis.avplay !== null;

    if (isTizenWebapis) {
      return 'samsung';
    }

    // 3. Browser environment with HTML5 Video support
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      return 'web';
    }

    return 'test';
  }

  var activeAdapter = null;
  var currentPlatform = detectPlatform();

  function getAdapter() {
    if (activeAdapter) return activeAdapter;

    currentPlatform = detectPlatform();

    if (currentPlatform === 'samsung') {
      if (window.FreeIPTV.AVPlayEngine) {
        activeAdapter = window.FreeIPTV.AVPlayEngine;
      }
    } else if (currentPlatform === 'web') {
      if (window.FreeIPTV.HTML5PlaybackAdapter) {
        activeAdapter = new window.FreeIPTV.HTML5PlaybackAdapter();
      }
    }

    // Fallback: If no adapter could be constructed, use AVPlayEngine (safe stubs)
    if (!activeAdapter) {
      activeAdapter = window.FreeIPTV.AVPlayEngine || null;
    }

    if (window.FreeIPTV.Logger && activeAdapter) {
      window.FreeIPTV.Logger.info('PlaybackManager initialized with engine: ' + currentPlatform);
    }

    return activeAdapter;
  }

  var PlayerManager = {
    detectPlatform: detectPlatform,

    getPlatform: function () {
      return currentPlatform;
    },

    getAdapter: getAdapter,

    setAdapter: function (adapter) {
      activeAdapter = adapter;
    },

    resetAdapter: function () {
      if (activeAdapter && typeof activeAdapter.destroy === 'function') {
        try { activeAdapter.destroy(); } catch (e) {}
      }
      activeAdapter = null;
      currentPlatform = detectPlatform();
    },

    // Delegate methods matching AVPlayEngine / HTML5PlaybackAdapter interface
    isAvailable: function () {
      var a = getAdapter();
      return a ? a.isAvailable() : false;
    },

    getState: function () {
      var a = getAdapter();
      return a ? a.getState() : 'IDLE';
    },

    getNativeState: function () {
      var a = getAdapter();
      return a && typeof a.getNativeState === 'function' ? a.getNativeState() : null;
    },

    getCurrentUrl: function () {
      var a = getAdapter();
      return a ? a.getCurrentUrl() : null;
    },

    isPlaying: function () {
      var a = getAdapter();
      return a ? a.isPlaying() : false;
    },

    isPaused: function () {
      var a = getAdapter();
      return a ? a.isPaused() : false;
    },

    setListener: function (listeners) {
      var a = getAdapter();
      if (a && typeof a.setListener === 'function') a.setListener(listeners);
    },

    open: function (url, isPreview) {
      var a = getAdapter();
      return a ? a.open(url, isPreview) : Promise.resolve(false);
    },

    prepare: function () {
      var a = getAdapter();
      return a ? a.prepare() : Promise.resolve(false);
    },

    play: function () {
      var a = getAdapter();
      return a ? a.play() : Promise.resolve(false);
    },

    pause: function () {
      var a = getAdapter();
      return a ? a.pause() : Promise.resolve(false);
    },

    stop: function () {
      var a = getAdapter();
      if (a && typeof a.stop === 'function') a.stop();
    },

    close: function () {
      var a = getAdapter();
      if (a && typeof a.close === 'function') a.close();
    },

    destroy: function () {
      var a = getAdapter();
      if (a && typeof a.destroy === 'function') a.destroy();
    },

    getDuration: function () {
      var a = getAdapter();
      return a ? a.getDuration() : 0;
    },

    getCurrentTime: function () {
      var a = getAdapter();
      return a ? a.getCurrentTime() : 0;
    },

    seekTo: function (timeMs) {
      var a = getAdapter();
      return a ? a.seekTo(timeMs) : Promise.resolve(false);
    },

    setDisplayArea: function (xOrRect, y, width, height) {
      var a = getAdapter();
      if (a && typeof a.setDisplayArea === 'function') a.setDisplayArea(xOrRect, y, width, height);
    },

    setDisplayMethod: function (mode) {
      var a = getAdapter();
      if (a && typeof a.setDisplayMethod === 'function') a.setDisplayMethod(mode);
    },

    getDisplayMethod: function () {
      var a = getAdapter();
      return a && typeof a.getDisplayMethod === 'function' ? a.getDisplayMethod() : 'FIT';
    },

    setVolume: function (vol) {
      var a = getAdapter();
      if (a && typeof a.setVolume === 'function') a.setVolume(vol);
    },

    getVolume: function () {
      var a = getAdapter();
      return a && typeof a.getVolume === 'function' ? a.getVolume() : 100;
    },

    setMute: function (muted) {
      var a = getAdapter();
      if (a && typeof a.setMute === 'function') a.setMute(muted);
    },

    isMuted: function () {
      var a = getAdapter();
      return a && typeof a.isMuted === 'function' ? a.isMuted() : false;
    },

    isInPreviewMode: function () {
      var a = getAdapter();
      return a && typeof a.isInPreviewMode === 'function' ? a.isInPreviewMode() : false;
    },

    startPreview: function (url, rect) {
      var a = getAdapter();
      return a && typeof a.startPreview === 'function' ? a.startPreview(url, rect) : Promise.resolve(false);
    },

    stopPreview: function () {
      var a = getAdapter();
      if (a && typeof a.stopPreview === 'function') a.stopPreview();
    },

    getTotalTrackInfo: function () {
      var a = getAdapter();
      return a && typeof a.getTotalTrackInfo === 'function' ? a.getTotalTrackInfo() : [];
    },

    setSelectTrack: function (type, index) {
      var a = getAdapter();
      return a && typeof a.setSelectTrack === 'function' ? a.setSelectTrack(type, index) : false;
    },

    getDiagnosticsString: function () {
      var a = getAdapter();
      if (a && typeof a.getDiagnosticsString === 'function') {
        return a.getDiagnosticsString();
      }
      return 'Platform: ' + currentPlatform + '\nEngine: Samsung AVPlay';
    }
  };

  window.FreeIPTV.PlayerManager = PlayerManager;
})(typeof window !== 'undefined' ? window : this);
