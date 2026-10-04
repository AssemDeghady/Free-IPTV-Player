/**
 * Free IPTV Player — Storage Abstraction
 * Resilient localStorage wrapper with in-memory fallback for Tizen TV environments.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var memoryStore = {};
  var isLocalStorageSupported = false;
  var KEY_PREFIX = 'fiptv_';

  // Test if localStorage is functional
  try {
    var testKey = '__fiptv_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    isLocalStorageSupported = true;
  } catch (e) {
    isLocalStorageSupported = false;
  }

  function getPrefixedKey(key) {
    if (typeof key !== 'string') {
      return KEY_PREFIX + String(key);
    }
    return key.indexOf(KEY_PREFIX) === 0 ? key : KEY_PREFIX + key;
  }

  var Storage = {
    /**
     * Check if persistent localStorage is available.
     * @returns {boolean}
     */
    isPersistent: function () {
      return isLocalStorageSupported;
    },

    /**
     * Retrieve a value by key.
     * @param {string} key
     * @param {*} [defaultValue=null]
     * @returns {*}
     */
    get: function (key, defaultValue) {
      if (defaultValue === undefined) {
        defaultValue = null;
      }
      var fullKey = getPrefixedKey(key);

      try {
        var rawValue = null;
        if (isLocalStorageSupported) {
          rawValue = window.localStorage.getItem(fullKey);
        }
        if (rawValue === null || rawValue === undefined) {
          rawValue = memoryStore.hasOwnProperty(fullKey) ? memoryStore[fullKey] : null;
        }

        if (rawValue === null || rawValue === undefined) {
          return defaultValue;
        }

        return JSON.parse(rawValue);
      } catch (error) {
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.warn('Storage.get failed for key ' + key + ', returning default:', error);
        }
        return defaultValue;
      }
    },

    /**
     * Store a value by key.
     * @param {string} key
     * @param {*} value
     * @returns {boolean} True if successfully stored
     */
    set: function (key, value) {
      var fullKey = getPrefixedKey(key);

      try {
        var serialized = JSON.stringify(value);

        if (isLocalStorageSupported) {
          window.localStorage.setItem(fullKey, serialized);
        } else {
          memoryStore[fullKey] = serialized;
        }
        return true;
      } catch (error) {
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.error('Storage.set failed for key ' + key + ':', error);
        }
        // Fallback to memory store if localStorage threw QuotaExceededError
        memoryStore[fullKey] = JSON.stringify(value);
        return false;
      }
    },

    /**
     * Remove a stored key.
     * @param {string} key
     * @returns {boolean}
     */
    remove: function (key) {
      var fullKey = getPrefixedKey(key);

      try {
        if (isLocalStorageSupported) {
          window.localStorage.removeItem(fullKey);
        }
        delete memoryStore[fullKey];
        return true;
      } catch (error) {
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.error('Storage.remove failed for key ' + key + ':', error);
        }
        return false;
      }
    },

    /**
     * Check if a key exists in storage.
     * @param {string} key
     * @returns {boolean}
     */
    has: function (key) {
      var fullKey = getPrefixedKey(key);
      if (isLocalStorageSupported && window.localStorage.getItem(fullKey) !== null) {
        return true;
      }
      return memoryStore.hasOwnProperty(fullKey);
    },

    /**
     * Clear all application storage keys.
     */
    clear: function () {
      try {
        if (isLocalStorageSupported) {
          var keysToRemove = [];
          for (var i = 0; i < window.localStorage.length; i++) {
            var k = window.localStorage.key(i);
            if (k && k.indexOf(KEY_PREFIX) === 0) {
              keysToRemove.push(k);
            }
          }
          for (var j = 0; j < keysToRemove.length; j++) {
            window.localStorage.removeItem(keysToRemove[j]);
          }
        }
        memoryStore = {};
        return true;
      } catch (error) {
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.error('Storage.clear failed:', error);
        }
        return false;
      }
    }
  };

  window.FreeIPTV.Storage = Storage;
})(window);
