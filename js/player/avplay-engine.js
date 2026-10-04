/**
 * Free IPTV Player — Samsung AVPlay Media Engine
 * Encapsulated abstraction for Samsung Tizen's native webapis.avplay API.
 * The rest of the application interacts exclusively through this engine.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var STATES = {
    IDLE: 'IDLE',
    OPENING: 'OPENING',
    PREPARING: 'PREPARING',
    BUFFERING: 'BUFFERING',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    STOPPING: 'STOPPING',
    ERROR: 'ERROR'
  };

  var DISPLAY_MODES = {
    FIT: 'PLAYER_DISPLAY_MODE_LETTER_BOX',
    FULL: 'PLAYER_DISPLAY_MODE_FULL_SCREEN',
    AUTO: 'PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO'
  };

  var STANDARD_TV_WIDTH = 1920;
  var STANDARD_TV_HEIGHT = 1080;

  var currentState = STATES.IDLE;
  var currentUrl = null;
  var currentDisplayMode = 'FIT';
  var userListeners = {};
  var avplayRef = null;
  var currentStreamSessionId = 0;
  var isPreviewMode = false;
  var isMuted = false;
  var userVolume = 100;

  /**
   * Helper to check webapis.avplay availability safely without throwing in any environment.
   */
  function getAVPlay() {
    try {
      if (typeof window !== 'undefined' && 
          window.webapis && 
          typeof window.webapis.avplay === 'object' && 
          window.webapis.avplay !== null) {
        return window.webapis.avplay;
      }
    } catch (e) {
      // In case of restricted access or security exceptions
    }
    return null;
  }

  /**
   * Calculate integer coordinates in Samsung AVPlay 1920x1080 coordinate space.
   *
   * CRITICAL ARCHITECTURAL CONVENTION:
   * Samsung AVPlay renders video on a dedicated hardware layer behind the web browser.
   * Samsung AVPlay setDisplayRect(x, y, w, h) strictly requires coordinates in a
   * fixed 1920x1080 reference system regardless of:
   * 1. The physical display panel resolution (4K 3840x2160, 8K 7680x4320, or 720p).
   * 2. The web browser's window.innerWidth or window.innerHeight.
   * 3. CSS pixel scaling or display zoom levels.
   *
   * For full-screen playback, the coordinates are ALWAYS:
   * { x: 0, y: 0, width: 1920, height: 1080 }
   *
   * If a sub-rectangle (windowed/picture-in-picture) is requested within the web
   * application layout, it is proportionally scaled from the layout's viewport
   * coordinates into the 1920x1080 AVPlay grid, rounded to clean integer pixels.
   *
   * @param {Object} [rect] Optional viewport coordinates { x, y, width, height }
   * @param {number} [viewportWidth] Viewport width (defaults to window.innerWidth or 1920)
   * @param {number} [viewportHeight] Viewport height (defaults to window.innerHeight or 1080)
   * @returns {{ x: number, y: number, width: number, height: number }}
   */
  function calculateDisplayRect(rect, viewportWidth, viewportHeight) {
    if (!rect || typeof rect.width !== 'number' || typeof rect.height !== 'number') {
      // Fullscreen default: strictly standard 1920x1080 reference coordinates
      return {
        x: 0,
        y: 0,
        width: STANDARD_TV_WIDTH,
        height: STANDARD_TV_HEIGHT
      };
    }

    var vw = typeof viewportWidth === 'number' && viewportWidth > 0 ? viewportWidth : (typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : STANDARD_TV_WIDTH);
    var vh = typeof viewportHeight === 'number' && viewportHeight > 0 ? viewportHeight : (typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : STANDARD_TV_HEIGHT);

    var scaleX = STANDARD_TV_WIDTH / vw;
    var scaleY = STANDARD_TV_HEIGHT / vh;

    var posX = typeof rect.x === 'number' ? rect.x : 0;
    var posY = typeof rect.y === 'number' ? rect.y : 0;

    var mappedX = Math.round(posX * scaleX);
    var mappedY = Math.round(posY * scaleY);
    var mappedW = Math.round(rect.width * scaleX);
    var mappedH = Math.round(rect.height * scaleY);

    // Clamping to positive integers within 1920x1080 bounds
    mappedX = Math.max(0, Math.min(mappedX, STANDARD_TV_WIDTH));
    mappedY = Math.max(0, Math.min(mappedY, STANDARD_TV_HEIGHT));
    mappedW = Math.max(1, Math.min(mappedW, STANDARD_TV_WIDTH - mappedX));
    mappedH = Math.max(1, Math.min(mappedH, STANDARD_TV_HEIGHT - mappedY));

    return {
      x: mappedX,
      y: mappedY,
      width: mappedW,
      height: mappedH
    };
  }

  /**
   * Safely teardown any active native AVPlay session without throwing WebAPIException.
   * On Samsung Tizen:
   * - calling stop() from IDLE/NONE throws INVALID_STATE_ERR.
   * - calling close() from PLAYING/PAUSED without stopping first throws INVALID_STATE_ERR.
   * - calling close() from NONE throws INVALID_STATE_ERR.
   * @param {Object} avplay
   */
  function safeTeardown(avplay) {
    if (!avplay) return;
    try {
      var nState = typeof avplay.getState === 'function' ? avplay.getState() : null;
      if (nState === 'PLAYING' || nState === 'PAUSED' || nState === 'READY') {
        try {
          avplay.stop();
        } catch (eStop) {
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.warn('AVPlay safeTeardown stop error:', eStop);
          }
        }
        nState = typeof avplay.getState === 'function' ? avplay.getState() : 'IDLE';
      }
      if (nState === 'IDLE') {
        try {
          avplay.close();
        } catch (eClose) {
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.warn('AVPlay safeTeardown close error:', eClose);
          }
        }
      }
    } catch (e) {
      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.warn('AVPlay safeTeardown error:', e);
      }
    }
  }

  /**
   * Set internal player state and emit event.
   * @param {string} newState
   * @param {Object} [details]
   */
  function setState(newState, details) {
    var oldState = currentState;
    currentState = newState;

    if (window.FreeIPTV.Logger) {
      window.FreeIPTV.Logger.info('AVPlay State: ' + oldState + ' -> ' + newState, details || '');
    }

    if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
      window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.PLAYER_STATE_CHANGED, {
        previousState: oldState,
        state: newState,
        url: currentUrl,
        details: details || {}
      });
    }

    if (userListeners.onStateChange) {
      try {
        userListeners.onStateChange(newState, oldState, details);
      } catch (e) {
        // ignore listener errors
      }
    }
  }

  /**
   * Validate stream URL before passing to AVPlay.
   * @param {string} url
   * @returns {boolean}
   */
  function isValidStreamUrl(url) {
    if (!url || typeof url !== 'string') return false;
    var trimmed = url.trim();
    if (trimmed.length < 8) return false;
    // Strictly require http or https
    return trimmed.indexOf('http://') === 0 || trimmed.indexOf('https://') === 0;
  }

  var AVPlayEngine = {
    STATES: STATES,
    DISPLAY_MODES: DISPLAY_MODES,
    STANDARD_TV_WIDTH: STANDARD_TV_WIDTH,
    STANDARD_TV_HEIGHT: STANDARD_TV_HEIGHT,
    calculateDisplayRect: calculateDisplayRect,

    /**
     * Check if Samsung AVPlay native API is available on this platform.
     * Safe across desktop browser, Node.js, and Tizen TV.
     * @returns {boolean}
     */
    isAvailable: function () {
      return getAVPlay() !== null;
    },

    /**
     * Get current engine state.
     * @returns {string}
     */
    getState: function () {
      return currentState;
    },

    /**
     * Get native AVPlay state if available.
     * @returns {string|null} ('NONE' | 'IDLE' | 'READY' | 'PLAYING' | 'PAUSED' | null)
     */
    getNativeState: function () {
      var avplay = getAVPlay();
      if (avplay && typeof avplay.getState === 'function') {
        try {
          return avplay.getState();
        } catch (e) {
          return null;
        }
      }
      return null;
    },

    /**
     * Get currently active stream URL.
     * @returns {string|null}
     */
    getCurrentUrl: function () {
      return currentUrl;
    },

    /**
     * Check if media is currently playing.
     * @returns {boolean}
     */
    isPlaying: function () {
      return currentState === STATES.PLAYING;
    },

    /**
     * Check if media is currently paused.
     * @returns {boolean}
     */
    isPaused: function () {
      return currentState === STATES.PAUSED;
    },

    /**
     * Register engine event listener callbacks.
     * @param {Object} listeners
     */
    setListener: function (listeners) {
      userListeners = listeners || {};
    },

    /**
     * Open a stream URL in AVPlay.
     * Closes any previously playing stream cleanly using safe teardown.
     * @param {string} url
     * @returns {Promise<boolean>}
     */
    open: function (url, isPreview) {
      var self = this;

      if (!isValidStreamUrl(url)) {
        var err = new Error('Invalid stream URL. Only HTTP and HTTPS streams are supported.');
        setState(STATES.ERROR, { error: err.message });
        return Promise.reject(err);
      }

      var avplay = getAVPlay();

      // If opening in full playback mode, ensure preview mode is terminated
      if (!isPreview) {
        isPreviewMode = false;
        this.setMute(false);
      }

      // 1. Clean up active stream if running
      if (currentState !== STATES.IDLE) {
        this.stop();
        this.close();
      } else if (avplay) {
        safeTeardown(avplay);
      }

      currentUrl = url.trim();
      setState(STATES.OPENING, { url: currentUrl });

      if (!avplay) {
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.warn('AVPlayEngine.open: Samsung AVPlay is unavailable in this environment.');
        }
        return Promise.resolve(false);
      }

      var thisSessionId = ++currentStreamSessionId;

      try {
        avplay.open(currentUrl);

        // Configure viewport display area (in native IDLE state)
        this.setDisplayArea();

        // Configure display aspect ratio mode (in native IDLE state)
        this.setDisplayMethod(currentDisplayMode);

        // Bind AVPlay native event listeners (in native IDLE state)
        this.bindNativeListeners(avplay, thisSessionId);

        return Promise.resolve(true);
      } catch (e) {
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.error('AVPlay open WebAPIException:', e);
        }
        setState(STATES.ERROR, { error: e.message });
        return Promise.reject(e);
      }
    },

    /**
     * Set display area coordinates on Samsung TV.
     * Maps coordinates to Samsung AVPlay's 1920x1080 reference coordinate system.
     * Defaults to full 1920x1080 screen dimensions.
     * @param {Object|number} [xOrRect] Optional rect object {x, y, width, height} or x coordinate
     * @param {number} [y]
     * @param {number} [width]
     * @param {number} [height]
     */
    setDisplayArea: function (xOrRect, y, width, height) {
      var avplay = getAVPlay();
      if (!avplay) return;

      var targetRect;
      if (typeof xOrRect === 'object' && xOrRect !== null) {
        targetRect = calculateDisplayRect(xOrRect);
      } else if (typeof xOrRect === 'number' && typeof width === 'number') {
        targetRect = calculateDisplayRect({
          x: xOrRect,
          y: y,
          width: width,
          height: height
        });
      } else {
        targetRect = calculateDisplayRect(); // Standard 1920x1080 fullscreen
      }

      try {
        avplay.setDisplayRect(targetRect.x, targetRect.y, targetRect.width, targetRect.height);
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.info('AVPlay display area set to 1920x1080 reference:', targetRect.x, targetRect.y, targetRect.width, targetRect.height);
        }
      } catch (e) {
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.warn('AVPlay setDisplayRect failed:', e);
        }
      }
    },

    /**
     * Set playback volume level (0-100).
     * @param {number} vol
     */
    setVolume: function (vol) {
      userVolume = typeof vol === 'number' ? Math.max(0, Math.min(100, vol)) : 100;
      var avplay = getAVPlay();
      if (avplay && typeof avplay.setVolume === 'function') {
        try { avplay.setVolume(userVolume); } catch (e) {}
      }
      if (window.tizen && window.tizen.tvaudiocontrol && typeof window.tizen.tvaudiocontrol.setVolume === 'function') {
        try { window.tizen.tvaudiocontrol.setVolume(userVolume); } catch (e) {}
      }
    },

    /**
     * Get current playback volume level.
     * @returns {number}
     */
    getVolume: function () {
      return userVolume;
    },

    /**
     * Set or toggle mute state.
     * Preview mode strictly sets volume 0 / mute = true.
     * @param {boolean} muted
     */
    setMute: function (muted) {
      isMuted = Boolean(muted);
      var avplay = getAVPlay();
      if (avplay) {
        if (typeof avplay.setVolume === 'function') {
          try { avplay.setVolume(isMuted ? 0 : userVolume); } catch (e) {}
        }
        if (typeof avplay.setMute === 'function') {
          try { avplay.setMute(isMuted); } catch (e) {}
        }
      }
      if (window.tizen && window.tizen.tvaudiocontrol && typeof window.tizen.tvaudiocontrol.setMute === 'function') {
        try { window.tizen.tvaudiocontrol.setMute(isMuted); } catch (e) {}
      }
    },

    /**
     * Check if audio is currently muted.
     * @returns {boolean}
     */
    isMuted: function () {
      return isMuted;
    },

    /**
     * Check if currently running in preview mode.
     * @returns {boolean}
     */
    isInPreviewMode: function () {
      return isPreviewMode;
    },

    /**
     * Start muted preview of a stream in a designated window rect.
     * Reuses existing AVPlay lifecycle safely without creating duplicate instances.
     * @param {string} url
     * @param {Object} [rect]
     * @returns {Promise<boolean>}
     */
    startPreview: function (url, rect) {
      var self = this;
      isPreviewMode = true;
      this.setMute(true);

      // Safe teardown of prior stream
      if (currentState !== STATES.IDLE) {
        this.stop();
        this.close();
      }

      return this.open(url, true).then(function (success) {
        if (rect) {
          self.setDisplayArea(rect);
        }
        self.setMute(true);
        return self.prepare().then(function () {
          self.setMute(true);
          return self.play();
        });
      });
    },

    /**
     * Stop and close active channel preview safely.
     * Restores unmuted volume and full display area.
     */
    stopPreview: function () {
      if (isPreviewMode) {
        isPreviewMode = false;
        this.stop();
        this.close();
        this.setMute(false);
        this.setDisplayArea(); // Reset to standard 1920x1080
      }
    },

    /**
     * Set display mode / aspect ratio ('FIT' | 'FULL' | 'AUTO').
     * @param {string} mode
     */
    setDisplayMethod: function (mode) {
      currentDisplayMode = mode || 'FIT';
      var avplayMethod = DISPLAY_MODES[currentDisplayMode] || DISPLAY_MODES.FIT;
      var avplay = getAVPlay();

      if (!avplay) return;

      try {
        avplay.setDisplayMethod(avplayMethod);
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.info('AVPlay display method set to: ' + avplayMethod);
        }
      } catch (e) {
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.warn('AVPlay setDisplayMethod failed:', e);
        }
      }
    },

    /**
     * Get current aspect ratio mode.
     * @returns {string}
     */
    getDisplayMethod: function () {
      return currentDisplayMode;
    },

    /**
     * Prepare stream asynchronously.
     * @returns {Promise<boolean>}
     */
    prepare: function () {
      var self = this;
      var avplay = getAVPlay();

      if (!avplay) {
        return Promise.resolve(false);
      }

      setState(STATES.PREPARING);

      return new Promise(function (resolve, reject) {
        try {
          avplay.prepareAsync(
            function () {
              // Preparation success callback
              if (window.FreeIPTV.Logger) {
                window.FreeIPTV.Logger.info('AVPlay prepareAsync successful.');
              }
              // Immediately start playback
              self.play()
                .then(function () {
                  resolve(true);
                })
                .catch(reject);
            },
            function (error) {
              // Preparation error callback
              if (window.FreeIPTV.Logger) {
                window.FreeIPTV.Logger.error('AVPlay prepareAsync failed:', error);
              }
              setState(STATES.ERROR, { error: error });
              reject(error);
            }
          );
        } catch (e) {
          setState(STATES.ERROR, { error: e.message });
          reject(e);
        }
      });
    },

    /**
     * Start / resume playback.
     * Legal from READY or PAUSED state.
     * @returns {Promise<boolean>}
     */
    play: function () {
      var avplay = getAVPlay();
      if (!avplay) {
        return Promise.resolve(false);
      }

      var nState = typeof avplay.getState === 'function' ? avplay.getState() : null;
      if (nState && nState !== 'READY' && nState !== 'PAUSED' && nState !== 'PLAYING') {
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.warn('AVPlay.play skipped: illegal native state (' + nState + ')');
        }
        return Promise.resolve(false);
      }

      try {
        avplay.play();
        setState(STATES.PLAYING);
        return Promise.resolve(true);
      } catch (e) {
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.error('AVPlay play WebAPIException:', e);
        }
        setState(STATES.ERROR, { error: e.message });
        return Promise.reject(e);
      }
    },

    /**
     * Pause playback.
     * Legal strictly from PLAYING state.
     * @returns {Promise<boolean>}
     */
    pause: function () {
      var avplay = getAVPlay();
      if (!avplay) {
        return Promise.resolve(false);
      }

      var nState = typeof avplay.getState === 'function' ? avplay.getState() : null;
      if (nState && nState !== 'PLAYING') {
        return Promise.resolve(false);
      }
      if (currentState !== STATES.PLAYING) {
        return Promise.resolve(false);
      }

      try {
        avplay.pause();
        setState(STATES.PAUSED);
        return Promise.resolve(true);
      } catch (e) {
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.warn('AVPlay pause WebAPIException:', e);
        }
        return Promise.reject(e);
      }
    },

    /**
     * Stop active stream.
     * Legal strictly from READY, PLAYING, or PAUSED state.
     */
    stop: function () {
      var avplay = getAVPlay();
      if (!avplay) {
        setState(STATES.IDLE);
        return;
      }

      var nState = typeof avplay.getState === 'function' ? avplay.getState() : null;
      // Only call stop if native state is actively in READY, PLAYING, or PAUSED
      if (nState && nState !== 'READY' && nState !== 'PLAYING' && nState !== 'PAUSED') {
        setState(STATES.IDLE);
        return;
      }

      if (currentState === STATES.IDLE || currentState === STATES.STOPPING) {
        return;
      }

      setState(STATES.STOPPING);

      try {
        avplay.stop();
      } catch (e) {
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.warn('AVPlay stop WebAPIException:', e);
        }
      }

      setState(STATES.IDLE);
    },

    /**
     * Get stream duration in milliseconds.
     * @returns {number}
     */
    getDuration: function () {
      var avplay = getAVPlay();
      if (avplay && typeof avplay.getDuration === 'function') {
        try {
          var dur = avplay.getDuration();
          return typeof dur === 'number' && dur > 0 ? dur : 0;
        } catch (e) {
          return 0;
        }
      }
      return 0;
    },

    /**
     * Get current playback position in milliseconds.
     * @returns {number}
     */
    getCurrentTime: function () {
      var avplay = getAVPlay();
      if (avplay && typeof avplay.getCurrentTime === 'function') {
        try {
          var time = avplay.getCurrentTime();
          return typeof time === 'number' && time >= 0 ? time : 0;
        } catch (e) {
          return 0;
        }
      }
      return 0;
    },

    /**
     * Seek playback to a specific position in milliseconds.
     * @param {number} timeMs
     * @returns {Promise<boolean>}
     */
    seekTo: function (timeMs) {
      var avplay = getAVPlay();
      if (!avplay || typeof avplay.seekTo !== 'function') {
        return Promise.resolve(false);
      }

      var targetMs = Math.max(0, Math.round(timeMs));

      return new Promise(function (resolve, reject) {
        try {
          avplay.seekTo(
            targetMs,
            function () {
              if (window.FreeIPTV.Logger) {
                window.FreeIPTV.Logger.debug('AVPlay seekTo successful:', targetMs);
              }
              resolve(true);
            },
            function (err) {
              if (window.FreeIPTV.Logger) {
                window.FreeIPTV.Logger.warn('AVPlay seekTo failed:', err);
              }
              reject(err);
            }
          );
        } catch (e) {
          reject(e);
        }
      });
    },

    /**
     * Get all audio and subtitle tracks for current stream.
     * @returns {Array<Object>}
     */
    getTotalTrackInfo: function () {
      var avplay = getAVPlay();
      if (avplay && typeof avplay.getTotalTrackInfo === 'function') {
        try {
          return avplay.getTotalTrackInfo() || [];
        } catch (e) {
          return [];
        }
      }
      return [];
    },

    /**
     * Select audio or subtitle track.
     * @param {string} trackType 'AUDIO' | 'TEXT'
     * @param {number} trackIndex
     * @returns {boolean}
     */
    setSelectTrack: function (trackType, trackIndex) {
      var avplay = getAVPlay();
      if (avplay && typeof avplay.setSelectTrack === 'function') {
        try {
          avplay.setSelectTrack(trackType, trackIndex);
          return true;
        } catch (e) {
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.warn('AVPlay setSelectTrack failed:', e);
          }
          return false;
        }
      }
      return false;
    },

    /**
     * Close stream and release AVPlay hardware resources.
     * Legal from IDLE state. If active, stop must precede close.
     */
    close: function () {
      currentStreamSessionId++;
      var avplay = getAVPlay();
      if (!avplay) {
        currentUrl = null;
        setState(STATES.IDLE);
        return;
      }

      safeTeardown(avplay);
      currentUrl = null;
      setState(STATES.IDLE);
    },

    /**
     * Complete destruction and resource cleanup.
     */
    destroy: function () {
      currentStreamSessionId++;
      var avplay = getAVPlay();
      if (avplay) {
        safeTeardown(avplay);
      }
      currentUrl = null;
      userListeners = {};
      setState(STATES.IDLE);
      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('AVPlayEngine destroyed.');
      }
    },

    /**
     * Bind native Samsung AVPlay listener callbacks.
     * Registered in IDLE state prior to prepareAsync.
     * @param {Object} avplay
     * @param {number} streamSessionId
     */
    bindNativeListeners: function (avplay, streamSessionId) {
      var self = this;

      var listener = {
        onbufferingstart: function () {
          if (streamSessionId !== currentStreamSessionId) return;
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.info('AVPlay: Buffering start');
          }
          setState(STATES.BUFFERING);
          if (userListeners.onBufferingStart) {
            userListeners.onBufferingStart();
          }
        },

        onbufferingprogress: function (percent) {
          if (streamSessionId !== currentStreamSessionId) return;
          if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
            window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.PLAYER_BUFFERING_PROGRESS, {
              percent: percent
            });
          }
          if (userListeners.onBufferingProgress) {
            userListeners.onBufferingProgress(percent);
          }
        },

        onbufferingcomplete: function () {
          if (streamSessionId !== currentStreamSessionId) return;
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.info('AVPlay: Buffering complete');
          }
          setState(STATES.PLAYING);
          if (userListeners.onBufferingComplete) {
            userListeners.onBufferingComplete();
          }
        },

        oncurrentplaytime: function (timeMs) {
          if (streamSessionId !== currentStreamSessionId) return;
          if (userListeners.onCurrentPlayTime) {
            userListeners.onCurrentPlayTime(timeMs);
          }
        },

        onstreamcompleted: function () {
          if (streamSessionId !== currentStreamSessionId) return;
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.info('AVPlay: Stream completed');
          }
          self.stop();
          if (userListeners.onStreamCompleted) {
            userListeners.onStreamCompleted();
          }
        },

        onerror: function (errorType) {
          if (streamSessionId !== currentStreamSessionId) return;
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.error('AVPlay native error event:', errorType);
          }
          setState(STATES.ERROR, { errorType: errorType });
          if (userListeners.onError) {
            userListeners.onError(errorType);
          }
        },

        onerrormsg: function (errorMsg) {
          if (streamSessionId !== currentStreamSessionId) return;
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.error('AVPlay native error diagnostic message:', errorMsg);
          }
          if (userListeners.onErrorMsg) {
            userListeners.onErrorMsg(errorMsg);
          }
        },

        onevent: function (eventType, eventData) {
          if (streamSessionId !== currentStreamSessionId) return;
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.debug('AVPlay onevent:', eventType, eventData);
          }
        },

        onsubtitlechange: function (duration, text, data3, data4) {
          if (streamSessionId !== currentStreamSessionId) return;
          if (userListeners.onSubtitleChange) {
            userListeners.onSubtitleChange(duration, text, data3, data4);
          }
        },

        ondrmevent: function (drmEvent, drmData) {
          if (streamSessionId !== currentStreamSessionId) return;
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.debug('AVPlay ondrmevent:', drmEvent, drmData);
          }
        }
      };

      try {
        avplay.setListener(listener);
      } catch (e) {
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.error('AVPlay setListener WebAPIException:', e);
        }
      }
    }
  };

  window.FreeIPTV.AVPlayEngine = AVPlayEngine;
})(window);
