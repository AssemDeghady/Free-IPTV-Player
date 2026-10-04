/**
 * Free IPTV Player — Lightweight Development Logger
 * Provides level-filtered, formatted logging for Tizen TV & development.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
  };

  var currentLevel = LOG_LEVELS.DEBUG;
  var APP_TAG = '[FreeIPTV]';

  function formatTime() {
    var now = new Date();
    return now.toTimeString().split(' ')[0] + '.' + ('00' + now.getMilliseconds()).slice(-3);
  }

  function sanitizeValue(val) {
    if (typeof val === 'string') {
      return val
        .replace(/([?&]password=)[^&]*/gi, '$1***')
        .replace(/(https?:\/\/[^:]+:)[^@]+(@)/gi, '$1***$2')
        .replace(/(\/live\/[^\/]+\/)[^\/]+(\/?)/gi, '$1***$2');
    }
    return val;
  }

  function logMessage(level, prefix, style, args) {
    if (level < currentLevel) {
      return;
    }

    var timestamp = formatTime();
    var header = APP_TAG + ' ' + prefix + ' [' + timestamp + ']';

    var rawArgs = Array.prototype.slice.call(args);
    var messageArgs = [header];
    for (var i = 0; i < rawArgs.length; i++) {
      messageArgs.push(sanitizeValue(rawArgs[i]));
    }

    if (window.console) {
      if (level === LOG_LEVELS.ERROR && console.error) {
        console.error.apply(console, messageArgs);
      } else if (level === LOG_LEVELS.WARN && console.warn) {
        console.warn.apply(console, messageArgs);
      } else if (level === LOG_LEVELS.INFO && console.info) {
        console.info.apply(console, messageArgs);
      } else if (console.log) {
        console.log.apply(console, messageArgs);
      }
    }
  }

  var Logger = {
    LEVELS: LOG_LEVELS,

    setLevel: function (level) {
      if (typeof level === 'number' && level >= LOG_LEVELS.DEBUG && level <= LOG_LEVELS.NONE) {
        currentLevel = level;
      }
    },

    getLevel: function () {
      return currentLevel;
    },

    debug: function () {
      logMessage(LOG_LEVELS.DEBUG, '[DEBUG]', 'color: #94a3b8', arguments);
    },

    info: function () {
      logMessage(LOG_LEVELS.INFO, '[INFO]', 'color: #60a5fa', arguments);
    },

    warn: function () {
      logMessage(LOG_LEVELS.WARN, '[WARN]', 'color: #f59e0b', arguments);
    },

    error: function () {
      logMessage(LOG_LEVELS.ERROR, '[ERROR]', 'color: #ef4444', arguments);
    }
  };

  window.FreeIPTV.Logger = Logger;
})(window);
