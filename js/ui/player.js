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
  var savedRouteBeforePlayer = null;
  var savedFocusBeforePlayer = null;
  var isScrubbing = false;
  var scrubTargetMs = 0;
  var isEpisodesOverlayOpen = false;
  var playerSeriesDetails = null;
  var playerAvailableSeasons = [];
  var playerSelectedSeason = 1;

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
          } else if (currentMedia && currentMedia.type === 'episode') {
            self.playAdjacentEpisode(-1);
          }
        });
      }

      // Next channel / episode button
      var btnNext = document.getElementById('player-btn-next');
      if (btnNext) {
        btnNext.addEventListener('click', function () {
          if (currentMedia && currentMedia.type === 'live') {
            self.zapNext();
          } else if (currentMedia && currentMedia.type === 'episode') {
            self.playAdjacentEpisode(1);
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

      // In-player Episodes list button (Series only)
      var btnEpisodes = document.getElementById('player-btn-episodes');
      if (btnEpisodes) {
        btnEpisodes.addEventListener('click', function (e) {
          if (e && e.stopPropagation) e.stopPropagation();
          self.openEpisodesOverlay();
        });
      }

      // In-player Episodes overlay close button
      var btnEpisodesClose = document.getElementById('player-episodes-close');
      if (btnEpisodesClose) {
        btnEpisodesClose.addEventListener('click', function (e) {
          if (e && e.stopPropagation) e.stopPropagation();
          self.closeEpisodesOverlay(true);
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

      // Interactive timeline seek bar track
      var seekTrack = document.getElementById('player-seek-bar-track');
      if (seekTrack) {
        seekTrack.addEventListener('click', function (e) {
          self.handleTimelineClick(e);
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

        var engine = window.FreeIPTV.PlayerManager || window.FreeIPTV.AVPlayEngine;
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

      var moviePoster = movie.posterUrl || movie.poster || movie.streamIcon || '';
      currentMedia = {
        type: 'movie',
        id: movie.streamId || movie.id,
        title: movie.name || movie.title || 'Movie',
        subtitle: (movie.year ? String(movie.year) + ' • ' : '') + 'Movie',
        streamUrl: streamUrl,
        logoUrl: moviePoster,
        posterUrl: moviePoster,
        poster: moviePoster,
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
    playAdjacentEpisode: function (delta) {
      var q = this._episodeQueue || [];
      var cur = currentMedia && currentMedia.id;
      var idx = -1;
      for (var i = 0; i < q.length; i++) {
        if (String(q[i].id) === String(cur)) { idx = i; break; }
      }
      var target = idx === -1 ? null : q[idx + delta];
      if (!target) return;
      this.playEpisode(this._episodeSeries, this._episodeSeason, target, 0, q);
    },

    playEpisode: function (series, seasonNum, episode, startPositionMs, episodeList) {
      if (!episode) return;
      var sObj = series || this._episodeSeries || {
        id: episode.seriesId,
        seriesId: episode.seriesId,
        name: episode.seriesName || 'Series'
      };
      var sNum = Number(seasonNum !== undefined ? seasonNum : (episode.seasonNumber || 1)) || 1;

      this._episodeSeries = sObj;
      this._episodeSeason = sNum;
      if (episodeList && episodeList.length > 0) {
        this._episodeQueue = episodeList;
      }

      // Ensure full series seasons & episodes context is loaded for the in-player episodes overlay
      this.loadSeriesEpisodesContext(sObj, sNum);

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

      var epPoster = (episode && (episode.thumbnailUrl || episode.posterUrl || episode.poster || episode.cover)) ||
                     (sObj && (sObj.posterUrl || sObj.poster || sObj.cover)) || '';
      var epNumber = episode.episodeNumber !== undefined ? episode.episodeNumber : (episode.episode_num !== undefined ? episode.episode_num : (episode.episodeNum || 1));
      var epTitle = episode.name || episode.title || ('Episode ' + epNumber);
      var sName = sObj.name || sObj.title || episode.seriesName || 'Series';

      currentMedia = {
        type: 'episode',
        id: episode.id,
        seriesId: sObj.seriesId || sObj.id || episode.seriesId,
        seriesName: sName,
        seasonNumber: sNum,
        episodeNumber: epNumber,
        title: sName + ' - S' + (sNum < 10 ? '0' + sNum : sNum) + 'E' + (epNumber < 10 ? '0' + epNumber : epNumber),
        subtitle: epTitle,
        streamUrl: streamUrl,
        logoUrl: epPoster,
        posterUrl: epPoster,
        poster: epPoster,
        duration: (episode.durationSecs || (episode.metadata && episode.metadata.durationSeconds) || 0) * 1000,
        position: startPositionMs || 0,
        rawItem: episode,
        rawSeries: sObj
      };

      this.launchPlayback(currentMedia);
    },

    /**
     * Explicit lifecycle: Enter dedicated player display mode (Phase 6.4).
     * @param {Object} media
     */
    enterPlayerMode: function (media) {
      if (!isPlayerActive && window.FreeIPTV.Navigation) {
        savedRouteBeforePlayer = window.FreeIPTV.Navigation.getCurrentRoute() || 'home';
        savedFocusBeforePlayer = window.FreeIPTV.Navigation.getCurrent();
      }

      // Add player-active to documentElement and body for native transparency
      if (document.documentElement) document.documentElement.classList.add('player-active');
      if (document.body) document.body.classList.add('player-active');

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('PLAYER ENTER');
        window.FreeIPTV.Logger.info('ORIGIN ROUTE: ' + (savedRouteBeforePlayer || 'unknown'));
        window.FreeIPTV.Logger.info('AVPLAY STATE: READY');
        window.FreeIPTV.Logger.info('PLAYER MODE: ACTIVE');
      }

      // Configure AVPlay display area & method for full screen
      var engine = window.FreeIPTV.AVPlayEngine;
      if (engine && typeof engine.setDisplayArea === 'function') {
        engine.setDisplayArea(0, 0, 1920, 1080);
        engine.setDisplayMethod('FULL');
      }
    },

    /**
     * Internal launch flow for all media types.
     * @param {Object} media
     */
    launchPlayback: function (media) {
      var wasAlreadyActive = isPlayerActive;
      var activeSessionId = ++currentSessionId;
      clearTimeout(retryTimer);
      retryTimer = null;
      retryCount = 0;

      if (isEpisodesOverlayOpen) {
        this.closeEpisodesOverlay(false);
      }

      // 1. Enter explicit player display mode & transparency
      this.enterPlayerMode(media);
      isPlayerActive = true;
      lastSaveTime = 0;

      // 2. Show player view
      var playerView = document.getElementById('view-player');
      if (playerView) {
        playerView.classList.remove('hidden');
      }

      // 3. Update UI headers & metadata
      this.updatePlayerHeader(media);
      this.configureControlsForMediaType(media.type);
      this.hideErrorOverlay();
      this.showBuffering(true);
      this.showControls();

      // 4. Register custom Back handler on Remote (only once per active player session)
      var self = this;
      if (!wasAlreadyActive && window.FreeIPTV.Remote) {
        window.FreeIPTV.Remote.pushBackHandler(function () {
          if (!isPlayerActive) return false;
          if (isEpisodesOverlayOpen) {
            self.closeEpisodesOverlay(true);
            return true;
          }
          if (isControlsVisible) {
            self.hideControls();
            return true;
          } else {
            self.closePlayer();
            return true;
          }
        });
      }

      // 5. Record history
      if (window.FreeIPTV.PlaylistManager && window.FreeIPTV.PlaylistManager.recordWatchHistory) {
        var histPoster = media.posterUrl || media.poster || media.logoUrl || '';
        window.FreeIPTV.PlaylistManager.recordWatchHistory({
          contentType: media.type,
          contentId: media.id,
          seriesId: media.seriesId,
          seriesName: media.seriesName,
          seasonNumber: media.seasonNumber,
          episodeNumber: media.episodeNumber,
          title: media.title,
          subtitle: media.subtitle,
          poster: histPoster,
          posterUrl: histPoster,
          streamUrl: media.streamUrl,
          positionSeconds: media.position ? Math.floor(media.position / 1000) : 0,
          durationSeconds: media.duration ? Math.floor(media.duration / 1000) : 0
        });
      }

      // 6. Focus initial player control
      if (window.FreeIPTV.Navigation) {
        var playBtn = document.getElementById('player-btn-play-pause');
        if (playBtn) {
          window.FreeIPTV.Navigation.focus(playBtn);
        }
      }

      // 7. Check platform playback adapter
      var platform = window.FreeIPTV.PlayerManager ? window.FreeIPTV.PlayerManager.getPlatform() : 'samsung';
      var devNotice = document.getElementById('player-dev-notice');

      if (devNotice) {
        devNotice.classList.add('hidden');
      }
      if (playerView) {
        playerView.classList.remove('dev-mock');
      }

      // 8. Initiate stream playback through active adapter
      this.startPlayback(media.streamUrl, media.position);
    },

    /**
     * Start stream playback through active engine.
     * @param {string} url
     * @param {number} [startPositionMs]
     */
    startPlayback: function (url, startPositionMs) {
      var self = this;
      var engine = window.FreeIPTV.PlayerManager || window.FreeIPTV.AVPlayEngine;
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
      var engine = window.FreeIPTV.PlayerManager || window.FreeIPTV.AVPlayEngine;
      if (!engine) return;

      var curTimeMs = engine.getCurrentTime();
      var durMs = engine.getDuration();

      if (durMs <= 0 && currentMedia.duration) {
        durMs = currentMedia.duration;
      }

      currentMedia.position = curTimeMs;
      if (durMs > 0) currentMedia.duration = durMs;

      // Update UI if VOD and user is not scrubbing manually
      if (currentMedia.type !== 'live' && durMs > 0 && !isScrubbing) {
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
            seriesName: currentMedia.seriesName,
            seasonNumber: currentMedia.seasonNumber,
            episodeNumber: currentMedia.episodeNumber,
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
     * Update seekbar UI fill, thumb position, buffered bar, and time labels.
     * @param {number} curMs
     * @param {number} durMs
     */
    updateProgressBar: function (curMs, durMs) {
      var curLabel = document.getElementById('player-time-current');
      var durLabel = document.getElementById('player-time-duration');
      var fillBar = document.getElementById('player-seek-bar-fill');
      var thumb = document.getElementById('player-seek-thumb');

      if (curLabel) curLabel.textContent = this.formatDuration(curMs);
      if (durLabel) durLabel.textContent = this.formatDuration(durMs);

      if (durMs > 0) {
        var pct = Math.min(100, Math.max(0, (curMs / durMs) * 100));
        var pctStr = pct.toFixed(1) + '%';
        if (fillBar) fillBar.style.width = pctStr;
        if (thumb) thumb.style.left = pctStr;
      }
    },

    /**
     * Interactive timeline scrubbing handler (Left / Right step, Enter/OK commit).
     * @param {'left'|'right'|'enter'|'cancel'} action
     */
    handleTimelineKey: function (action) {
      if (!isPlayerActive || !currentMedia || currentMedia.type === 'live') return;
      var engine = window.FreeIPTV.PlayerManager || window.FreeIPTV.AVPlayEngine;
      if (!engine) return;

      var durMs = engine.getDuration() || currentMedia.duration || 0;
      if (durMs <= 0) return;

      if (!isScrubbing) {
        isScrubbing = true;
        scrubTargetMs = engine.getCurrentTime();
        var track = document.getElementById('player-seek-bar-track');
        if (track) track.classList.add('scrubbing');
        var preview = document.getElementById('player-seek-preview');
        if (preview) preview.classList.remove('hidden');
      }

      // Step sizing: proportional jumps so 10-20 presses traverse any duration
      // Step size is 1% of total duration, clamped between 10s and 60s
      var stepMs = Math.max(10000, Math.min(60000, Math.round(durMs * 0.015)));

      if (action === 'left') {
        scrubTargetMs = Math.max(0, scrubTargetMs - stepMs);
        this.renderScrubState(scrubTargetMs, durMs);
        this.resetControlsTimer();
      } else if (action === 'right') {
        scrubTargetMs = Math.min(durMs, scrubTargetMs + stepMs);
        this.renderScrubState(scrubTargetMs, durMs);
        this.resetControlsTimer();
      } else if (action === 'enter') {
        // Commit seek
        this.commitScrub(scrubTargetMs);
      } else if (action === 'cancel') {
        this.cancelScrub();
      }
    },

    /**
     * Render the transient scrubber position while user is adjusting preview thumb.
     */
    renderScrubState: function (targetMs, durMs) {
      var curLabel = document.getElementById('player-time-current');
      var fillBar = document.getElementById('player-seek-bar-fill');
      var thumb = document.getElementById('player-seek-thumb');
      var preview = document.getElementById('player-seek-preview');
      var previewTime = document.getElementById('player-seek-preview-time');

      var pct = Math.min(100, Math.max(0, (targetMs / durMs) * 100));
      var pctStr = pct.toFixed(1) + '%';

      if (curLabel) curLabel.textContent = this.formatDuration(targetMs);
      if (fillBar) fillBar.style.width = pctStr;
      if (thumb) thumb.style.left = pctStr;
      if (preview) {
        preview.style.left = pctStr;
        preview.classList.remove('hidden');
      }
      if (previewTime) previewTime.textContent = this.formatDuration(targetMs);
    },

    /**
     * Commit scrub position to media engine.
     */
    commitScrub: function (targetMs) {
      isScrubbing = false;
      var track = document.getElementById('player-seek-bar-track');
      if (track) track.classList.remove('scrubbing');
      var preview = document.getElementById('player-seek-preview');
      if (preview) preview.classList.add('hidden');

      var engine = window.FreeIPTV.PlayerManager || window.FreeIPTV.AVPlayEngine;
      if (engine) {
        engine.seekTo(targetMs);
      }
      this.showOsdToast('Seek: ' + this.formatDuration(targetMs));
      this.resetControlsTimer();
    },

    /**
     * Cancel scrub and restore actual playback position.
     */
    cancelScrub: function () {
      isScrubbing = false;
      var track = document.getElementById('player-seek-bar-track');
      if (track) track.classList.remove('scrubbing');
      var preview = document.getElementById('player-seek-preview');
      if (preview) preview.classList.add('hidden');

      var engine = window.FreeIPTV.PlayerManager || window.FreeIPTV.AVPlayEngine;
      if (engine && currentMedia) {
        var curMs = engine.getCurrentTime();
        var durMs = engine.getDuration() || currentMedia.duration || 0;
        this.updateProgressBar(curMs, durMs);
      }
    },

    /**
     * Handle mouse or touch click on scrubber track.
     */
    handleTimelineClick: function (e) {
      if (!isPlayerActive || !currentMedia || currentMedia.type === 'live') return;
      var track = document.getElementById('player-seek-bar-track');
      if (!track) return;

      var rect = track.getBoundingClientRect();
      var clickX = e.clientX - rect.left;
      var pct = Math.max(0, Math.min(1, clickX / rect.width));

      var engine = window.FreeIPTV.PlayerManager || window.FreeIPTV.AVPlayEngine;
      if (!engine) return;

      var durMs = engine.getDuration() || currentMedia.duration || 0;
      if (durMs > 0) {
        var targetMs = Math.round(durMs * pct);
        this.commitScrub(targetMs);
      }
    },

    /**
     * Relative seek by seconds (+/- deltaSec).
     * @param {number} deltaSec
     */
    seek: function (deltaSec) {
      var engine = window.FreeIPTV.PlayerManager || window.FreeIPTV.AVPlayEngine;
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
      var engine = window.FreeIPTV.PlayerManager || window.FreeIPTV.AVPlayEngine;
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
      var engine = window.FreeIPTV.PlayerManager || window.FreeIPTV.AVPlayEngine;
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
      var btnEpisodes = document.getElementById('player-btn-episodes');
      var liveBadge = document.querySelector('.player-live-badge');

      if (type === 'live') {
        if (progressContainer) progressContainer.classList.add('hidden');
        if (btnPrev) btnPrev.classList.remove('hidden');
        if (btnNext) btnNext.classList.remove('hidden');
        if (btnRewind) btnRewind.classList.add('hidden');
        if (btnForward) btnForward.classList.add('hidden');
        if (btnEpisodes) btnEpisodes.classList.add('hidden');
        if (liveBadge) liveBadge.style.display = 'inline-block';
      } else {
        // VOD Movie or Episode
        if (progressContainer) progressContainer.classList.remove('hidden');
        if (btnPrev) btnPrev.classList.toggle('hidden', type !== 'episode');
        if (btnNext) btnNext.classList.toggle('hidden', type !== 'episode');
        if (btnEpisodes) btnEpisodes.classList.toggle('hidden', type !== 'episode');
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
        var errDesc = 'The stream may be unavailable or unsupported.';
        if (error) {
          if (typeof error === 'string') {
            errDesc = error;
          } else if (error.message) {
            errDesc = error.message;
          } else if (error.error) {
            errDesc = String(error.error);
          }
        }
        var descEl = document.querySelector('#player-error-overlay .player-error-desc');
        if (descEl) {
          descEl.textContent = errDesc;
        }

        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.error('Playback failed after maximum retries:', errDesc);
        }
        this.showBuffering(false);
        this.showErrorOverlay();
      }
    },

    getCurrentMedia: function () {
      return currentMedia;
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
      var engine = window.FreeIPTV.PlayerManager || window.FreeIPTV.AVPlayEngine;
      if (!engine || !engine.isAvailable()) return;

      if (engine.isPlaying()) {
        engine.pause();
      } else {
        engine.play();
      }
      this.resetControlsTimer();
    },

    /**
     * Close player, stop media stream, persist final progress, and return to previous view.
     */
    closePlayer: function () {
      if (!isPlayerActive) return;

      if (isEpisodesOverlayOpen) {
        this.closeEpisodesOverlay(false);
      }

      // Final progress save
      if (currentMedia && currentMedia.type !== 'live') {
        var engine = window.FreeIPTV.PlayerManager || window.FreeIPTV.AVPlayEngine;
        var pos = engine ? engine.getCurrentTime() : currentMedia.position;
        var dur = (engine ? engine.getDuration() : 0) || currentMedia.duration;
        if (window.FreeIPTV.PlaylistManager && window.FreeIPTV.PlaylistManager.savePlaybackProgress) {
          window.FreeIPTV.PlaylistManager.savePlaybackProgress({
            contentType: currentMedia.type,
            contentId: currentMedia.id,
            seriesId: currentMedia.seriesId,
            seriesName: currentMedia.seriesName,
            seasonNumber: currentMedia.seasonNumber,
            episodeNumber: currentMedia.episodeNumber,
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
      playerSeriesDetails = null;
      playerAvailableSeasons = [];

      var avEngine = window.FreeIPTV.PlayerManager || window.FreeIPTV.AVPlayEngine;
      if (avEngine) {
        avEngine.stop();
        avEngine.close();
      }

      var playerView = document.getElementById('view-player');
      if (playerView) {
        playerView.classList.remove('dev-mock');
        playerView.classList.add('hidden');
      }

      if (window.FreeIPTV.Remote) {
        window.FreeIPTV.Remote.popBackHandler();
      }

      this.exitPlayerMode();

      currentChannel = null;
      currentMedia = null;
    },

    /**
     * Explicit lifecycle: Exit dedicated player display mode (Phase 6.4).
     */
    exitPlayerMode: function () {
      if (document.documentElement) document.documentElement.classList.remove('player-active');
      if (document.body) document.body.classList.remove('player-active');

      var targetRoute = savedRouteBeforePlayer || 'home';
      var targetFocus = savedFocusBeforePlayer;

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('PLAYER EXIT');
        window.FreeIPTV.Logger.info('RESTORE ROUTE: ' + targetRoute);
        window.FreeIPTV.Logger.info('RESTORE FOCUS: ' + (targetFocus ? (targetFocus.id || targetFocus.className || targetFocus.tagName) : 'default'));
      }

      // Restore view via Home.switchView if not already active
      if (window.FreeIPTV.Home && typeof window.FreeIPTV.Home.switchView === 'function') {
        window.FreeIPTV.Home.switchView(targetRoute);
      }

      // Restore focus to saved element if still connected and focusable
      if (window.FreeIPTV.Navigation) {
        if (targetFocus && document.body.contains(targetFocus) && targetFocus.offsetParent !== null) {
          window.FreeIPTV.Navigation.focus(targetFocus);
        } else {
          // Fallback to media context or view default focus
          var restoreEl = null;
          if (currentMedia && currentMedia.type === 'live') {
            restoreEl = document.querySelector('[data-channel-id="' + (currentChannel ? currentChannel.id : '') + '"]') ||
                        document.querySelector('#live-channels-container .focusable');
          } else if (currentMedia && currentMedia.type === 'movie') {
            restoreEl = document.getElementById('btn-movie-resume') ||
                        document.getElementById('btn-movie-play') ||
                        document.getElementById('movie-btn-play') ||
                        document.querySelector('#view-movie_details .focusable') ||
                        document.querySelector('#movies-grid-container .focusable');
          } else if (currentMedia && currentMedia.type === 'episode') {
            restoreEl = document.querySelector('.series-episode-card.focused') ||
                        document.querySelector('.series-episode-card.active') ||
                        document.querySelector('#series-episodes-list .focusable') ||
                        document.querySelector('#view-series_details .focusable');
          }

          if (!restoreEl) {
            restoreEl = document.querySelector('.view-screen:not(.hidden) .focusable') ||
                        document.querySelector('#home-quick-access-section .focusable') ||
                        document.querySelector('.focusable');
          }
          if (restoreEl) {
            window.FreeIPTV.Navigation.focus(restoreEl);
          }
        }
      }

      savedRouteBeforePlayer = null;
      savedFocusBeforePlayer = null;
    },

    /**
     * Check if player view is currently open.
     * @returns {boolean}
     */
    isActive: function () {
      return isPlayerActive;
    },

    /**
     * Check if the in-player episodes list overlay is currently open.
     * @returns {boolean}
     */
    isEpisodesModalOpen: function () {
      return isEpisodesOverlayOpen;
    },

    /**
     * Load all seasons & episodes for the currently playing series so the in-player
     * episodes overlay can switch between any season and play any episode.
     * @param {Object} series
     * @param {number} [currentSeasonNum]
     * @param {Function} [callback]
     */
    loadSeriesEpisodesContext: function (series, currentSeasonNum, callback) {
      var self = this;
      var sNum = Number(currentSeasonNum || this._episodeSeason || 1) || 1;
      var seriesId = series && (series.seriesId || series.id);

      // Extract helper to normalize seasons + episodesBySeason into playerAvailableSeasons
      var applyDetails = function (details) {
        if (!details) return;
        playerSeriesDetails = details;
        if (seriesId) playerSeriesDetails._seriesId = String(seriesId);

        var seasonMap = {};
        var seasonsList = [];

        if (Array.isArray(details.seasons)) {
          for (var i = 0; i < details.seasons.length; i++) {
            var s = details.seasons[i];
            var num = Number(s.seasonNumber !== undefined ? s.seasonNumber : s.season_number);
            if (!isNaN(num) && num > 0 && !seasonMap[num]) {
              var epArr = (details.episodesBySeason && details.episodesBySeason[String(num)]) || [];
              seasonMap[num] = {
                seasonNumber: num,
                name: s.name || ('Season ' + num),
                episodeCount: epArr.length || s.episodeCount || s.episode_count || 0
              };
              seasonsList.push(seasonMap[num]);
            }
          }
        }

        if (details.episodesBySeason && typeof details.episodesBySeason === 'object') {
          var keys = Object.keys(details.episodesBySeason);
          for (var k = 0; k < keys.length; k++) {
            var kNum = Number(keys[k]);
            var kEps = details.episodesBySeason[keys[k]];
            if (!isNaN(kNum) && kNum > 0 && Array.isArray(kEps) && kEps.length > 0 && !seasonMap[kNum]) {
              seasonMap[kNum] = {
                seasonNumber: kNum,
                name: 'Season ' + kNum,
                episodeCount: kEps.length
              };
              seasonsList.push(seasonMap[kNum]);
            }
          }
        }

        seasonsList.sort(function (a, b) { return a.seasonNumber - b.seasonNumber; });
        if (seasonsList.length > 0) {
          playerAvailableSeasons = seasonsList;
        }

        if (details.episodesBySeason && details.episodesBySeason[String(sNum)] && details.episodesBySeason[String(sNum)].length > 0) {
          self._episodeQueue = details.episodesBySeason[String(sNum)];
        }
      };

      // If series object itself already carries episodesBySeason/seasons, apply immediately
      if (series && (series.episodesBySeason || series.seasons)) {
        applyDetails(series);
      }

      // Ensure fallback season entry from _episodeQueue while async fetch runs
      if (!playerAvailableSeasons || playerAvailableSeasons.length === 0) {
        var fallbackQueue = (this._episodeQueue && this._episodeQueue.length > 0)
          ? this._episodeQueue
          : (currentMedia && currentMedia.rawItem ? [currentMedia.rawItem] : []);
        playerAvailableSeasons = [{
          seasonNumber: sNum,
          name: 'Season ' + sNum,
          episodeCount: fallbackQueue.length
        }];
      }

      if (playerSeriesDetails && seriesId && String(playerSeriesDetails._seriesId) === String(seriesId) && playerSeriesDetails.episodesBySeason) {
        applyDetails(playerSeriesDetails);
        if (callback) callback(playerSeriesDetails);
        return;
      }

      if (seriesId && window.FreeIPTV.PlaylistManager && typeof window.FreeIPTV.PlaylistManager.getSeriesDetails === 'function') {
        var activePl = window.FreeIPTV.PlaylistManager.getActivePlaylist
          ? window.FreeIPTV.PlaylistManager.getActivePlaylist()
          : null;
        var plId = (series && series.playlistId) || (activePl && activePl.id) || null;

        var p = window.FreeIPTV.PlaylistManager.getSeriesDetails(plId, series);
        if (p && typeof p.then === 'function') {
          p.then(function (details) {
            if (details) {
              applyDetails(details);
              if (isEpisodesOverlayOpen) {
                self.renderPlayerSeasons();
                self.renderPlayerEpisodes(playerSelectedSeason);
                self.focusEpisodesOverlayDefault();
              }
            }
            if (callback) callback(details);
          }).catch(function () {
            if (callback) callback(null);
          });
        }
      } else if (callback) {
        callback(playerSeriesDetails);
      }
    },

    /**
     * Focus the default element inside the in-player Episodes & Seasons overlay.
     */
    focusEpisodesOverlayDefault: function () {
      if (!window.FreeIPTV.Navigation) return;
      var activeEpEl = document.querySelector('#player-episodes-list .player-episode-item.active') ||
                       document.querySelector('#player-episodes-list .player-episode-item.focusable') ||
                       document.querySelector('#player-episodes-seasons .player-season-tab.active') ||
                       document.querySelector('#player-episodes-seasons .player-season-tab.focusable') ||
                       document.getElementById('player-episodes-close');
      if (activeEpEl) {
        window.FreeIPTV.Navigation.focus(activeEpEl);
        if (typeof activeEpEl.scrollIntoView === 'function') {
          try { activeEpEl.scrollIntoView({ block: 'nearest' }); } catch (e) {}
        }
      }
    },

    /**
     * Open the in-player Episodes & Seasons overlay.
     */
    openEpisodesOverlay: function () {
      if (!currentMedia || currentMedia.type !== 'episode') return;

      var overlay = document.getElementById('player-episodes-overlay');
      if (!overlay) return;

      isEpisodesOverlayOpen = true;
      clearTimeout(controlsTimer);

      var controls = document.getElementById('player-controls-overlay');
      if (controls) {
        controls.classList.add('hidden');
      }

      var titleEl = document.getElementById('player-episodes-series-title');
      var seriesTitle = (this._episodeSeries && (this._episodeSeries.name || this._episodeSeries.title)) ||
                        currentMedia.seriesName ||
                        currentMedia.title ||
                        (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('player.episodes') : 'Episodes');
      if (titleEl) {
        titleEl.textContent = seriesTitle;
      }

      playerSelectedSeason = Number(currentMedia.seasonNumber || this._episodeSeason || 1) || 1;
      overlay.classList.remove('hidden');

      this.renderPlayerSeasons();
      this.renderPlayerEpisodes(playerSelectedSeason);
      this.focusEpisodesOverlayDefault();

      // Refresh series details if not yet loaded
      if (!playerSeriesDetails || !playerSeriesDetails.episodesBySeason) {
        this.loadSeriesEpisodesContext(this._episodeSeries, playerSelectedSeason);
      }
    },

    /**
     * Close the in-player Episodes & Seasons overlay.
     * @param {boolean} [restoreFocusToBtn]
     */
    closeEpisodesOverlay: function (restoreFocusToBtn) {
      isEpisodesOverlayOpen = false;
      var overlay = document.getElementById('player-episodes-overlay');
      if (overlay) {
        overlay.classList.add('hidden');
      }

      if (restoreFocusToBtn && isPlayerActive) {
        this.showControls();
        if (window.FreeIPTV.Navigation) {
          var btnEpisodes = document.getElementById('player-btn-episodes');
          var targetBtn = (btnEpisodes && !btnEpisodes.classList.contains('hidden'))
            ? btnEpisodes
            : document.getElementById('player-btn-play-pause');
          if (targetBtn) {
            window.FreeIPTV.Navigation.focus(targetBtn);
          }
        }
      }
    },

    /**
     * Render the season selector tabs inside the in-player episodes overlay.
     */
    renderPlayerSeasons: function () {
      var self = this;
      var seasonsContainer = document.getElementById('player-episodes-seasons');
      if (!seasonsContainer) return;

      seasonsContainer.innerHTML = '';

      var seasons = playerAvailableSeasons && playerAvailableSeasons.length > 0
        ? playerAvailableSeasons
        : [{ seasonNumber: playerSelectedSeason || 1, name: 'Season ' + (playerSelectedSeason || 1), episodeCount: (this._episodeQueue || []).length }];

      for (var i = 0; i < seasons.length; i++) {
        (function (sObj) {
          var sNum = Number(sObj.seasonNumber) || 1;
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'player-season-tab focusable' + (sNum === Number(playerSelectedSeason) ? ' active' : '');
          btn.setAttribute('tabindex', '0');
          btn.setAttribute('data-nav-zone', 'player_episodes_seasons');
          btn.setAttribute('data-season-num', String(sNum));

          var label = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('series.season', { num: sNum }) : ('Season ' + sNum);
          if (label.indexOf('{num}') !== -1) {
            label = label.replace('{num}', sNum);
          } else if (label.indexOf(String(sNum)) === -1) {
            label = label + ' ' + sNum;
          }
          if (sObj.episodeCount) {
            label += ' (' + sObj.episodeCount + ')';
          }
          btn.textContent = label;

          btn.addEventListener('click', function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            self.selectPlayerSeason(sNum, true);
          });

          seasonsContainer.appendChild(btn);
        })(seasons[i]);
      }
    },

    /**
     * Switch the active season in the in-player episodes overlay.
     * @param {number} seasonNum
     * @param {boolean} [keepSeasonFocus]
     */
    selectPlayerSeason: function (seasonNum, keepSeasonFocus) {
      playerSelectedSeason = Number(seasonNum) || 1;

      var tabs = document.querySelectorAll('#player-episodes-seasons .player-season-tab');
      var activeTab = null;
      for (var i = 0; i < tabs.length; i++) {
        var tNum = Number(tabs[i].getAttribute('data-season-num'));
        var isMatch = tNum === playerSelectedSeason;
        tabs[i].classList.toggle('active', isMatch);
        if (isMatch) activeTab = tabs[i];
      }

      this.renderPlayerEpisodes(playerSelectedSeason);

      if (window.FreeIPTV.Navigation) {
        if (keepSeasonFocus && activeTab) {
          window.FreeIPTV.Navigation.focus(activeTab);
        } else {
          var firstEp = document.querySelector('#player-episodes-list .player-episode-item.active') ||
                        document.querySelector('#player-episodes-list .player-episode-item.focusable');
          if (firstEp) {
            window.FreeIPTV.Navigation.focus(firstEp);
          }
        }
      }
    },

    /**
     * Render episodes for the given season inside the in-player episodes overlay.
     * @param {number} seasonNum
     */
    renderPlayerEpisodes: function (seasonNum) {
      var self = this;
      var listEl = document.getElementById('player-episodes-list');
      if (!listEl) return;

      listEl.innerHTML = '';

      var sKey = String(seasonNum || 1);
      var episodes = [];

      if (playerSeriesDetails && playerSeriesDetails.episodesBySeason && Array.isArray(playerSeriesDetails.episodesBySeason[sKey])) {
        episodes = playerSeriesDetails.episodesBySeason[sKey];
      } else if (Number(seasonNum) === Number(this._episodeSeason) && Array.isArray(this._episodeQueue) && this._episodeQueue.length > 0) {
        episodes = this._episodeQueue;
      } else if (currentMedia && currentMedia.rawItem && Number(seasonNum) === Number(currentMedia.seasonNumber)) {
        episodes = [currentMedia.rawItem];
      }

      var nowPlayingLabel = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('player.now_playing') : 'Now Playing';

      for (var i = 0; i < episodes.length; i++) {
        (function (ep, idx) {
          var epNum = ep.episodeNumber !== undefined ? ep.episodeNumber : (ep.episode_num !== undefined ? ep.episode_num : (idx + 1));
          var isCurrent = Boolean(currentMedia && String(currentMedia.id) === String(ep.id));

          var item = document.createElement('div');
          item.className = 'player-episode-item focusable' + (isCurrent ? ' active playing' : '');
          item.setAttribute('tabindex', '0');
          item.setAttribute('data-nav-zone', 'player_episodes_list');
          item.setAttribute('data-episode-id', String(ep.id));
          item.setAttribute('data-season-num', String(seasonNum));
          item.setAttribute('data-episode-num', String(epNum));

          var numBadge = document.createElement('div');
          numBadge.className = 'player-episode-num';
          numBadge.textContent = 'E' + (epNum < 10 ? '0' + epNum : epNum);
          item.appendChild(numBadge);

          var infoCol = document.createElement('div');
          infoCol.className = 'player-episode-info';

          var titleRow = document.createElement('div');
          titleRow.className = 'player-episode-title-row';

          var titleSpan = document.createElement('span');
          titleSpan.className = 'player-episode-title';
          titleSpan.textContent = ep.name || ep.title || ('Episode ' + epNum);
          titleRow.appendChild(titleSpan);

          if (isCurrent) {
            var nowBadge = document.createElement('span');
            nowBadge.className = 'player-episode-now-badge';
            nowBadge.textContent = nowPlayingLabel;
            titleRow.appendChild(nowBadge);
          }

          infoCol.appendChild(titleRow);

          var metaSpan = document.createElement('div');
          metaSpan.className = 'player-episode-meta';
          var sNumPad = Number(seasonNum) < 10 ? '0' + seasonNum : seasonNum;
          var eNumPad = Number(epNum) < 10 ? '0' + epNum : epNum;
          var durSecs = ep.durationSecs || (ep.metadata && ep.metadata.durationSeconds) || 0;
          var metaText = 'S' + sNumPad + 'E' + eNumPad;
          if (durSecs > 0) {
            metaText += ' • ' + Math.max(1, Math.round(durSecs / 60)) + ' min';
          }
          metaSpan.textContent = metaText;
          infoCol.appendChild(metaSpan);

          // Show saved progress bar if partially watched
          var savedProg = (window.FreeIPTV.PlaylistManager && window.FreeIPTV.PlaylistManager.getPlaybackProgress)
            ? window.FreeIPTV.PlaylistManager.getPlaybackProgress(ep.id)
            : null;
          if (savedProg && savedProg.positionSeconds > 5 && savedProg.durationSeconds > 0) {
            var pct = Math.min(100, Math.max(5, Math.round((savedProg.positionSeconds / savedProg.durationSeconds) * 100)));
            var progTrack = document.createElement('div');
            progTrack.className = 'player-episode-progress-track';
            var progFill = document.createElement('div');
            progFill.className = 'player-episode-progress-fill';
            progFill.style.width = pct + '%';
            progTrack.appendChild(progFill);
            infoCol.appendChild(progTrack);
          }

          item.appendChild(infoCol);

          item.addEventListener('click', function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            self.closeEpisodesOverlay(false);
            var startMs = 0;
            if (!isCurrent && savedProg && savedProg.positionSeconds > 5) {
              startMs = savedProg.positionSeconds * 1000;
            }
            self.playEpisode(self._episodeSeries, Number(seasonNum), ep, startMs, episodes);
          });

          listEl.appendChild(item);
        })(episodes[i], i);
      }
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
      if (isEpisodesOverlayOpen) {
        return;
      }
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
