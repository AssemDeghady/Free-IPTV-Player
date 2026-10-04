/**
 * Free IPTV Player — Event Bus
 * Lightweight PubSub mechanism to decouple TV UI, navigation, and core modules.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var listeners = {};

  var Events = {
    /**
     * Subscribe to an event.
     * @param {string} eventName
     * @param {Function} callback
     */
    on: function (eventName, callback) {
      if (typeof eventName !== 'string' || typeof callback !== 'function') {
        return;
      }
      if (!listeners[eventName]) {
        listeners[eventName] = [];
      }
      listeners[eventName].push(callback);
    },

    /**
     * Subscribe to an event for one-time invocation.
     * @param {string} eventName
     * @param {Function} callback
     */
    once: function (eventName, callback) {
      if (typeof eventName !== 'string' || typeof callback !== 'function') {
        return;
      }
      var self = this;
      var onceWrapper = function (data) {
        self.off(eventName, onceWrapper);
        callback(data);
      };
      this.on(eventName, onceWrapper);
    },

    /**
     * Unsubscribe from an event.
     * @param {string} eventName
     * @param {Function} callback
     */
    off: function (eventName, callback) {
      if (!listeners[eventName]) {
        return;
      }
      if (!callback) {
        delete listeners[eventName];
        return;
      }
      listeners[eventName] = listeners[eventName].filter(function (cb) {
        return cb !== callback;
      });
    },

    /**
     * Emit an event to all subscribers.
     * @param {string} eventName
     * @param {*} [data]
     */
    emit: function (eventName, data) {
      if (!listeners[eventName]) {
        return;
      }
      var callbacks = listeners[eventName].slice();
      for (var i = 0; i < callbacks.length; i++) {
        try {
          callbacks[i](data);
        } catch (error) {
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.error('Error executing event handler for ' + eventName + ':', error);
          }
        }
      }
    },

    /**
     * Clear all event listeners (e.g. for testing / reset).
     */
    clear: function () {
      listeners = {};
    }
  };

  window.FreeIPTV.Events = Events;
})(window);
