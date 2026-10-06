/**
 * Free IPTV Player — Main Application Entry Point
 * Orchestrates module initialization, TV remote binding, and lifecycle events.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var App = {
    /**
     * Bootstrap the application.
     */
    init: function () {
      var FreeIPTV = window.FreeIPTV;

      try {
        // 1. Logger & Diagnostics
        if (FreeIPTV.Logger) {
          FreeIPTV.Logger.info('Free IPTV Player initializing (Phase 5 Complete IPTV Application)...');
        }
        if (FreeIPTV.Diagnostics) {
          FreeIPTV.Diagnostics.init();
        }

        // 2. Localization
        if (FreeIPTV.I18n) {
          FreeIPTV.I18n.init();
        }

        // 3. UI Views & Controllers
        if (FreeIPTV.Modal) {
          FreeIPTV.Modal.init();
        }
        if (FreeIPTV.LiveTV) {
          FreeIPTV.LiveTV.init();
        }
        if (FreeIPTV.Movies) {
          FreeIPTV.Movies.init();
        }
        if (FreeIPTV.Series) {
          FreeIPTV.Series.init();
        }
        if (FreeIPTV.Guide) {
          FreeIPTV.Guide.init();
        }
        if (FreeIPTV.Search) {
          FreeIPTV.Search.init();
        }
        if (FreeIPTV.Favorites) {
          FreeIPTV.Favorites.init();
        }
        if (FreeIPTV.Playlists) {
          FreeIPTV.Playlists.init();
        }
        if (FreeIPTV.Settings) {
          FreeIPTV.Settings.init();
        }
        if (FreeIPTV.Player) {
          FreeIPTV.Player.init();
        }
        if (FreeIPTV.Home) {
          FreeIPTV.Home.init();
        }

        // 4. Remote Input Device
        if (FreeIPTV.Remote) {
          FreeIPTV.Remote.init();
        }

        // 5. Navigation Engine
        if (FreeIPTV.Navigation) {
          FreeIPTV.Navigation.init();
        }

        // 6. Signal application ready
        if (FreeIPTV.Events && FreeIPTV.Constants) {
          FreeIPTV.Events.emit(FreeIPTV.Constants.EVENTS.APP_READY, {
            version: FreeIPTV.Constants.APP.VERSION,
            timestamp: Date.now()
          });
        }

        // 7. Dismiss splash screen smoothly (Phase 6.4)
        this.dismissSplash();

        if (FreeIPTV.Logger) {
          FreeIPTV.Logger.info('Free IPTV Player initialized successfully.');
        }
      } catch (error) {
        this.dismissSplash(0);
        if (window.console && console.error) {
          console.error('Fatal initialization error:', error);
        }
      }
    },

    /**
     * Dismiss splash/loading screen after application initialization.
     * Displays the brand logo and startup state for a minimum delay on startup.
     * @param {number} [delayMs=1200]
     */
    dismissSplash: function (delayMs) {
      var splash = document.getElementById('app-splash-screen');
      if (!splash) return;
      var delay = (typeof delayMs === 'number') ? delayMs : 1200;
      setTimeout(function () {
        splash.classList.add('fade-out');
        setTimeout(function () {
          splash.classList.add('hidden');
          splash.style.display = 'none';
        }, 400);
      }, delay);
    }
  };

  window.FreeIPTV.App = App;

  // Launch when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      App.init();
    });
  } else {
    App.init();
  }
})(window);
