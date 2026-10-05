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
      }, true);
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
        if (event.stopPropagation) {
          event.stopPropagation();
        }
        this.handleBack();
        return;
      }

      var activeEl = document.activeElement;
      var targetEl = event.target;
      var isInput = (targetEl && (targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA')) ||
                    (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA'));
      if (isInput && (keyCode === Constants.KEYS.UP || keyCode === Constants.KEYS.DOWN)) {
        event.preventDefault();
        if (event.stopPropagation) {
          event.stopPropagation();
        }
        if (Navigation) {
          Navigation.move(keyCode === Constants.KEYS.UP ? Constants.DIRECTIONS.UP : Constants.DIRECTIONS.DOWN);
        }
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

        // Channel zapping via UP / DOWN (Live TV ONLY)
        var errorOverlay = document.getElementById('player-error-overlay');
        var isErrorShowing = errorOverlay && !errorOverlay.classList.contains('hidden');
        var media = Player.getCurrentMedia ? Player.getCurrentMedia() : (Player.currentMedia || null);
        var isLive = media && media.type === 'live';
        
        if (!isErrorShowing && isLive) {
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

        // Interactive Scrubber Timeline controls when timeline is focused
        var currentFocusEl = Navigation ? (Navigation.getCurrent ? Navigation.getCurrent() : document.activeElement) : null;
        var isTimelineFocused = currentFocusEl && currentFocusEl.id === 'player-seek-bar-track';

        if (isTimelineFocused && Player.handleTimelineKey) {
          if (keyCode === Constants.KEYS.LEFT) {
            Player.handleTimelineKey('left');
            event.preventDefault();
            return;
          } else if (keyCode === Constants.KEYS.RIGHT) {
            Player.handleTimelineKey('right');
            event.preventDefault();
            return;
          } else if (keyCode === Constants.KEYS.ENTER) {
            Player.handleTimelineKey('enter');
            event.preventDefault();
            return;
          }
        }

        var controlsOverlay = document.getElementById('player-controls-overlay');
        var isControlsHidden = controlsOverlay && controlsOverlay.classList.contains('hidden');

        // STATE A: Controls are HIDDEN -> Left / Right perform quick seek (+/-10s)
        // Any other nav key (Enter, Up, Down) wakes up controls and focuses play/pause.
        if (isControlsHidden) {
          if (!isLive && !isErrorShowing) {
            if (keyCode === Constants.KEYS.LEFT) {
              Player.seek(-10);
              event.preventDefault();
              return;
            } else if (keyCode === Constants.KEYS.RIGHT) {
              Player.seek(10);
              event.preventDefault();
              return;
            }
          }

          var isWakeNavKey = keyCode === Constants.KEYS.ENTER || 
                             keyCode === Constants.KEYS.UP || 
                             keyCode === Constants.KEYS.DOWN ||
                             keyCode === Constants.KEYS.LEFT ||
                             keyCode === Constants.KEYS.RIGHT;
          if (isWakeNavKey) {
            Player.showControls();
            if (Navigation) {
              var playBtn = document.getElementById('player-btn-play-pause');
              if (playBtn) Navigation.focus(playBtn);
            }
            event.preventDefault();
            return;
          }
        }
        // STATE B: Controls are VISIBLE -> do NOT seek on Left/Right!
        // Fall through to standard Navigation.move(LEFT/RIGHT) to navigate between player buttons.
      }

      // Player controls visible but focus is elsewhere (e.g. a hidden page behind the video):
      // pull focus into the visible controls so the remote drives what the user sees.
      if (Player && Player.isActive() && Navigation) {
        var errEl = document.getElementById('player-error-overlay');
        var errShown = errEl && !errEl.classList.contains('hidden');
        var curEl = Navigation.getCurrent ? Navigation.getCurrent() : null;
        var inCtl = curEl && curEl.closest && (curEl.closest('#player-controls-overlay') || curEl.closest('#player-error-overlay'));
        var navKey = keyCode === Constants.KEYS.ENTER || keyCode === Constants.KEYS.UP ||
                     keyCode === Constants.KEYS.DOWN || keyCode === Constants.KEYS.LEFT ||
                     keyCode === Constants.KEYS.RIGHT;
        if (navKey && !errShown && !inCtl) {
          var pBtn = document.getElementById('player-btn-play-pause');
          if (pBtn) {
            Navigation.focus(pBtn);
            event.preventDefault();
            return;
          }
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
            event.preventDefault();
            if (event.stopPropagation) {
              event.stopPropagation();
            }
            handled = Navigation.triggerActive();
            break;
        }
      }

      var isInput = event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA');
      if (handled || !isInput) {
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
