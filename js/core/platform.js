/**
 * Free IPTV Player — Cross-Platform Runtime Detector & OS Abstraction (Phase 1 WebOS)
 * Normalizes detection and OS-level capabilities across:
 * - Samsung Smart TV (Tizen OS)
 * - LG Smart TV (webOS TV)
 * - Standard Web Browser / Test Environment
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var Platform = {
    /**
     * Check if running on Samsung Tizen TV runtime.
     * @returns {boolean}
     */
    isTizen: function () {
      if (typeof window === 'undefined') return false;
      if (typeof window.tizen !== 'undefined') return true;
      if (window.webapis && typeof window.webapis.avplay === 'object' && window.webapis.avplay !== null) {
        return true;
      }
      return false;
    },

    /**
     * Check if running on LG webOS TV runtime.
     * Note: webOSTV.js always defines window.webOS with platform.unknown=true on non-LG devices,
     * so we check PalmSystem, webOS.platform.tv, or webOS userAgent signatures.
     * @returns {boolean}
     */
    isWebOS: function () {
      if (typeof window === 'undefined') return false;
      if (typeof window.PalmSystem !== 'undefined' && window.PalmSystem !== null) {
        return true;
      }
      if (window.webOS && window.webOS.platform && window.webOS.platform.tv === true) {
        return true;
      }
      if (window.navigator && typeof window.navigator.userAgent === 'string') {
        if (/web0s|webos|netcast/i.test(window.navigator.userAgent)) {
          return true;
        }
      }
      return false;
    },

    /**
     * Detect the active platform identifier.
     * @returns {'samsung'|'webos'|'web'|'test'}
     */
    detect: function () {
      if (typeof window !== 'undefined' && window.__FREEIPTV_USE_MOCK_PLAYER__) {
        return 'test';
      }
      if (this.isTizen()) {
        return 'samsung';
      }
      if (this.isWebOS()) {
        return 'webos';
      }
      if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        return 'web';
      }
      return 'test';
    },

    /**
     * Check if running in a standard desktop/mobile browser (neither Tizen nor webOS).
     * @returns {boolean}
     */
    isBrowser: function () {
      return this.detect() === 'web';
    },

    /**
     * Return a human-readable platform label for diagnostics and UI.
     * @returns {string}
     */
    getName: function () {
      var p = this.detect();
      if (p === 'samsung') return 'Samsung Tizen TV';
      if (p === 'webos') return 'LG webOS TV';
      if (p === 'web') return 'Web / Browser';
      return 'Test Environment';
    },

    /**
     * Exit or background the application using the native TV OS API.
     */
    exitApp: function () {
      try {
        if (this.isTizen() && window.tizen && window.tizen.application) {
          window.tizen.application.getCurrentApplication().exit();
          return;
        }
        if (this.isWebOS()) {
          if (window.webOS && typeof window.webOS.platformBack === 'function') {
            window.webOS.platformBack();
            return;
          }
          if (window.PalmSystem && typeof window.PalmSystem.platformBack === 'function') {
            window.PalmSystem.platformBack();
            return;
          }
        }
        if (typeof window.close === 'function') {
          window.close();
        }
      } catch (e) {
        if (window.FreeIPTV && window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.warn('Platform.exitApp failed:', e.message);
        }
      }
    },

    /**
     * Initialize OS-level lifecycle event listeners (webOS relaunch, visibility, low memory).
     */
    initLifecycle: function () {
      if (typeof document === 'undefined') return;

      // 1. webOS Launch & Relaunch Event Handlers
      document.addEventListener('webOSLaunch', function (e) {
        var detail = (e && e.detail) ? e.detail : {};
        if (window.FreeIPTV && window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.info('Platform: webOSLaunch event received');
        }
        if (window.FreeIPTV && window.FreeIPTV.Events) {
          window.FreeIPTV.Events.emit('APP_LAUNCH', detail);
        }
      });

      document.addEventListener('webOSRelaunch', function (e) {
        var detail = (e && e.detail) ? e.detail : {};
        if (window.FreeIPTV && window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.info('Platform: webOSRelaunch event received');
        }
        if (typeof window.PalmSystem !== 'undefined' && typeof window.PalmSystem.activate === 'function') {
          try {
            window.PalmSystem.activate();
          } catch (err) {}
        }
        if (window.FreeIPTV && window.FreeIPTV.Events) {
          window.FreeIPTV.Events.emit('APP_RELAUNCH', detail);
        }
      });

      // 2. Low Memory Handler (webOS sends lowMemory when TV RAM is under pressure)
      document.addEventListener('lowMemory', function () {
        if (window.FreeIPTV && window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.warn('Platform: webOS lowMemory signal received, purging volatile caches');
        }
        if (window.FreeIPTV && window.FreeIPTV.Events) {
          window.FreeIPTV.Events.emit('SYSTEM_LOW_MEMORY');
        }
      });

      // 3. Normalized App Visibility Handlers
      document.addEventListener('visibilitychange', function () {
        var isHidden = Boolean(document.hidden);
        if (window.FreeIPTV && window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.info('Platform: visibilitychange hidden=' + isHidden);
        }
        if (window.FreeIPTV && window.FreeIPTV.Events) {
          window.FreeIPTV.Events.emit('APP_VISIBILITY', { hidden: isHidden });
        }
      });
    }
  };

  window.FreeIPTV.Platform = Platform;
})(typeof window !== 'undefined' ? window : this);
