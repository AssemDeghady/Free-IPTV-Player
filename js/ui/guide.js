/**
 * Free IPTV Player — TV Guide (EPG) View Controller
 * Manages electronic program guide display, now/next program scheduling, and instant tuning.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var allChannels = [];
  var selectedChannelIndex = 0;
  var channelEpgMap = {}; // channelId -> EPG object
  var progressTimer = null;

  var Guide = {
    /**
     * Initialize Guide view controller.
     */
    init: function () {
      this.bindEvents();

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('Guide View Controller initialized.');
      }
    },

    /**
     * Bind lifecycle and refresh events.
     */
    bindEvents: function () {
      var self = this;

      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.VIEW_CHANGED, function (data) {
          if (data && data.route === 'guide') {
            self.onEnterView();
          } else {
            self.onLeaveView();
          }
        });

        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYLIST_ACTIVE_CHANGED, function () {
          self.loadGuide();
        });

        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYLIST_UPDATED, function () {
          self.loadGuide();
        });
      }
    },

    /**
     * Called when user enters the Guide view.
     */
    onEnterView: function () {
      this.loadGuide();
      this.startProgressTicker();
    },

    /**
     * Called when user leaves the Guide view.
     */
    onLeaveView: function () {
      if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
    },

    /**
     * Start periodic progress bar update (every 30 seconds).
     */
    startProgressTicker: function () {
      var self = this;
      if (progressTimer) clearInterval(progressTimer);
      progressTimer = setInterval(function () {
        self.updateCurrentProgramProgress();
      }, 30000);
    },

    /**
     * Load channels from the active playlist.
     */
    loadGuide: function () {
      var self = this;
      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      if (!PlaylistManager) return;

      var activePlaylist = PlaylistManager.getActivePlaylist();
      if (!activePlaylist) {
        self.renderEmptyState(window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('guide.no_playlist') : 'No active playlist. Add a playlist to view the TV Guide.');
        return;
      }

      PlaylistManager.loadChannels(activePlaylist.id).then(function (channels) {
        allChannels = channels || [];
        if (allChannels.length === 0) {
          self.renderEmptyState(window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('guide.no_channels') : 'No channels available in this playlist.');
          return;
        }

        self.renderChannelList();
        self.selectChannel(0);
      });
    },

    /**
     * Render the channels column.
     */
    renderChannelList: function () {
      var container = document.getElementById('guide-channels-list');
      if (!container) return;

      container.innerHTML = '';
      var self = this;

      var limit = Math.min(allChannels.length, 100);
      for (var i = 0; i < limit; i++) {
        var channel = allChannels[i];
        var item = this.createChannelItem(channel, i);
        container.appendChild(item);
      }
    },

    /**
     * Create a single channel item DOM element.
     * @param {Object} channel
     * @param {number} index
     * @returns {HTMLElement}
     */
    createChannelItem: function (channel, index) {
      var self = this;
      var item = document.createElement('button');
      item.className = 'guide-channel-item focusable' + (index === selectedChannelIndex ? ' active' : '');
      item.setAttribute('data-nav-zone', 'guide_channels');
      item.setAttribute('data-channel-index', String(index));
      item.setAttribute('data-channel-id', channel.id);

      // Channel Number
      var numSpan = document.createElement('span');
      numSpan.className = 'guide-channel-num';
      numSpan.textContent = channel.tvgChno ? channel.tvgChno : String(index + 1);

      // Logo or icon
      var logoWrap = document.createElement('span');
      logoWrap.className = 'guide-channel-logo';
      if (channel.logoUrl) {
        var img = document.createElement('img');
        img.src = channel.logoUrl;
        img.alt = '';
        img.loading = 'lazy';
        img.onerror = function () {
          this.style.display = 'none';
        };
        logoWrap.appendChild(img);
      } else {
        logoWrap.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg>';
      }

      // Channel Name
      var nameSpan = document.createElement('span');
      nameSpan.className = 'guide-channel-name';
      nameSpan.textContent = channel.name;

      item.appendChild(numSpan);
      item.appendChild(logoWrap);
      item.appendChild(nameSpan);

      item.addEventListener('click', function () {
        self.selectChannel(index);
        self.tuneToChannel(index);
      });

      item.addEventListener('focus', function () {
        self.selectChannel(index);
      });

      return item;
    },

    /**
     * Select a channel and fetch its EPG.
     * @param {number} index
     */
    selectChannel: function (index) {
      if (index < 0 || index >= allChannels.length) return;
      selectedChannelIndex = index;
      var channel = allChannels[index];

      // Update active highlight in DOM
      var items = document.querySelectorAll('.guide-channel-item');
      for (var i = 0; i < items.length; i++) {
        if (items[i].getAttribute('data-channel-index') === String(index)) {
          items[i].classList.add('active');
        } else {
          items[i].classList.remove('active');
        }
      }

      this.renderChannelEpg(channel);
    },

    /**
     * Tune directly to the selected channel.
     * @param {number} index
     */
    tuneToChannel: function (index) {
      if (index < 0 || index >= allChannels.length) return;
      var channel = allChannels[index];
      if (window.FreeIPTV.Player) {
        window.FreeIPTV.Player.playChannel(channel, allChannels);
      }
    },

    /**
     * Render the EPG details and program timeline for a channel.
     * @param {Object} channel
     */
    renderChannelEpg: function (channel) {
      var self = this;
      var container = document.getElementById('guide-program-details');
      if (!container) return;

      var headerEl = document.getElementById('guide-selected-channel-header');
      if (headerEl) {
        headerEl.innerHTML = '';
        var hTitle = document.createElement('h2');
        hTitle.textContent = channel.name;
        var hMeta = document.createElement('div');
        hMeta.className = 'guide-header-meta';
        hMeta.textContent = (channel.groupTitle || '') + (channel.tvgChno ? ' • CH ' + channel.tvgChno : '');
        headerEl.appendChild(hTitle);
        headerEl.appendChild(hMeta);
      }

      // Check if cached
      if (channelEpgMap[channel.id]) {
        self.displayEpgData(channel, channelEpgMap[channel.id]);
        return;
      }

      // Show loading placeholder
      self.renderEpgLoading();

      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      if (PlaylistManager && PlaylistManager.loadChannelEpg) {
        PlaylistManager.loadChannelEpg(channel).then(function (epgData) {
          channelEpgMap[channel.id] = epgData;
          // Ensure still selected
          if (allChannels[selectedChannelIndex] && allChannels[selectedChannelIndex].id === channel.id) {
            self.displayEpgData(channel, epgData);
          }
        }).catch(function () {
          self.displayEpgFallback(channel);
        });
      } else {
        self.displayEpgFallback(channel);
      }
    },

    /**
     * Display actual EPG data.
     * @param {Object} channel
     * @param {Object} epgData
     */
    displayEpgData: function (channel, epgData) {
      var container = document.getElementById('guide-program-details');
      if (!container) return;

      var I18n = window.FreeIPTV.I18n;
      var currentProgram = epgData ? epgData.current : null;
      var upcoming = epgData && epgData.upcoming ? epgData.upcoming : [];

      if (!currentProgram && upcoming.length === 0) {
        this.displayEpgFallback(channel);
        return;
      }

      var html = '';

      // Current Program Card
      html += '<div class="guide-now-card">';
      html += '  <div class="guide-badge-now">' + (I18n ? I18n.t('guide.now_playing') : 'NOW PLAYING') + '</div>';
      var title = currentProgram ? (currentProgram.title || channel.name) : channel.name;
      html += '  <h3 class="guide-program-title">' + this.escapeHtml(title) + '</h3>';

      if (currentProgram && (currentProgram.start || currentProgram.stop)) {
        var startFormatted = this.formatTime(currentProgram.start);
        var stopFormatted = this.formatTime(currentProgram.stop);
        html += '  <div class="guide-program-times">' + startFormatted + ' – ' + stopFormatted + '</div>';

        // Progress bar
        var progressPercent = this.calculateProgress(currentProgram.start, currentProgram.stop);
        html += '  <div class="guide-progress-bar-wrap">';
        html += '    <div class="guide-progress-bar" id="guide-now-progress" style="width: ' + progressPercent + '%;"></div>';
        html += '  </div>';
      }

      var desc = currentProgram && currentProgram.description ? currentProgram.description : (I18n ? I18n.t('guide.no_description') : 'Live TV Broadcast');
      html += '  <p class="guide-program-desc">' + this.escapeHtml(desc) + '</p>';

      // Tune button
      html += '  <div class="guide-actions">';
      html += '    <button class="btn btn-primary focusable" id="guide-btn-watch" data-nav-zone="guide_programs">';
      html += '      <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> ' + (I18n ? I18n.t('guide.watch_live') : 'Watch Live');
      html += '    </button>';
      html += '  </div>';
      html += '</div>';

      // Upcoming Schedule
      if (upcoming.length > 0) {
        html += '<div class="guide-upcoming-section">';
        html += '  <h4 class="guide-upcoming-title">' + (I18n ? I18n.t('guide.up_next') : 'Upcoming Programs') + '</h4>';
        html += '  <div class="guide-upcoming-list">';

        for (var i = 0; i < Math.min(upcoming.length, 6); i++) {
          var prog = upcoming[i];
          html += '    <div class="guide-upcoming-item">';
          html += '      <div class="guide-upcoming-time">' + this.formatTime(prog.start) + '</div>';
          html += '      <div class="guide-upcoming-info">';
          html += '        <div class="guide-upcoming-name">' + this.escapeHtml(prog.title || 'Untitled Program') + '</div>';
          if (prog.description) {
            html += '        <div class="guide-upcoming-desc">' + this.escapeHtml(prog.description) + '</div>';
          }
          html += '      </div>';
          html += '    </div>';
        }

        html += '  </div>';
        html += '</div>';
      }

      container.innerHTML = html;

      // Bind Watch button
      var watchBtn = document.getElementById('guide-btn-watch');
      var self = this;
      if (watchBtn) {
        watchBtn.addEventListener('click', function () {
          self.tuneToChannel(selectedChannelIndex);
        });
      }
    },

    /**
     * Display fallback when no EPG is available.
     * @param {Object} channel
     */
    displayEpgFallback: function (channel) {
      var container = document.getElementById('guide-program-details');
      if (!container) return;

      var I18n = window.FreeIPTV.I18n;
      var html = '';
      html += '<div class="guide-now-card">';
      html += '  <div class="guide-badge-now">' + (I18n ? I18n.t('guide.live_channel') : 'LIVE CHANNEL') + '</div>';
      html += '  <h3 class="guide-program-title">' + this.escapeHtml(channel.name) + '</h3>';
      html += '  <p class="guide-program-desc">' + (I18n ? I18n.t('guide.no_epg') : 'No electronic program guide information available for this channel.') + '</p>';
      html += '  <div class="guide-actions">';
      html += '    <button class="btn btn-primary focusable" id="guide-btn-watch" data-nav-zone="guide_programs">';
      html += '      <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> ' + (I18n ? I18n.t('guide.watch_live') : 'Watch Live');
      html += '    </button>';
      html += '  </div>';
      html += '</div>';

      container.innerHTML = html;

      var watchBtn = document.getElementById('guide-btn-watch');
      var self = this;
      if (watchBtn) {
        watchBtn.addEventListener('click', function () {
          self.tuneToChannel(selectedChannelIndex);
        });
      }
    },

    /**
     * Show loading placeholder.
     */
    renderEpgLoading: function () {
      var container = document.getElementById('guide-program-details');
      if (!container) return;
      container.innerHTML = '<div class="guide-loading-spinner">' +
        (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('guide.loading_epg') : 'Loading program guide...') +
        '</div>';
    },

    /**
     * Calculate percentage progress between start and stop.
     * @param {string|number} start
     * @param {string|number} stop
     * @returns {number}
     */
    calculateProgress: function (start, stop) {
      var s = typeof start === 'number' ? start : (new Date(start).getTime() / 1000);
      var e = typeof stop === 'number' ? stop : (new Date(stop).getTime() / 1000);
      var now = Date.now() / 1000;

      if (!s || !e || e <= s) return 0;
      if (now < s) return 0;
      if (now > e) return 100;
      return Math.round(((now - s) / (e - s)) * 100);
    },

    /**
     * Update current program progress bar smoothly.
     */
    updateCurrentProgramProgress: function () {
      var channel = allChannels[selectedChannelIndex];
      if (!channel) return;
      var epg = channelEpgMap[channel.id];
      if (!epg || !epg.current || !epg.current.start || !epg.current.stop) return;

      var bar = document.getElementById('guide-now-progress');
      if (bar) {
        bar.style.width = this.calculateProgress(epg.current.start, epg.current.stop) + '%';
      }
    },

    /**
     * Format timestamp to HH:mm string.
     * @param {string|number} timeVal
     * @returns {string}
     */
    formatTime: function (timeVal) {
      if (!timeVal) return '--:--';
      var d;
      if (typeof timeVal === 'number') {
        d = new Date(timeVal * 1000);
      } else {
        d = new Date(timeVal);
      }
      if (isNaN(d.getTime())) return String(timeVal);

      var hours = d.getHours();
      var minutes = d.getMinutes();
      return (hours < 10 ? '0' : '') + hours + ':' + (minutes < 10 ? '0' : '') + minutes;
    },

    /**
     * Render empty state.
     * @param {string} msg
     */
    renderEmptyState: function (msg) {
      var container = document.getElementById('guide-channels-list');
      if (container) {
        container.innerHTML = '<div class="channels-empty-notice">' + this.escapeHtml(msg) + '</div>';
      }
      var details = document.getElementById('guide-program-details');
      if (details) {
        details.innerHTML = '';
      }
    },

    escapeHtml: function (str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  };

  window.FreeIPTV.Guide = Guide;
})(window);
