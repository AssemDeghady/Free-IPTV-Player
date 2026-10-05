/**
 * Free IPTV Player — HTML5 Video & HLS Playback Adapter
 * Real browser playback adapter utilizing standard HTML5 <video> and HLS.js.
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

  var STANDARD_TV_WIDTH = 1920;
  var STANDARD_TV_HEIGHT = 1080;

  function HTML5PlaybackAdapter() {
    this.videoEl = null;
    this.hls = null;
    this.currentState = STATES.IDLE;
    this.currentUrl = null;
    this.currentSessionId = 0;
    this.isPreviewMode = false;
    this._isMuted = false;
    this.userVolume = 100;
    this.currentDisplayMode = 'FIT';
    this.userListeners = {};
    this.diagnostics = {
      platform: 'Web / Browser',
      engine: 'HTML5 Video',
      sourceType: 'Unknown',
      nativeHls: false,
      mediaSource: typeof window !== 'undefined' && Boolean(window.MediaSource),
      hlsLoaded: typeof window !== 'undefined' && Boolean(window.Hls),
      readyState: 0,
      networkState: 0,
      duration: 0,
      currentTime: 0,
      error: null
    };

    this.ensureVideoElement();
  }

  HTML5PlaybackAdapter.prototype.STATES = STATES;
  HTML5PlaybackAdapter.prototype.STANDARD_TV_WIDTH = STANDARD_TV_WIDTH;
  HTML5PlaybackAdapter.prototype.STANDARD_TV_HEIGHT = STANDARD_TV_HEIGHT;

  /**
   * Create or locate the HTML5 <video> element in the DOM.
   */
  HTML5PlaybackAdapter.prototype.ensureVideoElement = function () {
    if (typeof document === 'undefined') return null;

    var existing = document.getElementById('player-html5-video');
    if (existing) {
      this.videoEl = existing;
      return existing;
    }

    var playerView = document.getElementById('view-player');
    var video = document.createElement('video');
    video.id = 'player-html5-video';
    video.className = 'player-html5-video';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('preload', 'auto');
    video.style.position = 'absolute';
    video.style.top = '0';
    video.style.left = '0';
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'contain';
    video.style.zIndex = '0';
    video.style.backgroundColor = '#000000';

    if (playerView) {
      playerView.insertBefore(video, playerView.firstChild);
    } else if (document.body) {
      document.body.appendChild(video);
    }

    this.videoEl = video;
    this.bindVideoEvents(video);
    return video;
  };

  /**
   * Bind DOM HTML5 video element events to adapter lifecycle and state machine.
   */
  HTML5PlaybackAdapter.prototype.bindVideoEvents = function (video) {
    if (!video) return;
    var self = this;

    video.addEventListener('loadstart', function () {
      self.updateDiagnostics();
    });

    video.addEventListener('loadedmetadata', function () {
      self.updateDiagnostics();
      if (self.userListeners.onLoadedMetadata) {
        self.userListeners.onLoadedMetadata();
      }
    });

    video.addEventListener('canplay', function () {
      self.updateDiagnostics();
    });

    video.addEventListener('playing', function () {
      self.setState(STATES.PLAYING);
      self.updateDiagnostics();
      if (self.userListeners.onBufferingComplete) {
        self.userListeners.onBufferingComplete();
      }
    });

    video.addEventListener('pause', function () {
      if (self.currentState !== STATES.IDLE && self.currentState !== STATES.STOPPING && !video.ended) {
        self.setState(STATES.PAUSED);
      }
      self.updateDiagnostics();
    });

    video.addEventListener('waiting', function () {
      self.setState(STATES.BUFFERING);
      self.updateDiagnostics();
      if (self.userListeners.onBufferingStart) {
        self.userListeners.onBufferingStart();
      }
    });

    video.addEventListener('timeupdate', function () {
      var timeMs = Math.round(video.currentTime * 1000);
      self.diagnostics.currentTime = video.currentTime;
      if (self.userListeners.onCurrentPlayTime) {
        self.userListeners.onCurrentPlayTime(timeMs);
      }
    });

    video.addEventListener('progress', function () {
      if (video.buffered && video.buffered.length > 0 && video.duration > 0) {
        try {
          var bufferedEnd = video.buffered.end(video.buffered.length - 1);
          var pct = Math.min(100, Math.round((bufferedEnd / video.duration) * 100));
          if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
            window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.PLAYER_BUFFERING_PROGRESS, {
              percent: pct
            });
          }
          if (self.userListeners.onBufferingProgress) {
            self.userListeners.onBufferingProgress(pct);
          }
        } catch (e) {}
      }
    });

    video.addEventListener('ended', function () {
      self.setState(STATES.IDLE);
      self.updateDiagnostics();
      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.PLAYER_STATE_CHANGED, {
          previousState: STATES.PLAYING,
          state: STATES.IDLE,
          url: self.currentUrl,
          details: { ended: true }
        });
      }
    });

    video.addEventListener('error', function () {
      var err = video.error;
      var errCode = err ? err.code : 'UNKNOWN';
      var errMsg = 'HTML5 Media Error code: ' + errCode;
      if (err) {
        switch (err.code) {
          case 1: errMsg = 'Playback aborted by user'; break;
          case 2: errMsg = 'Network error during stream download'; break;
          case 3: errMsg = 'Media decoding failed or corrupt stream'; break;
          case 4: errMsg = 'Stream format not supported or access denied (CORS/403)'; break;
        }
      }
      self.diagnostics.error = errMsg;
      self.setState(STATES.ERROR, { error: errMsg, code: errCode });
      if (self.userListeners.onError) {
        self.userListeners.onError(errMsg);
      }
      if (self.userListeners.onErrorMsg) {
        self.userListeners.onErrorMsg(errMsg);
      }
    });
  };

  /**
   * Update internal telemetry / diagnostics object.
   */
  HTML5PlaybackAdapter.prototype.updateDiagnostics = function () {
    if (!this.videoEl) return;
    this.diagnostics.readyState = this.videoEl.readyState;
    this.diagnostics.networkState = this.videoEl.networkState;
    this.diagnostics.duration = this.videoEl.duration || 0;
    this.diagnostics.currentTime = this.videoEl.currentTime || 0;
    this.diagnostics.nativeHls = Boolean(
      this.videoEl.canPlayType &&
      (this.videoEl.canPlayType('application/vnd.apple.mpegurl') ||
       this.videoEl.canPlayType('application/x-mpegURL'))
    );
    this.diagnostics.mediaSource = typeof window !== 'undefined' && Boolean(window.MediaSource);
    this.diagnostics.hlsLoaded = typeof window !== 'undefined' && Boolean(window.Hls);
  };

  /**
   * Format diagnostic details safe for logging and UI without credentials.
   * @returns {string}
   */
  HTML5PlaybackAdapter.prototype.getDiagnosticsString = function () {
    this.updateDiagnostics();
    var d = this.diagnostics;
    var lines = [
      'PLAYER DIAGNOSTICS',
      'Platform: ' + d.platform,
      'Engine: ' + d.engine,
      'Source Type: ' + d.sourceType,
      'Native HLS: ' + (d.nativeHls ? 'true' : 'false'),
      'MediaSource: ' + (d.mediaSource ? 'true' : 'false'),
      'HLS.js: ' + (d.hlsLoaded ? 'loaded' : 'not loaded'),
      'Ready State: ' + d.readyState,
      'Network State: ' + d.networkState,
      'Duration: ' + (typeof d.duration === 'number' && !isNaN(d.duration) ? d.duration.toFixed(1) + 's' : 'unknown'),
      'Current Time: ' + (typeof d.currentTime === 'number' && !isNaN(d.currentTime) ? d.currentTime.toFixed(1) + 's' : '0s'),
      'Error: ' + (d.error || 'none')
    ];
    return lines.join('\n');
  };

  /**
   * Set adapter state and emit global event.
   */
  HTML5PlaybackAdapter.prototype.setState = function (newState, details) {
    var oldState = this.currentState;
    this.currentState = newState;

    if (window.FreeIPTV.Logger) {
      window.FreeIPTV.Logger.info('HTML5Adapter State: ' + oldState + ' -> ' + newState, details || '');
    }

    if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
      window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.PLAYER_STATE_CHANGED, {
        previousState: oldState,
        state: newState,
        url: this.currentUrl,
        details: details || {}
      });
    }
  };

  /**
   * Check if adapter is available. True in browser environments with HTML5 video support.
   */
  HTML5PlaybackAdapter.prototype.isAvailable = function () {
    return typeof document !== 'undefined' && typeof document.createElement === 'function';
  };

  HTML5PlaybackAdapter.prototype.getState = function () {
    return this.currentState;
  };

  HTML5PlaybackAdapter.prototype.getNativeState = function () {
    if (!this.videoEl) return null;
    if (this.videoEl.paused) return 'PAUSED';
    if (this.videoEl.ended) return 'IDLE';
    if (this.videoEl.readyState >= 3) return 'PLAYING';
    return 'READY';
  };

  HTML5PlaybackAdapter.prototype.getCurrentUrl = function () {
    return this.currentUrl;
  };

  HTML5PlaybackAdapter.prototype.isPlaying = function () {
    return this.currentState === STATES.PLAYING;
  };

  HTML5PlaybackAdapter.prototype.isPaused = function () {
    return this.currentState === STATES.PAUSED;
  };

  HTML5PlaybackAdapter.prototype.setListener = function (listeners) {
    this.userListeners = listeners || {};
  };

  /**
   * Open stream URL. Detects HLS vs MP4 vs Native support vs HLS.js.
   */
  HTML5PlaybackAdapter.prototype.open = function (url, isPreview) {
    var self = this;
    if (!url || typeof url !== 'string' || url.trim().length < 8) {
      var err = new Error('Invalid stream URL');
      self.setState(STATES.ERROR, { error: err.message });
      return Promise.reject(err);
    }

    var cleanUrl = url.trim();
    this.currentUrl = cleanUrl;
    this.currentSessionId++;
    var thisSession = this.currentSessionId;

    if (!isPreview) {
      this.isPreviewMode = false;
      this.setMute(false);
    }

    this.stop();
    this.setState(STATES.OPENING, { url: cleanUrl });
    this.diagnostics.error = null;

    var video = this.ensureVideoElement();
    if (!video) {
      var vErr = new Error('HTML5 Video element unavailable');
      this.setState(STATES.ERROR, { error: vErr.message });
      return Promise.reject(vErr);
    }

    // Determine stream type
    var isHls = cleanUrl.indexOf('.m3u8') !== -1 || cleanUrl.indexOf('type=m3u8') !== -1;
    var isMp4 = cleanUrl.indexOf('.mp4') !== -1 || cleanUrl.indexOf('.mkv') !== -1;
    this.diagnostics.sourceType = isHls ? 'HLS (.m3u8)' : (isMp4 ? 'MP4/Direct' : 'Direct Media');

    var canPlayNativeHls = Boolean(
      video.canPlayType &&
      (video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL'))
    );

    if (isHls && !canPlayNativeHls) {
      // HLS with HLS.js fallback
      if (typeof window !== 'undefined' && window.Hls && window.Hls.isSupported && window.Hls.isSupported()) {
        this.diagnostics.engine = 'HTML5 Video + HLS.js';
        try {
          if (this.hls) {
            this.hls.destroy();
            this.hls = null;
          }
          var hls = new window.Hls({
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 30
          });
          this.hls = hls;

          hls.on(window.Hls.Events.ERROR, function (event, data) {
            if (thisSession !== self.currentSessionId) return;
            var errDetail = data ? (data.type + ': ' + data.details) : 'HLS.js error';
            self.diagnostics.error = errDetail;
            if (window.FreeIPTV.Logger) {
              window.FreeIPTV.Logger.warn('HLS.js error:', errDetail, data.fatal ? '(fatal)' : '(non-fatal)');
            }
            if (data.fatal) {
              switch (data.type) {
                case window.Hls.ErrorTypes.NETWORK_ERROR:
                  // Network / CORS / 403 error
                  self.setState(STATES.ERROR, { error: 'Network error or CORS restrictions loading HLS manifest' });
                  break;
                case window.Hls.ErrorTypes.MEDIA_ERROR:
                  hls.recoverMediaError();
                  break;
                default:
                  hls.destroy();
                  self.setState(STATES.ERROR, { error: errDetail });
                  break;
              }
            }
          });

          hls.loadSource(cleanUrl);
          hls.attachMedia(video);
          return Promise.resolve(true);
        } catch (hlsEx) {
          self.setState(STATES.ERROR, { error: hlsEx.message });
          return Promise.reject(hlsEx);
        }
      } else {
        // Neither native HLS nor HLS.js supported
        var unsupportedMsg = 'This browser cannot play this stream format (HLS not supported).';
        self.diagnostics.error = unsupportedMsg;
        self.setState(STATES.ERROR, { error: unsupportedMsg });
        return Promise.reject(new Error(unsupportedMsg));
      }
    } else {
      // Native video playback (MP4 or Safari native HLS)
      this.diagnostics.engine = 'HTML5 Video (Native)';
      video.src = cleanUrl;
      video.load();
      return Promise.resolve(true);
    }
  };

  /**
   * Prepare stream.
   */
  HTML5PlaybackAdapter.prototype.prepare = function () {
    var self = this;
    var video = this.videoEl;
    if (!video) return Promise.resolve(false);

    this.setState(STATES.PREPARING);

    return new Promise(function (resolve) {
      if (video.readyState >= 2) {
        self.setState(STATES.PLAYING);
        resolve(true);
        return;
      }

      var onCanPlay = function () {
        video.removeEventListener('canplay', onCanPlay);
        self.setState(STATES.PLAYING);
        resolve(true);
      };

      video.addEventListener('canplay', onCanPlay);

      // Timeout fallback in case canplay takes longer or browser requires play() first
      setTimeout(function () {
        video.removeEventListener('canplay', onCanPlay);
        resolve(true);
      }, 1500);
    });
  };

  /**
   * Start / resume playback.
   */
  HTML5PlaybackAdapter.prototype.play = function () {
    var video = this.videoEl;
    if (!video) return Promise.resolve(false);

    try {
      var promise = video.play();
      if (promise && typeof promise.then === 'function') {
        return promise.then(function () {
          return true;
        }).catch(function (err) {
          // Autoplay policy or media decode error
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.warn('HTML5 video.play() rejected:', err.message);
          }
          return false;
        });
      }
      return Promise.resolve(true);
    } catch (e) {
      return Promise.reject(e);
    }
  };

  /**
   * Pause playback.
   */
  HTML5PlaybackAdapter.prototype.pause = function () {
    var video = this.videoEl;
    if (!video) return Promise.resolve(false);
    try {
      video.pause();
      this.setState(STATES.PAUSED);
      return Promise.resolve(true);
    } catch (e) {
      return Promise.reject(e);
    }
  };

  /**
   * Stop stream.
   */
  HTML5PlaybackAdapter.prototype.stop = function () {
    if (this.hls) {
      try {
        this.hls.destroy();
      } catch (e) {}
      this.hls = null;
    }

    if (this.videoEl) {
      try {
        this.videoEl.pause();
        this.videoEl.removeAttribute('src');
        this.videoEl.load();
      } catch (e) {}
    }

    this.setState(STATES.IDLE);
  };

  /**
   * Get duration in milliseconds.
   */
  HTML5PlaybackAdapter.prototype.getDuration = function () {
    if (!this.videoEl) return 0;
    var d = this.videoEl.duration;
    return typeof d === 'number' && !isNaN(d) && isFinite(d) && d > 0 ? Math.round(d * 1000) : 0;
  };

  /**
   * Get current position in milliseconds.
   */
  HTML5PlaybackAdapter.prototype.getCurrentTime = function () {
    if (!this.videoEl) return 0;
    var t = this.videoEl.currentTime;
    return typeof t === 'number' && !isNaN(t) && isFinite(t) && t >= 0 ? Math.round(t * 1000) : 0;
  };

  /**
   * Seek to position in milliseconds.
   */
  HTML5PlaybackAdapter.prototype.seekTo = function (timeMs) {
    var video = this.videoEl;
    if (!video) return Promise.resolve(false);
    var targetSec = Math.max(0, (timeMs || 0) / 1000);
    try {
      video.currentTime = targetSec;
      return Promise.resolve(true);
    } catch (e) {
      return Promise.reject(e);
    }
  };

  HTML5PlaybackAdapter.prototype.setVolume = function (vol) {
    this.userVolume = typeof vol === 'number' ? Math.max(0, Math.min(100, vol)) : 100;
    if (this.videoEl) {
      this.videoEl.volume = this.userVolume / 100;
    }
  };

  HTML5PlaybackAdapter.prototype.getVolume = function () {
    return this.userVolume;
  };

  HTML5PlaybackAdapter.prototype.setMute = function (muted) {
    this._isMuted = Boolean(muted);
    if (this.videoEl) {
      this.videoEl.muted = this._isMuted;
    }
  };

  HTML5PlaybackAdapter.prototype.isMuted = function () {
    return this._isMuted;
  };

  HTML5PlaybackAdapter.prototype.isInPreviewMode = function () {
    return this.isPreviewMode;
  };

  HTML5PlaybackAdapter.prototype.setDisplayArea = function (rect) {
    if (!this.videoEl) return;
    if (rect && typeof rect === 'object' && typeof rect.width === 'number') {
      this.videoEl.style.top = rect.y + 'px';
      this.videoEl.style.left = rect.x + 'px';
      this.videoEl.style.width = rect.width + 'px';
      this.videoEl.style.height = rect.height + 'px';
    } else {
      this.videoEl.style.top = '0px';
      this.videoEl.style.left = '0px';
      this.videoEl.style.width = '100%';
      this.videoEl.style.height = '100%';
    }
  };

  HTML5PlaybackAdapter.prototype.setDisplayMethod = function (mode) {
    this.currentDisplayMode = mode || 'FIT';
    if (!this.videoEl) return;
    switch (this.currentDisplayMode) {
      case 'FULL':
        this.videoEl.style.objectFit = 'fill';
        break;
      case 'AUTO':
        this.videoEl.style.objectFit = 'cover';
        break;
      case 'FIT':
      default:
        this.videoEl.style.objectFit = 'contain';
        break;
    }
  };

  HTML5PlaybackAdapter.prototype.getDisplayMethod = function () {
    return this.currentDisplayMode;
  };

  HTML5PlaybackAdapter.prototype.startPreview = function (url, rect) {
    var self = this;
    this.isPreviewMode = true;
    this.setMute(true);

    return this.open(url, true).then(function () {
      if (rect) {
        self.setDisplayArea(rect);
      }
      self.setMute(true);
      return self.prepare().then(function () {
        self.setMute(true);
        return self.play();
      });
    });
  };

  HTML5PlaybackAdapter.prototype.stopPreview = function () {
    if (this.isPreviewMode) {
      this.isPreviewMode = false;
      this.stop();
      this.setMute(false);
      this.setDisplayArea();
    }
  };

  HTML5PlaybackAdapter.prototype.getTotalTrackInfo = function () {
    var tracks = [];
    if (this.videoEl) {
      if (this.videoEl.audioTracks) {
        for (var a = 0; a < this.videoEl.audioTracks.length; a++) {
          var at = this.videoEl.audioTracks[a];
          tracks.push({
            index: a,
            type: 'AUDIO',
            extra_info: { language: at.language || at.label }
          });
        }
      }
      if (this.videoEl.textTracks) {
        for (var t = 0; t < this.videoEl.textTracks.length; t++) {
          var tt = this.videoEl.textTracks[t];
          tracks.push({
            index: t,
            type: 'TEXT',
            extra_info: { language: tt.language || tt.label }
          });
        }
      }
    }
    return tracks;
  };

  HTML5PlaybackAdapter.prototype.setSelectTrack = function (type, index) {
    if (!this.videoEl) return false;
    if (type === 'AUDIO' && this.videoEl.audioTracks && this.videoEl.audioTracks[index]) {
      for (var a = 0; a < this.videoEl.audioTracks.length; a++) {
        this.videoEl.audioTracks[a].enabled = (a === index);
      }
      return true;
    }
    if (type === 'TEXT' && this.videoEl.textTracks && this.videoEl.textTracks[index]) {
      for (var t = 0; t < this.videoEl.textTracks.length; t++) {
        this.videoEl.textTracks[t].mode = (t === index) ? 'showing' : 'disabled';
      }
      return true;
    }
    return false;
  };

  HTML5PlaybackAdapter.prototype.close = function () {
    this.stop();
    this.currentUrl = null;
    this.setState(STATES.IDLE);
  };

  HTML5PlaybackAdapter.prototype.destroy = function () {
    this.stop();
    if (this.videoEl && this.videoEl.parentNode) {
      this.videoEl.parentNode.removeChild(this.videoEl);
    }
    this.videoEl = null;
    this.currentUrl = null;
    this.userListeners = {};
    this.setState(STATES.IDLE);
  };

  window.FreeIPTV.HTML5PlaybackAdapter = HTML5PlaybackAdapter;
})(typeof window !== 'undefined' ? window : this);
