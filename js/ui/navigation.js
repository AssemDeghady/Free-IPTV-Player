/**
 * Free IPTV Player — TV Navigation & Focus Manager
 * Reusable spatial and zone-based focus management for 10-foot TV interfaces.
 * Supports Live TV, VOD Movies, TV Series, TV Guide (EPG), Global Search, and Unified Favorites.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var currentElement = null;
  var zoneHistory = {}; // Remembers last focused element per zone

  var Navigation = {
    /**
     * Initialize navigation system.
     * Sets initial focus to default or primary sidebar item.
     */
    init: function () {
      this.bindMouseHoverProtection();
      this.setInitialFocus();

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('Navigation Engine initialized.');
      }
    },

    /**
     * Prevent mouse movement from accidentally stealing remote focus on TVs with air-mouse remotes.
     */
    bindMouseHoverProtection: function () {
      var self = this;
      document.addEventListener('click', function (e) {
        var focusable = e.target.closest('.focusable');
        if (focusable) {
          self.focus(focusable);
        }
      });
    },

    /**
     * Set initial focus on app launch.
     */
    setInitialFocus: function () {
      var initial = document.querySelector('[data-initial-focus="true"]') ||
                    document.querySelector('.app-sidebar .focusable.active') ||
                    document.querySelector('.app-sidebar .focusable') ||
                    document.querySelector('.focusable');
      if (initial) {
        this.focus(initial);
      }
    },

    /**
     * Get the currently focused element.
     * @returns {HTMLElement|null}
     */
    getCurrent: function () {
      return currentElement;
    },

    /**
     * Set focus to a target DOM element.
     * @param {HTMLElement|string} target Element or selector
     */
    focus: function (target) {
      var el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el || el === currentElement) {
        return;
      }

      if (currentElement) {
        currentElement.classList.remove('focused');
      }

      currentElement = el;
      currentElement.classList.add('focused');

      try {
        currentElement.focus();
        if (currentElement.scrollIntoViewIfNeeded) {
          currentElement.scrollIntoViewIfNeeded(false);
        } else if (currentElement.scrollIntoView) {
          currentElement.scrollIntoView({ block: 'nearest' });
        }
      } catch (e) {
        // Safe fallback
      }

      // Record last focused item for this zone
      var zone = this.getElementZone(currentElement);
      if (zone) {
        zoneHistory[zone] = currentElement;
      }

      // Check if more channels should be rendered
      if (zone === 'live_channels' && window.FreeIPTV.LiveTV) {
        window.FreeIPTV.LiveTV.checkLoadMore(currentElement);
      }

      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.NAV_FOCUS_CHANGED, {
          element: currentElement,
          zone: zone
        });
      }
    },

    /**
     * Determine the navigation zone of an element.
     * @param {HTMLElement} el
     * @returns {string}
     */
    getElementZone: function (el) {
      if (!el) return null;
      var explicitZone = el.getAttribute('data-nav-zone');
      if (explicitZone) return explicitZone;

      if (el.closest('#live-epg-pane')) return 'live_epg';
      if (el.closest('#settings-diagnostics-panel')) return 'settings_diagnostics';
      if (el.closest('#movie-details-modal')) return 'movie_details';
      if (el.closest('#series-details-modal')) return 'series_details';
      if (el.closest('#player-error-overlay')) return 'player_error';
      if (el.closest('#player-controls-overlay')) return 'player_controls';
      if (el.closest('#modal-overlay')) return 'modal';
      if (el.closest('.app-header')) return 'header';
      if (el.closest('.app-sidebar')) return 'sidebar';
      if (el.closest('#live-categories-list')) return 'live_categories';
      if (el.closest('#live-channels-container')) return 'live_channels';
      if (el.closest('#movies-categories-list')) return 'movies_categories';
      if (el.closest('#movies-grid-container')) return 'movies_grid';
      if (el.closest('#series-categories-list')) return 'series_categories';
      if (el.closest('#series-grid-container')) return 'series_grid';
      if (el.closest('#guide-channels-list')) return 'guide_channels';
      if (el.closest('#guide-program-details')) return 'guide_programs';
      if (el.closest('#global-search-input')) return 'search_input';
      if (el.closest('#global-search-results')) return 'search_results';
      if (el.closest('#favorites-tabs-row')) return 'favorites_tabs';
      if (el.closest('#favorites-grid-container')) return 'favorites_grid';
      if (el.closest('#playlists-list-container')) return 'playlists_grid';
      if (el.closest('#view-playlists')) return 'playlists_actions';
      if (el.closest('#view-settings')) return 'settings_actions';
      if (el.closest('.app-content')) return 'main';
      return 'default';
    },

    /**
     * Trigger action (Enter / OK press) on currently focused element.
     * @returns {boolean} True if handled
     */
    triggerActive: function () {
      if (!currentElement) {
        return false;
      }

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.debug('Trigger action on:', currentElement);
      }

      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.NAV_ACTION_TRIGGERED, {
          element: currentElement,
          zone: this.getElementZone(currentElement)
        });
      }

      currentElement.click();
      return true;
    },

    /**
     * Directional move handler (Up, Down, Left, Right).
     * Automatically inverts Left/Right when RTL (Arabic) is active.
     * @param {string} direction ('up'|'down'|'left'|'right')
     * @returns {boolean} True if movement occurred
     */
    move: function (direction) {
      if (!currentElement) {
        this.setInitialFocus();
        return true;
      }

      var Constants = window.FreeIPTV.Constants;
      var I18n = window.FreeIPTV.I18n;
      var isRTL = I18n ? I18n.isRTL() : false;

      // Handle RTL mirror for horizontal directions
      var effectiveDirection = direction;
      if (isRTL) {
        if (direction === Constants.DIRECTIONS.LEFT) {
          effectiveDirection = Constants.DIRECTIONS.RIGHT;
        } else if (direction === Constants.DIRECTIONS.RIGHT) {
          effectiveDirection = Constants.DIRECTIONS.LEFT;
        }
      }

      // 1. Check for explicit directional override on the element
      var explicitTarget = currentElement.getAttribute('data-nav-' + effectiveDirection);
      if (explicitTarget) {
        var targetEl = document.querySelector(explicitTarget);
        if (targetEl) {
          this.focus(targetEl);
          return true;
        }
      }

      // 2. Zone-based intelligent navigation
      var currentZone = this.getElementZone(currentElement);
      var nextElement = this.calculateNextElement(currentZone, effectiveDirection);

      if (nextElement && nextElement !== currentElement) {
        this.focus(nextElement);
        return true;
      }

      return false;
    },

    /**
     * Compute next target element based on zone and direction.
     * @param {string} zone
     * @param {string} direction
     * @returns {HTMLElement|null}
     */
    calculateNextElement: function (zone, direction) {
      var Constants = window.FreeIPTV.Constants;

      if (zone === 'player_controls') {
        return this.handlePlayerControlsNavigation(direction);
      } else if (zone === 'player_error') {
        return this.handlePlayerErrorNavigation(direction);
      } else if (zone === 'modal') {
        return this.handleModalNavigation(direction);
      } else if (zone === 'movie_details') {
        return this.handleMovieDetailsNavigation(direction);
      } else if (zone === 'series_details') {
        return this.handleSeriesDetailsNavigation(direction);
      } else if (zone === Constants.NAV_ZONES.SIDEBAR) {
        return this.handleSidebarNavigation(direction);
      } else if (zone === 'live_categories') {
        return this.handleLiveCategoriesNavigation(direction);
      } else if (zone === 'live_channels') {
        return this.handleLiveChannelsNavigation(direction);
      } else if (zone === 'live_epg') {
        return this.handleLiveEpgNavigation(direction);
      } else if (zone === 'movies_categories' || zone === 'movies_grid') {
        return this.handleMoviesNavigation(zone, direction);
      } else if (zone === 'series_categories' || zone === 'series_grid') {
        return this.handleSeriesNavigation(zone, direction);
      } else if (zone === 'guide_channels' || zone === 'guide_programs') {
        return this.handleGuideNavigation(zone, direction);
      } else if (zone === 'search_input' || zone === 'search_results') {
        return this.handleSearchNavigation(zone, direction);
      } else if (zone === 'favorites_tabs' || zone === 'favorites_grid') {
        return this.handleFavoritesNavigation(zone, direction);
      } else if (zone === 'playlists_actions' || zone === 'playlists_grid') {
        return this.handlePlaylistsNavigation(zone, direction);
      } else if (zone === 'settings_actions' || zone === 'settings_diagnostics') {
        return this.handleSettingsNavigation(direction);
      } else if (zone === Constants.NAV_ZONES.MAIN) {
        return this.handleMainNavigation(direction);
      } else if (zone === Constants.NAV_ZONES.HEADER) {
        return this.handleHeaderNavigation(direction);
      }

      return null;
    },

    /**
     * Player controls navigation rules.
     */
    handlePlayerControlsNavigation: function (direction) {
      var Constants = window.FreeIPTV.Constants;
      var buttons = Array.prototype.slice.call(document.querySelectorAll('#player-controls-overlay .focusable:not(.hidden)'));
      var index = buttons.indexOf(currentElement);

      if (direction === Constants.DIRECTIONS.RIGHT) {
        if (index < buttons.length - 1) return buttons[index + 1];
        return buttons[0];
      } else if (direction === Constants.DIRECTIONS.LEFT) {
        if (index > 0) return buttons[index - 1];
        return buttons[buttons.length - 1];
      }

      return null;
    },

    /**
     * Player error dialog navigation rules.
     */
    handlePlayerErrorNavigation: function (direction) {
      var Constants = window.FreeIPTV.Constants;
      var buttons = Array.prototype.slice.call(document.querySelectorAll('#player-error-overlay .focusable'));
      var index = buttons.indexOf(currentElement);

      if (direction === Constants.DIRECTIONS.RIGHT || direction === Constants.DIRECTIONS.DOWN) {
        if (index < buttons.length - 1) return buttons[index + 1];
      } else if (direction === Constants.DIRECTIONS.LEFT || direction === Constants.DIRECTIONS.UP) {
        if (index > 0) return buttons[index - 1];
      }

      return null;
    },

    /**
     * Movie Details modal navigation rules.
     */
    handleMovieDetailsNavigation: function (direction) {
      var Constants = window.FreeIPTV.Constants;
      var modal = document.getElementById('movie-details-modal');
      if (!modal) return null;

      var buttons = Array.prototype.slice.call(modal.querySelectorAll('.focusable:not([disabled])')).filter(function (el) {
        return el.offsetParent !== null;
      });
      var idx = buttons.indexOf(currentElement);
      if (idx === -1) return buttons[0] || null;

      if (direction === Constants.DIRECTIONS.RIGHT || direction === Constants.DIRECTIONS.DOWN) {
        if (idx < buttons.length - 1) return buttons[idx + 1];
      } else if (direction === Constants.DIRECTIONS.LEFT || direction === Constants.DIRECTIONS.UP) {
        if (idx > 0) return buttons[idx - 1];
      }

      return null;
    },

    /**
     * Series Details modal navigation rules.
     */
    handleSeriesDetailsNavigation: function (direction) {
      var Constants = window.FreeIPTV.Constants;
      var modal = document.getElementById('series-details-modal');
      if (!modal) return null;

      var seasons = Array.prototype.slice.call(modal.querySelectorAll('.series-season-tab.focusable'));
      var episodes = Array.prototype.slice.call(modal.querySelectorAll('.series-episode-card.focusable'));
      var actions = Array.prototype.slice.call(modal.querySelectorAll('.series-details-actions .focusable'));

      var isSeason = seasons.indexOf(currentElement) !== -1;
      var isEpisode = episodes.indexOf(currentElement) !== -1;
      var isAction = actions.indexOf(currentElement) !== -1;

      if (isAction) {
        var actIdx = actions.indexOf(currentElement);
        if (direction === Constants.DIRECTIONS.RIGHT && actIdx < actions.length - 1) return actions[actIdx + 1];
        if (direction === Constants.DIRECTIONS.LEFT && actIdx > 0) return actions[actIdx - 1];
        if (direction === Constants.DIRECTIONS.DOWN) return seasons[0] || episodes[0] || null;
      } else if (isSeason) {
        var sIdx = seasons.indexOf(currentElement);
        if (direction === Constants.DIRECTIONS.RIGHT && sIdx < seasons.length - 1) return seasons[sIdx + 1];
        if (direction === Constants.DIRECTIONS.LEFT && sIdx > 0) return seasons[sIdx - 1];
        if (direction === Constants.DIRECTIONS.UP) return actions[0] || null;
        if (direction === Constants.DIRECTIONS.DOWN) return episodes[0] || null;
      } else if (isEpisode) {
        var epIdx = episodes.indexOf(currentElement);
        if (direction === Constants.DIRECTIONS.DOWN && epIdx < episodes.length - 1) return episodes[epIdx + 1];
        if (direction === Constants.DIRECTIONS.UP) {
          if (epIdx > 0) return episodes[epIdx - 1];
          return seasons[0] || actions[0] || null;
        }
      }

      return null;
    },

    /**
     * Modal navigation trap and 2D spatial routing.
     */
    handleModalNavigation: function (direction) {
      var Constants = window.FreeIPTV.Constants;
      var modalOverlay = document.getElementById('modal-overlay');
      if (!modalOverlay) return null;

      var errorState = document.getElementById('modal-state-error');
      if (errorState && !errorState.classList.contains('hidden')) {
        var errorActions = Array.prototype.slice.call(errorState.querySelectorAll('.focusable:not([disabled])')).filter(function (el) {
          return el.offsetParent !== null;
        });
        var errIdx = errorActions.indexOf(currentElement);
        if (errIdx === -1) return errorActions[0] || null;
        if (direction === Constants.DIRECTIONS.RIGHT || direction === Constants.DIRECTIONS.DOWN) {
          if (errIdx < errorActions.length - 1) return errorActions[errIdx + 1];
        } else if (direction === Constants.DIRECTIONS.LEFT || direction === Constants.DIRECTIONS.UP) {
          if (errIdx > 0) return errorActions[errIdx - 1];
        }
        return null;
      }

      var tabs = Array.prototype.slice.call(modalOverlay.querySelectorAll('.provider-tabs .focusable:not([disabled])')).filter(function (el) {
        return el.offsetParent !== null;
      });
      var activePanel = modalOverlay.querySelector('.modal-provider-panel:not(.hidden)');
      var inputs = activePanel ? Array.prototype.slice.call(activePanel.querySelectorAll('.form-input.focusable:not([disabled])')).filter(function (el) {
        return el.offsetParent !== null;
      }) : [];
      var actions = activePanel ? Array.prototype.slice.call(activePanel.querySelectorAll('.modal-actions .focusable:not([disabled])')).filter(function (el) {
        return el.offsetParent !== null;
      }) : [];

      var isTab = tabs.indexOf(currentElement) !== -1;
      var isInput = inputs.indexOf(currentElement) !== -1;
      var isAction = actions.indexOf(currentElement) !== -1;

      if (isTab) {
        var tabIdx = tabs.indexOf(currentElement);
        if (direction === Constants.DIRECTIONS.RIGHT) {
          if (tabIdx < tabs.length - 1) return tabs[tabIdx + 1];
        } else if (direction === Constants.DIRECTIONS.LEFT) {
          if (tabIdx > 0) return tabs[tabIdx - 1];
        } else if (direction === Constants.DIRECTIONS.DOWN) {
          return inputs[0] || actions[0] || null;
        }
        return null;
      }

      if (isInput) {
        var inputIdx = inputs.indexOf(currentElement);
        if (direction === Constants.DIRECTIONS.DOWN) {
          if (inputIdx < inputs.length - 1) return inputs[inputIdx + 1];
          return actions[0] || null;
        } else if (direction === Constants.DIRECTIONS.UP) {
          if (inputIdx > 0) return inputs[inputIdx - 1];
          return modalOverlay.querySelector('.provider-tab-btn.active') || tabs[0] || null;
        }
        return null;
      }

      if (isAction) {
        var actionIdx = actions.indexOf(currentElement);
        if (direction === Constants.DIRECTIONS.RIGHT) {
          if (actionIdx < actions.length - 1) return actions[actionIdx + 1];
        } else if (direction === Constants.DIRECTIONS.LEFT) {
          if (actionIdx > 0) return actions[actionIdx - 1];
        } else if (direction === Constants.DIRECTIONS.UP) {
          return inputs[inputs.length - 1] || null;
        }
        return null;
      }

      return null;
    },

    /**
     * Sidebar navigation rules.
     */
    handleSidebarNavigation: function (direction) {
      var Constants = window.FreeIPTV.Constants;
      var sidebarItems = Array.prototype.slice.call(document.querySelectorAll('.app-sidebar .focusable'));
      var index = sidebarItems.indexOf(currentElement);

      if (direction === Constants.DIRECTIONS.DOWN) {
        if (index < sidebarItems.length - 1) {
          return sidebarItems[index + 1];
        }
      } else if (direction === Constants.DIRECTIONS.UP) {
        if (index > 0) {
          return sidebarItems[index - 1];
        } else {
          return document.querySelector('.app-header .focusable') || sidebarItems[0];
        }
      } else if (direction === Constants.DIRECTIONS.RIGHT) {
        var activeRoute = currentElement.getAttribute('data-route');

        if (activeRoute === 'live_tv') {
          return zoneHistory.live_categories ||
                 document.querySelector('#live-categories-list .focusable') ||
                 document.querySelector('#view-live_tv .focusable') ||
                 document.querySelector('#view-live-tv .focusable');
        } else if (activeRoute === 'movies') {
          return zoneHistory.movies_categories ||
                 document.querySelector('#movies-categories-list .focusable') ||
                 document.querySelector('#movies-grid-container .focusable');
        } else if (activeRoute === 'series') {
          return zoneHistory.series_categories ||
                 document.querySelector('#series-categories-list .focusable') ||
                 document.querySelector('#series-grid-container .focusable');
        } else if (activeRoute === 'guide') {
          return zoneHistory.guide_channels ||
                 document.querySelector('#guide-channels-list .focusable');
        } else if (activeRoute === 'search') {
          return document.getElementById('global-search-input') ||
                 document.querySelector('#view-search .focusable');
        } else if (activeRoute === 'favorites') {
          return zoneHistory.favorites_tabs ||
                 document.querySelector('#favorites-tabs-row .focusable') ||
                 document.querySelector('#favorites-grid-container .focusable');
        } else if (activeRoute === 'playlists') {
          return zoneHistory.playlists_actions ||
                 document.querySelector('#view-playlists .focusable');
        } else if (activeRoute === 'settings') {
          return zoneHistory.settings_actions ||
                 document.querySelector('#view-settings .focusable');
        }

        var lastMain = zoneHistory[Constants.NAV_ZONES.MAIN];
        if (lastMain && document.body.contains(lastMain) && lastMain.offsetParent !== null) {
          return lastMain;
        }
        return document.querySelector('.view-screen:not(.hidden) .focusable');
      }

      return null;
    },

    /**
     * Live TV Categories Navigation rules.
     */
    handleLiveCategoriesNavigation: function (direction) {
      var Constants = window.FreeIPTV.Constants;
      var catItems = Array.prototype.slice.call(document.querySelectorAll('#live-categories-list .focusable'));
      var index = catItems.indexOf(currentElement);

      if (direction === Constants.DIRECTIONS.DOWN) {
        if (index < catItems.length - 1) return catItems[index + 1];
      } else if (direction === Constants.DIRECTIONS.UP) {
        if (index > 0) return catItems[index - 1];
        return document.getElementById('live-search-input') || catItems[0];
      } else if (direction === Constants.DIRECTIONS.RIGHT) {
        var lastChannel = zoneHistory.live_channels;
        if (lastChannel && document.body.contains(lastChannel) && lastChannel.offsetParent !== null) {
          return lastChannel;
        }
        return document.querySelector('#live-channels-container .focusable');
      } else if (direction === Constants.DIRECTIONS.LEFT) {
        return document.querySelector('.app-sidebar .focusable.active') ||
               document.querySelector('.app-sidebar .focusable');
      }

      return null;
    },

    /**
     * Live TV Channels Navigation rules.
     */
    handleLiveChannelsNavigation: function (direction) {
      var Constants = window.FreeIPTV.Constants;
      var channelItems = Array.prototype.slice.call(document.querySelectorAll('#live-channels-container .focusable'));
      var index = channelItems.indexOf(currentElement);

      if (direction === Constants.DIRECTIONS.DOWN) {
        if (index < channelItems.length - 1) return channelItems[index + 1];
      } else if (direction === Constants.DIRECTIONS.UP) {
        if (index > 0) return channelItems[index - 1];
        return document.getElementById('live-search-input');
      } else if (direction === Constants.DIRECTIONS.LEFT) {
        var lastCat = zoneHistory.live_categories;
        if (lastCat && document.body.contains(lastCat)) return lastCat;
        return document.querySelector('#live-categories-list .focusable.active') ||
               document.querySelector('#live-categories-list .focusable');
      } else if (direction === Constants.DIRECTIONS.RIGHT) {
        var epgFocusable = document.querySelector('#live-epg-pane .focusable');
        if (epgFocusable) return epgFocusable;
      }

      return null;
    },

    /**
     * Live TV EPG Pane Navigation rules.
     */
    handleLiveEpgNavigation: function (direction) {
      var Constants = window.FreeIPTV.Constants;
      if (direction === Constants.DIRECTIONS.LEFT) {
        return zoneHistory.live_channels ||
               document.querySelector('#live-channels-container .focusable.focused') ||
               document.querySelector('#live-channels-container .focusable');
      }

      var epgItems = Array.prototype.slice.call(document.querySelectorAll('#live-epg-pane .focusable'));
      var idx = epgItems.indexOf(currentElement);
      if (idx !== -1) {
        if (direction === Constants.DIRECTIONS.DOWN && idx < epgItems.length - 1) return epgItems[idx + 1];
        if (direction === Constants.DIRECTIONS.UP && idx > 0) return epgItems[idx - 1];
      }
      return null;
    },

    /**
     * Movies View navigation rules (Categories <-> 2D Grid).
     */
    handleMoviesNavigation: function (zone, direction) {
      var Constants = window.FreeIPTV.Constants;

      if (zone === 'movies_categories') {
        var catItems = Array.prototype.slice.call(document.querySelectorAll('#movies-categories-list .focusable'));
        var idx = catItems.indexOf(currentElement);

        if (direction === Constants.DIRECTIONS.DOWN && idx < catItems.length - 1) return catItems[idx + 1];
        if (direction === Constants.DIRECTIONS.UP && idx > 0) return catItems[idx - 1];
        if (direction === Constants.DIRECTIONS.LEFT) {
          return document.querySelector('.app-sidebar .focusable.active') || document.querySelector('.app-sidebar .focusable');
        }
        if (direction === Constants.DIRECTIONS.RIGHT) {
          return zoneHistory.movies_grid || document.querySelector('#movies-grid-container .focusable');
        }
      } else if (zone === 'movies_grid') {
        var gridItems = Array.prototype.slice.call(document.querySelectorAll('#movies-grid-container .focusable'));
        var gIdx = gridItems.indexOf(currentElement);
        var COLS = 5;

        if (direction === Constants.DIRECTIONS.RIGHT && gIdx < gridItems.length - 1) return gridItems[gIdx + 1];
        if (direction === Constants.DIRECTIONS.LEFT) {
          if (gIdx % COLS === 0) {
            return zoneHistory.movies_categories || document.querySelector('#movies-categories-list .focusable');
          }
          if (gIdx > 0) return gridItems[gIdx - 1];
        }
        if (direction === Constants.DIRECTIONS.DOWN && gIdx + COLS < gridItems.length) return gridItems[gIdx + COLS];
        if (direction === Constants.DIRECTIONS.UP && gIdx - COLS >= 0) return gridItems[gIdx - COLS];
      }

      return null;
    },

    /**
     * Series View navigation rules (Categories <-> 2D Grid).
     */
    handleSeriesNavigation: function (zone, direction) {
      var Constants = window.FreeIPTV.Constants;

      if (zone === 'series_categories') {
        var catItems = Array.prototype.slice.call(document.querySelectorAll('#series-categories-list .focusable'));
        var idx = catItems.indexOf(currentElement);

        if (direction === Constants.DIRECTIONS.DOWN && idx < catItems.length - 1) return catItems[idx + 1];
        if (direction === Constants.DIRECTIONS.UP && idx > 0) return catItems[idx - 1];
        if (direction === Constants.DIRECTIONS.LEFT) {
          return document.querySelector('.app-sidebar .focusable.active') || document.querySelector('.app-sidebar .focusable');
        }
        if (direction === Constants.DIRECTIONS.RIGHT) {
          return zoneHistory.series_grid || document.querySelector('#series-grid-container .focusable');
        }
      } else if (zone === 'series_grid') {
        var gridItems = Array.prototype.slice.call(document.querySelectorAll('#series-grid-container .focusable'));
        var gIdx = gridItems.indexOf(currentElement);
        var COLS = 5;

        if (direction === Constants.DIRECTIONS.RIGHT && gIdx < gridItems.length - 1) return gridItems[gIdx + 1];
        if (direction === Constants.DIRECTIONS.LEFT) {
          if (gIdx % COLS === 0) {
            return zoneHistory.series_categories || document.querySelector('#series-categories-list .focusable');
          }
          if (gIdx > 0) return gridItems[gIdx - 1];
        }
        if (direction === Constants.DIRECTIONS.DOWN && gIdx + COLS < gridItems.length) return gridItems[gIdx + COLS];
        if (direction === Constants.DIRECTIONS.UP && gIdx - COLS >= 0) return gridItems[gIdx - COLS];
      }

      return null;
    },

    /**
     * TV Guide Navigation rules (Channels column <-> Program details / Watch button).
     */
    handleGuideNavigation: function (zone, direction) {
      var Constants = window.FreeIPTV.Constants;

      if (zone === 'guide_channels') {
        var chItems = Array.prototype.slice.call(document.querySelectorAll('#guide-channels-list .focusable'));
        var idx = chItems.indexOf(currentElement);

        if (direction === Constants.DIRECTIONS.DOWN && idx < chItems.length - 1) return chItems[idx + 1];
        if (direction === Constants.DIRECTIONS.UP && idx > 0) return chItems[idx - 1];
        if (direction === Constants.DIRECTIONS.LEFT) {
          return document.querySelector('.app-sidebar .focusable.active') || document.querySelector('.app-sidebar .focusable');
        }
        if (direction === Constants.DIRECTIONS.RIGHT) {
          return document.getElementById('guide-btn-watch') || document.querySelector('#guide-program-details .focusable');
        }
      } else if (zone === 'guide_programs') {
        if (direction === Constants.DIRECTIONS.LEFT) {
          return zoneHistory.guide_channels || document.querySelector('#guide-channels-list .focusable.active');
        }
      }

      return null;
    },

    /**
     * Global Search Navigation rules (Input <-> Results grid).
     */
    handleSearchNavigation: function (zone, direction) {
      var Constants = window.FreeIPTV.Constants;

      if (zone === 'search_input') {
        if (direction === Constants.DIRECTIONS.DOWN) {
          return document.querySelector('#global-search-results .focusable');
        }
        if (direction === Constants.DIRECTIONS.LEFT) {
          return document.querySelector('.app-sidebar .focusable.active') || document.querySelector('.app-sidebar .focusable');
        }
      } else if (zone === 'search_results') {
        var resItems = Array.prototype.slice.call(document.querySelectorAll('#global-search-results .focusable'));
        var idx = resItems.indexOf(currentElement);

        if (direction === Constants.DIRECTIONS.RIGHT && idx < resItems.length - 1) return resItems[idx + 1];
        if (direction === Constants.DIRECTIONS.LEFT) {
          if (idx > 0) return resItems[idx - 1];
          return document.querySelector('.app-sidebar .focusable.active');
        }
        if (direction === Constants.DIRECTIONS.UP) {
          return document.getElementById('global-search-input');
        }
        if (direction === Constants.DIRECTIONS.DOWN && idx < resItems.length - 1) return resItems[idx + 1];
      }

      return null;
    },

    /**
     * Unified Favorites Navigation rules (Tabs <-> Grid).
     */
    handleFavoritesNavigation: function (zone, direction) {
      var Constants = window.FreeIPTV.Constants;

      if (zone === 'favorites_tabs') {
        var tabs = Array.prototype.slice.call(document.querySelectorAll('#favorites-tabs-row .focusable'));
        var idx = tabs.indexOf(currentElement);

        if (direction === Constants.DIRECTIONS.RIGHT && idx < tabs.length - 1) return tabs[idx + 1];
        if (direction === Constants.DIRECTIONS.LEFT) {
          if (idx > 0) return tabs[idx - 1];
          return document.querySelector('.app-sidebar .focusable.active');
        }
        if (direction === Constants.DIRECTIONS.DOWN) {
          return document.querySelector('#favorites-grid-container .focusable');
        }
      } else if (zone === 'favorites_grid') {
        var cards = Array.prototype.slice.call(document.querySelectorAll('#favorites-grid-container .focusable'));
        var cIdx = cards.indexOf(currentElement);
        var COLS = 5;

        if (direction === Constants.DIRECTIONS.RIGHT && cIdx < cards.length - 1) return cards[cIdx + 1];
        if (direction === Constants.DIRECTIONS.LEFT) {
          if (cIdx % COLS === 0) return document.querySelector('.app-sidebar .focusable.active');
          if (cIdx > 0) return cards[cIdx - 1];
        }
        if (direction === Constants.DIRECTIONS.UP) {
          if (cIdx - COLS >= 0) return cards[cIdx - COLS];
          return zoneHistory.favorites_tabs || document.querySelector('#favorites-tabs-row .focusable.active');
        }
        if (direction === Constants.DIRECTIONS.DOWN && cIdx + COLS < cards.length) return cards[cIdx + COLS];
      }

      return null;
    },

    /**
     * Playlists Screen Navigation rules.
     * @param {string} zone
     * @param {string} direction
     * @returns {HTMLElement|null}
     */
    handlePlaylistsNavigation: function (zone, direction) {
      var Constants = window.FreeIPTV.Constants;

      if (direction === Constants.DIRECTIONS.LEFT) {
        var sidebarLink = document.querySelector('[data-route="playlists"]');
        if (sidebarLink) return sidebarLink;
        return document.querySelector('.app-sidebar .focusable.active') || document.querySelector('.app-sidebar .focusable');
      }

      var items = Array.prototype.slice.call(document.querySelectorAll('#view-playlists .focusable'));
      var idx = items.indexOf(currentElement);
      if (idx === -1) return items[0] || null;

      if (direction === Constants.DIRECTIONS.DOWN) {
        if (idx + 1 < items.length) return items[idx + 1];
        return null;
      } else if (direction === Constants.DIRECTIONS.UP) {
        if (idx > 0) return items[idx - 1];
        return document.querySelector('.app-header .focusable') || null;
      } else if (direction === Constants.DIRECTIONS.RIGHT) {
        if (idx + 1 < items.length) return items[idx + 1];
        return null;
      }

      return null;
    },

    /**
     * Settings Navigation rules.
     */
    handleSettingsNavigation: function (direction) {
      var Constants = window.FreeIPTV.Constants;
      var settingsItems = Array.prototype.slice.call(document.querySelectorAll('#view-settings .focusable'));
      var index = settingsItems.indexOf(currentElement);

      if (direction === Constants.DIRECTIONS.DOWN) {
        if (index < settingsItems.length - 1) return settingsItems[index + 1];
      } else if (direction === Constants.DIRECTIONS.UP) {
        if (index > 0) return settingsItems[index - 1];
      } else if (direction === Constants.DIRECTIONS.LEFT) {
        return document.querySelector('.app-sidebar .focusable.active') ||
               document.querySelector('.app-sidebar .focusable');
      }

      return null;
    },

    /**
     * Main view navigation rules (Home).
     */
    handleMainNavigation: function (direction) {
      var Constants = window.FreeIPTV.Constants;
      var mainItems = Array.prototype.slice.call(document.querySelectorAll('#view-home .focusable'));
      var index = mainItems.indexOf(currentElement);

      if (direction === Constants.DIRECTIONS.LEFT) {
        return document.querySelector('.app-sidebar .focusable.active') ||
               document.querySelector('.app-sidebar .focusable');
      } else if (direction === Constants.DIRECTIONS.UP) {
        if (index > 0) {
          return mainItems[index - 1];
        } else {
          var headerItems = Array.prototype.slice.call(document.querySelectorAll('.app-header .focusable'));
          return headerItems[headerItems.length - 1] || headerItems[0];
        }
      } else if (direction === Constants.DIRECTIONS.DOWN) {
        if (index >= 0 && index < mainItems.length - 1) {
          return mainItems[index + 1];
        }
      }

      return null;
    },

    /**
     * Header navigation rules.
     */
    handleHeaderNavigation: function (direction) {
      var Constants = window.FreeIPTV.Constants;
      var headerItems = Array.prototype.slice.call(document.querySelectorAll('.app-header .focusable'));
      var index = headerItems.indexOf(currentElement);

      if (direction === Constants.DIRECTIONS.LEFT) {
        if (index > 0) {
          return headerItems[index - 1];
        } else {
          return zoneHistory[Constants.NAV_ZONES.SIDEBAR] || document.querySelector('.app-sidebar .focusable');
        }
      } else if (direction === Constants.DIRECTIONS.RIGHT) {
        if (index < headerItems.length - 1) {
          return headerItems[index + 1];
        }
      } else if (direction === Constants.DIRECTIONS.DOWN) {
        var visibleFocusable = document.querySelector('.view-screen:not(.hidden) .focusable');
        return visibleFocusable || document.querySelector('.app-sidebar .focusable');
      }

      return null;
    },

    /**
     * Handle centralized TV Back key behavior.
     * @returns {boolean} True if handled within UI, false if root reached
     */
    handleBack: function () {
      var Constants = window.FreeIPTV.Constants;
      var currentZone = this.getElementZone(currentElement);

      // 0. Player screen -> Close player and return to calling view
      if (currentZone === 'player_controls' || currentZone === 'player_error') {
        if (window.FreeIPTV.Player && window.FreeIPTV.Player.isActive()) {
          window.FreeIPTV.Player.closePlayer();
          return true;
        }
      }

      // Modals
      if (currentZone === 'movie_details') {
        if (window.FreeIPTV.Movies && window.FreeIPTV.Movies.closeMovieDetails) {
          window.FreeIPTV.Movies.closeMovieDetails();
          return true;
        }
      }

      if (currentZone === 'series_details') {
        if (window.FreeIPTV.Series && window.FreeIPTV.Series.closeSeriesDetails) {
          window.FreeIPTV.Series.closeSeriesDetails();
          return true;
        }
      }

      // Grids to categories
      if (currentZone === 'movies_grid') {
        var mCatTarget = zoneHistory.movies_categories || document.querySelector('#movies-categories-list .focusable');
        if (mCatTarget) {
          this.focus(mCatTarget);
          return true;
        }
      }

      if (currentZone === 'series_grid') {
        var sCatTarget = zoneHistory.series_categories || document.querySelector('#series-categories-list .focusable');
        if (sCatTarget) {
          this.focus(sCatTarget);
          return true;
        }
      }

      if (currentZone === 'guide_programs') {
        var gChTarget = zoneHistory.guide_channels || document.querySelector('#guide-channels-list .focusable.active');
        if (gChTarget) {
          this.focus(gChTarget);
          return true;
        }
      }

      if (currentZone === 'search_results') {
        var sInput = document.getElementById('global-search-input');
        if (sInput) {
          this.focus(sInput);
          return true;
        }
      }

      if (currentZone === 'favorites_grid') {
        var fTabs = zoneHistory.favorites_tabs || document.querySelector('#favorites-tabs-row .focusable.active');
        if (fTabs) {
          this.focus(fTabs);
          return true;
        }
      }

      // Live EPG Pane -> Channel list
      if (currentZone === 'live_epg') {
        var epgChTarget = zoneHistory.live_channels ||
                          document.querySelector('#live-channels-container .focusable.focused') ||
                          document.querySelector('#live-channels-container .focusable');
        if (epgChTarget) {
          this.focus(epgChTarget);
          return true;
        }
      }

      // Channel list -> Categories
      if (currentZone === 'live_channels') {
        var catTarget = zoneHistory.live_categories ||
                        document.querySelector('#live-categories-list .focusable.active') ||
                        document.querySelector('#live-categories-list .focusable');
        if (catTarget) {
          this.focus(catTarget);
          return true;
        }
      }

      // Category stack back navigation in live_categories
      if (currentZone === 'live_categories') {
        if (window.FreeIPTV.LiveTV && typeof window.FreeIPTV.LiveTV.canNavigateBackCategory === 'function' && window.FreeIPTV.LiveTV.canNavigateBackCategory()) {
          window.FreeIPTV.LiveTV.navigateBackCategory();
          return true;
        }
      }

      // Categories or Playlists or Settings or Main or Header -> Sidebar
      if (
        currentZone === 'live_categories' ||
        currentZone === 'movies_categories' ||
        currentZone === 'series_categories' ||
        currentZone === 'guide_channels' ||
        currentZone === 'search_input' ||
        currentZone === 'favorites_tabs' ||
        currentZone === 'playlists_actions' ||
        currentZone === 'playlists_grid' ||
        currentZone === 'settings_actions' ||
        currentZone === 'settings_diagnostics' ||
        currentZone === Constants.NAV_ZONES.MAIN ||
        currentZone === Constants.NAV_ZONES.HEADER
      ) {
        var sidebarTarget = document.querySelector('.app-sidebar .focusable.active') ||
                             document.querySelector('.app-sidebar .focusable');
        if (sidebarTarget) {
          this.focus(sidebarTarget);
          return true;
        }
      }

      // Root reached (Home sidebar item); return false to trigger exit dialog or app exit
      var homeItem = document.querySelector('[data-route="home"]');
      if (homeItem && currentElement !== homeItem) {
        this.focus(homeItem);
        homeItem.click();
        return true;
      }

      return false;
    }
  };

  window.FreeIPTV.Navigation = Navigation;
})(window);
