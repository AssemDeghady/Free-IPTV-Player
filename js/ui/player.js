/**
 * Free IPTV Player — TV Media Player UI Controller
 * Manages full-screen TV player view, Live TV zapping, VOD Movie & Series playback,
 * seek bar, audio/subtitle track selection, buffering, progress persistence, and error recovery.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var MAX_RETRIES = 2;
  var CONTROLS_HIDE_DELAY = 4500; // 4.5s inactivity
  var PROGRESS_TICK_INTERVAL = 1000; // 1s UI progress update
  var PROGRESS_SAVE_INTERVAL = 5000; // 5s persistent progress save

  var currentMedia = null; // { type: 'live'|'movie'|'episode', id, title, subtitle, streamUrl, duration, position }
  var currentChannel = null; // backward compatibility
  var channelList = [];
  var currentChannelIndex = -1;
  var retryCount = 0;
  var retryTimer = null;
  var controlsTimer = null;
  var progressTimer = null;
  var lastSaveTime = 0;
  var isControlsVisible = true;
  var isPlayerActive = false;
  var wasPlayingBeforeHide = false;
  var currentSessionId = 0;
  var osdToastTimer = null;

  var Player = {
    /**
     * Initialize player UI listeners.
     */
    init: function () {
      this.bindButtons();
      this.bindEngineListeners();
      this.bindLifecycleListeners();

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('Player UI Controller initialized.');
      }
    },

    /**
     * Bind player control buttons.
     */
    bindButtons: function () {
      var self = this;

      // Play/Pause button
      var btnPlayPause = document.getElementById('player-btn-play-pause');
      if (btnPlayPause) {
        btnPlayPause.addEventListener('click', function () {
          self.togglePlayPause();
        });
      }

      // Previous channel button
      var btnPrev = document.getElementById('player-btn-prev');
      if (btnPrev) {
        btnPrev.addEventListener('click', function () {
          if (currentMedia && currentMedia.type === 'live') {
            self.zapPrevious();
          } else {
            self.seek(-10);
          }
        });
      }

      // Next channel button
      var btnNext = document.getElementById('player-btn-next');
      if (btnNext) {
        btnNext.addEventListener('click', function () {
          if (currentMedia && currentMedia.type === 'live') {
            self.zapNext();
          } else {
            self.seek(10);
          }
        });
      }

      // Rewind button
      var btnRewind = document.getElementById('player-btn-rewind');
      if (btnRewind) {
        btnRewind.addEventListener('click', function () {
          self.seek(-15);
        });
      }

      // Fast Forward button
      var btnForward = document.getElementById('player-btn-forward');
      if (btnForward) {
        btnForward.addEventListener('click', function () {
          self.seek(15);
        });
      }

      // Audio track button
      var btnAudio = document.getElementById('player-btn-audio');
      if (btnAudio) {
        btnAudio.addEventListener('click', function () {
          self.cycleAudioTrack();
        });
      }

      // Subtitle track button
      var btnSub = document.getElementById('player-btn-sub');
      if (btnSub) {
        btnSub.addEventListener('click', function () {
          self.cycleSubtitleTrack();
        });
      }

      // Aspect ratio button
      var btnAspect = document.getElementById('player-btn-aspect');
      if (btnAspect) {
        btnAspect.addEventListener('click', function () {
          self.cycleAspectRatio();
        });
      }

      // Back to channels / screens button
      var btnBack = document.getElementById('player-btn-back');
      if (btnBack) {
        btnBack.addEventListener('click', function () {
          self.closePlayer();
        });
      }

      // Error overlay action buttons
      var btnErrorRetry = document.getElementById('player-error-retry');
      if (btnErrorRetry) {
        btnErrorRetry.addEventListener('click', function () {
          self.retryCurrent();
        });
      }

      var btnErrorPrev = document.getElementById('player-error-prev');
      if (btnErrorPrev) {
        btnErrorPrev.addEventListener('click', function () {
          self.zapPrevious();
        });
      }

      var btnErrorNext = document.getElementById('player-error-next');
      if (btnErrorNext) {
        btnErrorNext.addEventListener('click', function () {
          self.zapNext();
        });
      }

      var btnErrorBack = document.getElementById('player-error-back');
      if (btnErrorBack) {
        btnErrorBack.addEventListener('click', function () {
          self.closePlayer();
        });
      }
    },

    /**
     * Bind listeners to AVPlayEngine state transitions.
     */
    bindEngineListeners: function () {
      var self = this;

      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYER_STATE_CHANGED, function (data) {
          self.onStateChanged(data.state, data.previousState);
        });

        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYER_BUFFERING_PROGRESS, function (data) {
          self.updateBufferingProgress(data.percent);
        });
      }
    },

    /**
     * Bind visibility / TV application lifecycle listeners.
     */
    bindLifecycleListeners: function () {
      var self = this;

      document.addEventListener('visibilitychange', function () {
        if (!isPlayerActive) return;

        var engine = window.FreeIPTV.AVPlayEngine;
        if (!engine) return;

        if (document.hidden) {
          if (engine.isPlaying()) {
            wasPlayingBeforeHide = true;
            engine.pause();
          }
        } else {
          if (wasPlayingBeforeHide) {
            wasPlayingBeforeHide = false;
            self.showControls();
            if (window.FreeIPTV.Navigation) {
              var playBtn = document.getElementById('player-btn-play-pause');
              if (playBtn) {
                window.FreeIPTV.Navigation.focus(playBtn);
              }
            }
          }
        }
      });
    },

    /**
     * Start playing a live channel.
     * @param {Object} channel
     * @param {Array} [contextChannelList]
     */
    playChannel: function (channel, contextChannelList) {
      if (!channel) return;

      currentChannel = channel;
      channelList = contextChannelList && contextChannelList.length > 0 ? contextChannelList : [channel];
      currentChannelIndex = channelList.indexOf(channel);
      if (currentChannelIndex === -1) currentChannelIndex = 0;

      currentMedia = {
        type: 'live',
        id: channel.id,
        title: channel.name || 'Unknown Channel',
        subtitle: channel.groupTitle || 'Live',
        streamUrl: channel.streamUrl,
        logoUrl: channel.logoUrl,
        channelNo: channel.tvgChno,
        duration: 0,
        position: 0
      };

      this.launchPlayback(currentMedia);
    },

    /**
     * Start playing a VOD movie.
     * @param {Object} movie
     * @param {number} [startPositionMs]
     */
    playMovie: function (movie, startPositionMs) {
      if (!movie) return;

      var streamUrl = movie.streamUrl;
      if (!streamUrl && window.FreeIPTV.PlaylistManager) {
        var activePlaylist = window.FreeIPTV.PlaylistManager.getActivePlaylist();
        if (activePlaylist && window.FreeIPTV.XtreamAPI) {
          streamUrl = window.FreeIPTV.XtreamAPI.generateMovieStreamUrl(
            activePlaylist.server,
            activePlaylist.username,
            activePlaylist.password,
            movie.streamId,
            movie.containerExtension || 'mp4'
          );
        }
      }

      currentMedia = {
        type: 'movie',
        id: movie.streamId,
        title: movie.name || movie.title || 'Movie',
        subtitle: (movie.year ? String(movie.year) + ' • ' : '') + 'Movie',
        streamUrl: streamUrl,
        logoUrl: movie.poster,
        duration: (movie.durationSecs || 0) * 1000,
        position: startPositionMs || 0,
        rawItem: movie
      };

      this.launchPlayback(currentMedia);
    },

    /**
     * Start playing a series episode.
     * @param {Object} series
     * @param {number} seasonNum
     * @param {Object} episode
     * @param {number} [startPositionMs]
     */
    playEpisode: function (series, seasonNum, episode, startPositionMs) {
      if (!episode) return;

      var streamUrl = episode.streamUrl;
      if (!streamUrl && window.FreeIPTV.PlaylistManager) {
        var activePlaylist = window.FreeIPTV.PlaylistManager.getActivePlaylist();
        if (activePlaylist && window.FreeIPTV.XtreamAPI) {
          streamUrl = window.FreeIPTV.XtreamAPI.generateEpisodeStreamUrl(
            activePlaylist.server,
            activePlaylist.username,
            activePlaylist.password,
            episode.id,
            episode.containerExtension || 'mp4'
          );
        }
      }

      currentMedia = {
        type: 'episode',
        id: episode.id,
        seriesId: series.seriesId,
        title: (series.name || 'Series') + ' - S' + seasonNum + 'E' + (episode.episodeNum || 1),
        subtitle: episode.title || ('Episode ' + (episode.episodeNum || 1)),
        streamUrl: streamUrl,
        logoUrl: episode.poster || series.poster,
        duration: (episode.durationSecs || 0) * 1000,
        position: startPositionMs || 0,
        rawItem: episode,
        rawSeries: series
      };

      this.launchPlayback(currentMedia);
    },

    /**
     * Internal launch flow for all media types.
     * @param {Object} media
     */
    launchPlayback: function (media) {
      var activeSessionId = ++currentSessionId;
      clearTimeout(retryTimer);
      retryTimer = null;
      retryCount = 0;
      isPlayerActive = true;
      lastSaveTime = 0;

      // 1. Show player view
      var playerView = document.getElementById('view-player');
      if (playerView) {
        playerView.classList.remove('hidden');
      }

      // 2. Update UI headers & metadata
      this.updatePlayerHeader(media);
      this.configureControlsForMediaType(media.type);
      this.hideErrorOverlay();
      this.showBuffering(true);
      this.showControls();

      // 3. Register custom Back handler on Remote
      var self = this;
      if (window.FreeIPTV.Remote) {
        window.FreeIPTV.Remote.pushBackHandler(function () {
          if (!isPlayerActive) return false;
          if (isControlsVisible) {
            self.hideControls();
            return true;
          } else {
            self.closePlayer();
            return true;
          }
        });
      }

      // 4. Record history
      if (window.FreeIPTV.PlaylistManager && window.FreeIPTV.PlaylistManager.recordWatchHistory) {
        window.FreeIPTV.PlaylistManager.recordWatchHistory({
          contentType: media.type,
          contentId: media.id,
          title: media.title,
          subtitle: media.subtitle,
          poster: media.logoUrl,
          streamUrl: media.streamUrl
        });
      }

      // 5. Focus initial player control
      if (window.FreeIPTV.Navigation) {
        var playBtn = document.getElementById('player-btn-play-pause');
        if (playBtn) {
          window.FreeIPTV.Navigation.focus(playBtn);
        }
      }

      // 6. Check if AVPlay is available or in Mock/Development mode
      var engine = window.FreeIPTV.AVPlayEngine;
      var devNotice = document.getElementById('player-dev-notice');

      if (!engine || !engine.isAvailable()) {
        if (playerView) playerView.classList.add('dev-mock');
        if (devNotice) devNotice.classList.remove('hidden');
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.info('Samsung AVPlay unavailable — running in development mock mode.');
        }
        setTimeout(function () {
          if (activeSessionId === currentSessionId && isPlayerActive) {
            self.showBuffering(false);
          }
        }, 1200);
        return;
      } else {
        if (playerView) playerView.classList.remove('dev-mock');
        if (document.body) document.body.classList.add('player-active');
        if (devNotice) devNotice.classList.add('hidden');
      }

      // 7. Initiate AVPlay stream
      this.startPlayback(media.streamUrl, media.position);
    },

    /**
     * Start stream playback through AVPlay.
     * @param {string} url
     * @param {number} [startPositionMs]
     */
    startPlayback: function (url, startPositionMs) {
      var self = this;
      var engine = window.FreeIPTV.AVPlayEngine;
      if (!engine) return;

      var sessionId = currentSessionId;
      this.showBuffering(true);
      this.hideErrorOverlay();

      engine.open(url)
        .then(function () {
          if (sessionId !== currentSessionId || !isPlayerActive) return false;
          return engine.prepare();
        })
        .then(function () {
          if (sessionId !== currentSessionId || !isPlayerActive) return;
          if (startPositionMs && startPositionMs > 5000) {
            engine.seekTo(startPositionMs);
          }
          self.startProgressTicker();
        })
        .catch(function (error) {
          if (sessionId !== currentSessionId || !isPlayerActive) return;
          self.handlePlaybackError(error);
        });
    },

    /**
     * Handle engine state change.
     * @param {string} state
     */
    onStateChanged: function (state) {
      var engine = window.FreeIPTV.AVPlayEngine;
      if (!engine) return;

      if (state === engine.STATES.PLAYING) {
        this.showBuffering(false);
        this.updatePlayPauseIcon(true);
        retryCount = 0;
      } else if (state === engine.STATES.PAUSED) {
        this.showBuffering(false);
        this.updatePlayPauseIcon(false);
      } else if (state === engine.STATES.BUFFERING || state === engine.STATES.PREPARING || state === engine.STATES.OPENING) {
        this.showBuffering(true);
      } else if (state === engine.STATES.ERROR) {
        this.handlePlaybackError();
      }
    },

    /**
     * Start periodic progress ticker for VOD seekbar and state persistence.
     */
    startProgressTicker: function () {
      var self = this;
      if (progressTimer) clearInterval(progressTimer);

      progressTimer = setInterval(function () {
        self.tickProgress();
      }, PROGRESS_TICK_INTERVAL);
    },

    /**
     * Tick progress: update seek bar, current time, and save progress periodically.
     */
    tickProgress: function () {
      if (!isPlayerActive || !currentMedia) return;
      var engine = window.FreeIPTV.AVPlayEngine;
      if (!engine) return;

      var curTimeMs = engine.getCurrentTime();
      var durMs = engine.getDuration();

      if (durMs <= 0 && currentMedia.duration) {
        durMs = currentMedia.duration;
      }

      currentMedia.position = curTimeMs;
      if (durMs > 0) currentMedia.duration = durMs;

      // Update UI if VOD
      if (currentMedia.type !== 'live' && durMs > 0) {
        this.updateProgressBar(curTimeMs, durMs);
      }

      // Periodically persist progress to PlaylistManager
      var now = Date.now();
      if (currentMedia.type !== 'live' && now - lastSaveTime >= PROGRESS_SAVE_INTERVAL && curTimeMs > 3000) {
        lastSaveTime = now;
        if (window.FreeIPTV.PlaylistManager && window.FreeIPTV.PlaylistManager.savePlaybackProgress) {
          window.FreeIPTV.PlaylistManager.savePlaybackProgress({
            contentType: currentMedia.type,
            contentId: currentMedia.id,
            seriesId: currentMedia.seriesId,
            title: currentMedia.title,
            subtitle: currentMedia.subtitle,
            poster: currentMedia.logoUrl,
            streamUrl: currentMedia.streamUrl,
            positionSec: Math.floor(curTimeMs / 1000),
            durationSec: Math.floor(durMs / 1000)
          });
        }
      }
    },

    /**
     * Update seekbar UI fill and time labels.
     * @param {number} curMs
     * @param {number} durMs
     */
    updateProgressBar: function (curMs, durMs) {
      var curLabel = document.getElementById('player-time-current');
      var durLabel = document.getElementById('player-time-duration');
      var fillBar = document.getElementById('player-seek-bar-fill');

      if (curLabel) curLabel.textContent = this.formatDuration(curMs);
      if (durLabel) durLabel.textContent = this.formatDuration(durMs);

      if (fillBar && durMs > 0) {
        var pct = Math.min(100, Math.max(0, (curMs / durMs) * 100));
        fillBar.style.width = pct.toFixed(1) + '%';
      }
    },

    /**
     * Relative seek by seconds (+/- deltaSec).
     * @param {number} deltaSec
     */
    seek: function (deltaSec) {
      var engine = window.FreeIPTV.AVPlayEngine;
      if (!engine || !isPlayerActive || !currentMedia) return;

      var curMs = engine.getCurrentTime();
      var durMs = engine.getDuration() || currentMedia.duration;
      var targetMs = curMs + (deltaSec * 1000);

      if (targetMs < 0) targetMs = 0;
      if (durMs > 0 && targetMs > durMs) targetMs = durMs - 1000;

      engine.seekTo(targetMs);
      this.showOsdToast((deltaSec > 0 ? '+ ' : '- ') + Math.abs(deltaSec) + 's (' + this.formatDuration(targetMs) + ')');
      this.resetControlsTimer();
    },

    /**
     * Cycle through audio tracks.
     */
    cycleAudioTrack: function () {
      var engine = window.FreeIPTV.AVPlayEngine;
      if (!engine) return;

      var tracks = engine.getTotalTrackInfo();
      var audioTracks = (tracks || []).filter(function (t) { return t.type === 'AUDIO'; });

      if (audioTracks.length <= 1) {
        this.showOsdToast(window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('player.no_extra_audio') : 'Default Audio');
        return;
      }

      var nextIndex = (this._currentAudioTrackIndex || 0) + 1;
      if (nextIndex >= audioTracks.length) nextIndex = 0;
      this._currentAudioTrackIndex = nextIndex;

      var selected = audioTracks[nextIndex];
      engine.setSelectTrack('AUDIO', selected.index);
      var trackLabel = (selected.extra_info ? (selected.extra_info.language || selected.extra_info.four_cc) : '') || ('Track ' + (nextIndex + 1));
      this.showOsdToast('Audio: ' + trackLabel);
    },

    /**
     * Cycle through subtitle tracks.
     */
    cycleSubtitleTrack: function () {
      var engine = window.FreeIPTV.AVPlayEngine;
      if (!engine) return;

      var tracks = engine.getTotalTrackInfo();
      var subTracks = (tracks || []).filter(function (t) { return t.type === 'TEXT'; });

      if (subTracks.length === 0) {
        this.showOsdToast(window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('player.no_subtitles') : 'No Subtitles Available');
        return;
      }

      var nextIndex = (this._currentSubTrackIndex !== undefined ? this._currentSubTrackIndex : -1) + 1;
      if (nextIndex >= subTracks.length) {
        this._currentSubTrackIndex = -1;
        this.showOsdToast('Subtitles: OFF');
        return;
      }

      this._currentSubTrackIndex = nextIndex;
      var selected = subTracks[nextIndex];
      engine.setSelectTrack('TEXT', selected.index);
      var lang = (selected.extra_info ? selected.extra_info.language : '') || ('Subtitle ' + (nextIndex + 1));
      this.showOsdToast('Subtitles: ' + lang);
    },

    /**
     * Show brief on-screen toast display (e.g. Audio, Subtitle, Seek).
     * @param {string} text
     */
    showOsdToast: function (text) {
      var toast = document.getElementById('player-osd-toast');
      if (!toast) return;

      toast.textContent = text;
      toast.classList.remove('hidden');

      clearTimeout(osdToastTimer);
      osdToastTimer = setTimeout(function () {
        toast.classList.add('hidden');
      }, 2500);
    },

    /**
     * Format milliseconds to HH:MM:SS or MM:SS.
     * @param {number} ms
     * @returns {string}
     */
    formatDuration: function (ms) {
      if (!ms || ms < 0 || isNaN(ms)) return '00:00';
      var totalSec = Math.floor(ms / 1000);
      var hours = Math.floor(totalSec / 3600);
      var mins = Math.floor((totalSec % 3600) / 60);
      var secs = totalSec % 60;

      var pad = function (n) { return (n < 10 ? '0' : '') + n; };

      if (hours > 0) {
        return pad(hours) + ':' + pad(mins) + ':' + pad(secs);
      }
      return pad(mins) + ':' + pad(secs);
    },

    /**
     * Configure controls layout based on media type.
     * @param {string} type 'live'|'movie'|'episode'
     */
    configureControlsForMediaType: function (type) {
      var progressContainer = document.getElementById('player-progress-container');
      var btnPrev = document.getElementById('player-btn-prev');
      var btnNext = document.getElementById('player-btn-next');
      var btnRewind = document.getElementById('player-btn-rewind');
      var btnForward = document.getElementById('player-btn-forward');
      var liveBadge = document.querySelector('.player-live-badge');

      if (type === 'live') {
        if (progressContainer) progressContainer.classList.add('hidden');
        if (btnPrev) btnPrev.classList.remove('hidden');
        if (btnNext) btnNext.classList.remove('hidden');
        if (btnRewind) btnRewind.classList.add('hidden');
        if (btnForward) btnForward.classList.add('hidden');
        if (liveBadge) liveBadge.style.display = 'inline-block';
      } else {
        // VOD Movie or Episode
        if (progressContainer) progressContainer.classList.remove('hidden');
        if (btnPrev) btnPrev.classList.add('hidden');
        if (btnNext) btnNext.classList.add('hidden');
        if (btnRewind) btnRewind.classList.remove('hidden');
        if (btnForward) btnForward.classList.remove('hidden');
        if (liveBadge) liveBadge.style.display = 'none';
      }
    },

    /**
     * Update buffering percentage indicator.
     * @param {number} percent
     */
    updateBufferingProgress: function (percent) {
      var label = document.getElementById('player-buffering-percent');
      if (label) {
        label.textContent = typeof percent === 'number' ? percent + '%' : '';
      }
    },

    /**
     * Handle playback error with controlled bounded retry.
     * @param {Object} [error]
     */
    handlePlaybackError: function (error) {
      var self = this;

      clearTimeout(retryTimer);
      retryTimer = null;

      if (retryCount < MAX_RETRIES) {
        retryCount++;
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.warn('Playback error. Retrying attempt ' + retryCount + ' of ' + MAX_RETRIES + ' in 1.5s...');
        }
        this.showBuffering(true);

        var retrySessionId = currentSessionId;
        retryTimer = setTimeout(function () {
          if (isPlayerActive && retrySessionId === currentSessionId && currentMedia) {
            self.startPlayback(currentMedia.streamUrl, currentMedia.position);
          }
        }, 1500);
      } else {
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.error('Playback failed after maximum retries:', error || 'Unknown stream error');
        }
        this.showBuffering(false);
        this.showErrorOverlay();
      }
    },

    /**
     * Channel Zapping: Switch to Next Channel.
     */
    zapNext: function () {
      if (!channelList || channelList.length === 0) return;
      currentChannelIndex = (currentChannelIndex + 1) % channelList.length;
      var nextChannel = channelList[currentChannelIndex];
      this.playChannel(nextChannel, channelList);
    },

    /**
     * Channel Zapping: Switch to Previous Channel.
     */
    zapPrevious: function () {
      if (!channelList || channelList.length === 0) return;
      currentChannelIndex = (currentChannelIndex - 1 + channelList.length) % channelList.length;
      var prevChannel = channelList[currentChannelIndex];
      this.playChannel(prevChannel, channelList);
    },

    /**
     * Retry playing current media.
     */
    retryCurrent: function () {
      retryCount = 0;
      clearTimeout(retryTimer);
      retryTimer = null;
      if (currentMedia) {
        this.startPlayback(currentMedia.streamUrl, currentMedia.position);
      }
    },

    /**
     * Toggle Play / Pause.
     */
    togglePlayPause: function () {
      var engine = window.FreeIPTV.AVPlayEngine;
      if (!engine || !engine.isAvailable()) return;

      if (engine.isPlaying()) {
        engine.pause();
      } else {
        engine.play();
      }
      this.resetControlsTimer();
    },

    /**
     * Cycle through Aspect Ratio modes (FIT -> FULL -> AUTO).
     */
    cycleAspectRatio: function () {
      var engine = window.FreeIPTV.AVPlayEngine;
      if (!engine) return;

      var current = engine.getDisplayMethod();
      var next = 'FIT';
      if (current === 'FIT') next = 'FULL';
      else if (current === 'FULL') next = 'AUTO';
      else next = 'FIT';

      engine.setDisplayMethod(next);

      var label = document.getElementById('player-aspect-label');
      if (label) {
        label.textContent = next;
      }
      this.resetControlsTimer();
    },

    /**
     * Close player, stop media stream, persist final progress, and return to previous view.
     */
    closePlayer: function () {
      if (!isPlayerActive) return;

      // Final progress save
      if (currentMedia && currentMedia.type !== 'live') {
        var engine = window.FreeIPTV.AVPlayEngine;
        var pos = engine ? engine.getCurrentTime() : currentMedia.position;
        var dur = (engine ? engine.getDuration() : 0) || currentMedia.duration;
        if (window.FreeIPTV.PlaylistManager && window.FreeIPTV.PlaylistManager.savePlaybackProgress) {
          window.FreeIPTV.PlaylistManager.savePlaybackProgress({
            contentType: currentMedia.type,
            contentId: currentMedia.id,
            seriesId: currentMedia.seriesId,
            title: currentMedia.title,
            subtitle: currentMedia.subtitle,
            poster: currentMedia.logoUrl,
            streamUrl: currentMedia.streamUrl,
            positionSec: Math.floor(pos / 1000),
            durationSec: Math.floor(dur / 1000)
          });
        }
      }

      isPlayerActive = false;
      currentSessionId++;
      clearTimeout(controlsTimer);
      clearTimeout(retryTimer);
      if (progressTimer) clearInterval(progressTimer);
      progressTimer = null;
      retryTimer = null;
      retryCount = 0;

      var avEngine = window.FreeIPTV.AVPlayEngine;
      if (avEngine) {
        avEngine.stop();
        avEngine.close();
      }

      var playerView = document.getElementById('view-player');
      if (playerView) {
        playerView.classList.remove('dev-mock');
        playerView.classList.add('hidden');
      }

      if (document.body) {
        document.body.classList.remove('player-active');
      }

      if (window.FreeIPTV.Remote) {
        window.FreeIPTV.Remote.popBackHandler();
      }

      // Return focus to appropriate view
      if (window.FreeIPTV.Navigation) {
        var restoreEl = null;
        if (currentMedia && currentMedia.type === 'live') {
          restoreEl = document.querySelector('[data-channel-id="' + (currentChannel ? currentChannel.id : '') + '"]') ||
                      document.querySelector('#live-channels-container .focusable');
        } else if (currentMedia && currentMedia.type === 'movie') {
          restoreEl = document.querySelector('#movie-btn-play') || document.querySelector('.movies-grid-container .focusable');
        } else if (currentMedia && currentMedia.type === 'episode') {
          restoreEl = document.querySelector('.episode-item.focused') || document.querySelector('#series-episodes-list .focusable');
        }

        if (!restoreEl) {
          restoreEl = document.querySelector('.app-sidebar .focusable.active') || document.querySelector('.focusable');
        }
        if (restoreEl) {
          window.FreeIPTV.Navigation.focus(restoreEl);
        }
      }

      currentChannel = null;
      currentMedia = null;
    },

    /**
     * Check if player view is currently open.
     * @returns {boolean}
     */
    isActive: function () {
      return isPlayerActive;
    },

    /**
     * Show player controls overlay and restart inactivity timer.
     */
    showControls: function () {
      var overlay = document.getElementById('player-controls-overlay');
      if (overlay) {
        overlay.classList.remove('hidden');
      }
      isControlsVisible = true;
      this.resetControlsTimer();
    },

    /**
     * Hide player controls overlay.
     */
    hideControls: function () {
      var errorOverlay = document.getElementById('player-error-overlay');
      if (errorOverlay && !errorOverlay.classList.contains('hidden')) {
        return;
      }

      var overlay = document.getElementById('player-controls-overlay');
      if (overlay) {
        overlay.classList.add('hidden');
      }
      isControlsVisible = false;
      clearTimeout(controlsTimer);
    },

    /**
     * Reset the auto-hide controls timer.
     */
    resetControlsTimer: function () {
      var self = this;
      clearTimeout(controlsTimer);
      controlsTimer = setTimeout(function () {
        self.hideControls();
      }, CONTROLS_HIDE_DELAY);
    },

    /**
     * Toggle visibility of controls when OK is pressed.
     */
    toggleControls: function () {
      if (isControlsVisible) {
        this.hideControls();
      } else {
        this.showControls();
        if (window.FreeIPTV.Navigation) {
          var playBtn = document.getElementById('player-btn-play-pause');
          if (playBtn) {
            window.FreeIPTV.Navigation.focus(playBtn);
          }
        }
      }
    },

    /**
     * Update channel / media header text and logo.
     * @param {Object} media
     */
    updatePlayerHeader: function (media) {
      var nameEl = document.getElementById('player-channel-name');
      var catEl = document.getElementById('player-channel-category');
      var numEl = document.getElementById('player-channel-number');
      var logoImg = document.getElementById('player-channel-logo');
      var fallbackIcon = document.getElementById('player-fallback-logo');

      if (nameEl) nameEl.textContent = media.title || 'Unknown Title';
      if (catEl) catEl.textContent = media.subtitle || '';
      if (numEl) numEl.textContent = media.channelNo ? 'CH ' + media.channelNo : '';

      if (logoImg && fallbackIcon) {
        if (media.logoUrl) {
          logoImg.src = media.logoUrl;
          logoImg.style.display = 'block';
          fallbackIcon.style.display = 'none';

          logoImg.onerror = function () {
            logoImg.style.display = 'none';
            fallbackIcon.style.display = 'flex';
          };
        } else {
          logoImg.style.display = 'none';
          fallbackIcon.style.display = 'flex';
        }
      }
    },

    /**
     * Show or hide buffering spinner.
     * @param {boolean} show
     */
    showBuffering: function (show) {
      var spinner = document.getElementById('player-buffering-overlay');
      if (spinner) {
        if (show) spinner.classList.remove('hidden');
        else spinner.classList.add('hidden');
      }
    },

    /**
     * Show error overlay.
     */
    showErrorOverlay: function () {
      var overlay = document.getElementById('player-error-overlay');
      if (overlay) {
        overlay.classList.remove('hidden');
        this.showControls();
      }

      if (window.FreeIPTV.Navigation) {
        var retryBtn = document.getElementById('player-error-retry');
        if (retryBtn) {
          window.FreeIPTV.Navigation.focus(retryBtn);
        }
      }
    },

    /**
     * Hide error overlay.
     */
    hideErrorOverlay: function () {
      var overlay = document.getElementById('player-error-overlay');
      if (overlay) {
        overlay.classList.add('hidden');
      }
    },

    /**
     * Update Play/Pause icon.
     * @param {boolean} isPlaying
     */
    updatePlayPauseIcon: function (isPlaying) {
      var playSvg = document.getElementById('player-icon-play');
      var pauseSvg = document.getElementById('player-icon-pause');
      if (playSvg && pauseSvg) {
        if (isPlaying) {
          playSvg.style.display = 'none';
          pauseSvg.style.display = 'block';
        } else {
          playSvg.style.display = 'block';
          pauseSvg.style.display = 'none';
        }
      }
    }
  };

  window.FreeIPTV.Player = Player;
})(window);
