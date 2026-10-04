/**
 * Free IPTV Player — Core Constants
 * Centralized keycodes, navigation zones, storage keys, and events.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  window.FreeIPTV.Constants = {
    APP: {
      NAME: 'Free IPTV Player',
      VERSION: '1.0.0',
      DEFAULT_LOCALE: 'en',
      SUPPORTED_LOCALES: ['en', 'ar']
    },

    // Samsung Tizen TV & Keyboard Remote Key Codes
    KEYS: {
      LEFT: 37,
      UP: 38,
      RIGHT: 39,
      DOWN: 40,
      ENTER: 13,
      RETURN_TIZEN: 10009, // Samsung Tizen Remote Back/Return key
      ESCAPE: 27,          // Browser / Emulator fallback
      BACKSPACE: 8,       // Development fallback

      // Media keys (for later phases, registered ahead of time)
      PLAY: 415,
      PAUSE: 19,
      PLAY_PAUSE: 10252,
      STOP: 413,
      FAST_FORWARD: 417,
      REWIND: 412,

      // TV Color function keys
      COLOR_RED: 403,
      COLOR_GREEN: 404,
      COLOR_YELLOW: 405,
      COLOR_BLUE: 406
    },

    // Navigation UI Zones
    NAV_ZONES: {
      HEADER: 'header',
      SIDEBAR: 'sidebar',
      MAIN: 'main',
      LIVE_CATEGORIES: 'live_categories',
      LIVE_CHANNELS: 'live_channels',
      MOVIES_CATEGORIES: 'movies_categories',
      MOVIES_GRID: 'movies_grid',
      MOVIE_DETAILS: 'movie_details',
      SERIES_CATEGORIES: 'series_categories',
      SERIES_GRID: 'series_grid',
      SERIES_DETAILS: 'series_details',
      LIVE_EPG: 'live_epg',
      GUIDE_CHANNELS: 'guide_channels',
      GUIDE_PROGRAMS: 'guide_programs',
      SEARCH_INPUT: 'search_input',
      SEARCH_RESULTS: 'search_results',
      FAVORITES_TABS: 'favorites_tabs',
      FAVORITES_GRID: 'favorites_grid',
      SETTINGS_ACTIONS: 'settings_actions',
      SETTINGS_DIAGNOSTICS: 'settings_diagnostics',
      PLAYER_CONTROLS: 'player_controls',
      PLAYER_ERROR: 'player_error',
      MODAL: 'modal'
    },

    // Content Types
    CONTENT_TYPES: {
      LIVE: 'live',
      MOVIE: 'movie',
      SERIES: 'series',
      EPISODE: 'episode'
    },

    // Directional vectors
    DIRECTIONS: {
      UP: 'up',
      DOWN: 'down',
      LEFT: 'left',
      RIGHT: 'right'
    },

    // Local Storage Keys
    STORAGE_KEYS: {
      SETTINGS: 'fiptv_settings',
      PLAYLISTS: 'fiptv_playlists',
      FAVORITES: 'fiptv_favorites',
      HISTORY: 'fiptv_history',
      LAST_CHANNEL: 'fiptv_last_channel',
      CONTINUE_WATCHING: 'fiptv_continue_watching',
      PARENTAL_PIN: 'fiptv_parental_pin'
    },

    // Decoupled Event System Names
    EVENTS: {
      APP_READY: 'app:ready',
      NAV_FOCUS_CHANGED: 'nav:focus_changed',
      NAV_ACTION_TRIGGERED: 'nav:action_triggered',
      NAV_BACK: 'nav:back',
      LANGUAGE_CHANGED: 'i18n:language_changed',
      VIEW_CHANGED: 'view:changed',
      PLAYLIST_ADDED: 'playlist:added',
      PLAYLIST_REMOVED: 'playlist:removed',
      PLAYLIST_UPDATED: 'playlist:updated',
      PLAYLIST_ACTIVE_CHANGED: 'playlist:active_changed',
      FAVORITES_UPDATED: 'favorites:updated',
      HISTORY_UPDATED: 'history:updated',
      VOD_UPDATED: 'vod:updated',
      SERIES_UPDATED: 'series:updated',
      EPG_UPDATED: 'epg:updated',
      PLAYER_STATE_CHANGED: 'player:state_changed',
      PLAYER_BUFFERING_PROGRESS: 'player:buffering_progress',
      PLAYER_CHANNEL_CHANGED: 'player:channel_changed',
      PLAYER_ERROR: 'player:error',
      PLAYER_TIME_UPDATE: 'player:time_update'
    },

    // Player States
    PLAYER_STATES: {
      IDLE: 'IDLE',
      OPENING: 'OPENING',
      PREPARING: 'PREPARING',
      BUFFERING: 'BUFFERING',
      PLAYING: 'PLAYING',
      PAUSED: 'PAUSED',
      STOPPING: 'STOPPING',
      ERROR: 'ERROR'
    },

    // Aspect Ratio Display Modes
    ASPECT_RATIOS: {
      FIT: 'FIT',
      FULL: 'FULL',
      AUTO: 'AUTO'
    },

    // Log Levels
    LOG_LEVELS: {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
      NONE: 4
    }
  };

  Object.freeze(window.FreeIPTV.Constants);
})(window);
