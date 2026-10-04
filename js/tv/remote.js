/**
 * Free IPTV Player — Samsung TV Remote Controller
 * Registers Samsung Tizen input device keys and normalizes remote events.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var isTizenAvailable = typeof window.tizen !== 'undefined';
  var backHandlers = [];
  var isInitialized = false;

  var Remote = {
    /**
     * Initialize Samsung TV input device keys and global key listener.
     */
    init: function () {
      if (isInitialized) {
        return;
      }
      isInitialized = true;

      this.registerTizenKeys();
      this.bindKeyListeners();

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('Remote input system initialized (Tizen API ' + (isTizenAvailable ? 'available' : 'emulated/web') + ')');
      }
    },

    /**
     * Register required Samsung TV keys via Tizen TV Input Device API.
     */
    registerTizenKeys: function () {
      if (!isTizenAvailable || !window.tizen.tvinputdevice) {
        return;
      }

      var keysToRegister = [
        'MediaPlay',
        'MediaPause',
        'MediaPlayPause',
        'MediaStop',
        'MediaFastForward',
        'MediaRewind',
        'ColorF0Red',
        'ColorF1Green',
        'ColorF2Yellow',
        'ColorF3Blue'
      ];

      for (var i = 0; i < keysToRegister.length; i++) {
        try {
          window.tizen.tvinputdevice.registerKey(keysToRegister[i]);
        } catch (e) {
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.debug('Failed to register key ' + keysToRegister[i] + ':', e.message);
          }
        }
      }
    },

    /**
     * Attach global keyboard / remote listener.
     */
    bindKeyListeners: function () {
      var self = this;
      window.addEventListener('keydown', function (e) {
        self.handleKeyDown(e);
      });
    },

    /**
     * Handle incoming key event and dispatch to Navigation or Back handlers.
     * @param {KeyboardEvent} event
     */
    handleKeyDown: function (event) {
      var keyCode = event.keyCode;
      var Constants = window.FreeIPTV.Constants;
      var Navigation = window.FreeIPTV.Navigation;
      var Logger = window.FreeIPTV.Logger;

      if (Logger) {
        Logger.debug('Key pressed: keyCode=' + keyCode + ', key=' + event.key);
      }

      // Check for Back / Return key
      if (
        keyCode === Constants.KEYS.RETURN_TIZEN ||
        keyCode === Constants.KEYS.ESCAPE ||
        keyCode === Constants.KEYS.BACKSPACE
      ) {
        // If focus is in an input field, let normal backspace work
        if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) {
          if (keyCode === Constants.KEYS.BACKSPACE) {
            return;
          }
        }

        event.preventDefault();
        this.handleBack();
        return;
      }

      // Player-specific controls when Player is active
      var Player = window.FreeIPTV.Player;
      if (Player && Player.isActive()) {
        Player.resetControlsTimer();

        // Dedicated Media keys
        if (keyCode === Constants.KEYS.PLAY) {
          if (window.FreeIPTV.AVPlayEngine) window.FreeIPTV.AVPlayEngine.play();
          event.preventDefault();
          return;
        } else if (keyCode === Constants.KEYS.PAUSE) {
          if (window.FreeIPTV.AVPlayEngine) window.FreeIPTV.AVPlayEngine.pause();
          event.preventDefault();
          return;
        } else if (keyCode === Constants.KEYS.PLAY_PAUSE) {
          Player.togglePlayPause();
          event.preventDefault();
          return;
        } else if (keyCode === Constants.KEYS.STOP) {
          Player.closePlayer();
          event.preventDefault();
          return;
        }

        // Channel zapping via UP / DOWN
        var errorOverlay = document.getElementById('player-error-overlay');
        var isErrorShowing = errorOverlay && !errorOverlay.classList.contains('hidden');
        if (!isErrorShowing) {
          if (keyCode === Constants.KEYS.UP) {
            Player.zapPrevious();
            event.preventDefault();
            return;
          } else if (keyCode === Constants.KEYS.DOWN) {
            Player.zapNext();
            event.preventDefault();
            return;
          }
        }

        // OK / ENTER when controls are hidden
        var controlsOverlay = document.getElementById('player-controls-overlay');
        var isControlsHidden = controlsOverlay && controlsOverlay.classList.contains('hidden');
        if (keyCode === Constants.KEYS.ENTER && isControlsHidden) {
          Player.showControls();
          if (Navigation) {
            var playBtn = document.getElementById('player-btn-play-pause');
            if (playBtn) Navigation.focus(playBtn);
          }
          event.preventDefault();
          return;
        }
      }

      // Directional & Action keys
      var handled = false;
      if (Navigation) {
        switch (keyCode) {
          case Constants.KEYS.UP:
            handled = Navigation.move(Constants.DIRECTIONS.UP);
            break;
          case Constants.KEYS.DOWN:
            handled = Navigation.move(Constants.DIRECTIONS.DOWN);
            break;
          case Constants.KEYS.LEFT:
            handled = Navigation.move(Constants.DIRECTIONS.LEFT);
            break;
          case Constants.KEYS.RIGHT:
            handled = Navigation.move(Constants.DIRECTIONS.RIGHT);
            break;
          case Constants.KEYS.ENTER:
            handled = Navigation.triggerActive();
            break;
        }
      }

      if (handled) {
        event.preventDefault();
      }
    },

    /**
     * Centralized Back handler with customizable stack.
     */
    handleBack: function () {
      // Execute top-most custom back handler if registered
      if (backHandlers.length > 0) {
        var handler = backHandlers[backHandlers.length - 1];
        var consumed = handler();
        if (consumed) {
          return;
        }
      }

      // Default back navigation in Navigation Engine
      var Navigation = window.FreeIPTV.Navigation;
      if (Navigation && Navigation.handleBack()) {
        return;
      }

      // If at root level, exit application gracefully on Samsung TV
      this.exitApplication();
    },

    /**
     * Push a back handler onto the stack.
     * @param {Function} handler returns true if back was consumed
     */
    pushBackHandler: function (handler) {
      if (typeof handler === 'function') {
        backHandlers.push(handler);
      }
    },

    /**
     * Pop the top back handler from the stack.
     */
    popBackHandler: function () {
      return backHandlers.pop();
    },

    /**
     * Exit application on Tizen TV or close window.
     */
    exitApplication: function () {
      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('Exiting application...');
      }

      if (isTizenAvailable && window.tizen.application) {
        try {
          window.tizen.application.getCurrentApplication().exit();
        } catch (e) {
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.error('Failed to exit via Tizen API:', e);
          }
        }
      } else {
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.info('App exit requested (web environment).');
        }
      }
    }
  };

  window.FreeIPTV.Remote = Remote;
})(window);
