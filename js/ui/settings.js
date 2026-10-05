/**
 * Free IPTV Player — Settings & Multi-Provider Controller
 * Handles playlist/provider inspection, manual refresh, deletion, active selection,
 * language switching, EPG cache controls, playback preferences, and About information.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var Settings = {
    /**
     * Initialize Settings view.
     */
    init: function () {
      this.bindEvents();
      this.bindPreferenceControls();

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('Settings View initialized.');
      }
    },

    /**
     * Bind view change and action events.
     */
    bindEvents: function () {
      var self = this;
      var lastRouteTransitionTime = 0;

      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.VIEW_CHANGED, function (data) {
          if (data && data.route === 'settings') {
            lastRouteTransitionTime = Date.now();
            self.renderSettings();
          }
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYLIST_ADDED, function () {
          self.renderPlaylists();
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYLIST_REMOVED, function () {
          self.renderPlaylists();
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYLIST_UPDATED, function () {
          self.renderPlaylists();
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYLIST_ACTIVE_CHANGED, function () {
          self.renderPlaylists();
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.LANGUAGE_CHANGED, function () {
          self.renderSettings();
        });
      }

      var btnAddFromSettings = document.getElementById('settings-btn-add-playlist');
      if (btnAddFromSettings) {
        btnAddFromSettings.addEventListener('click', function (e) {
          // Prevent accidental activation from double-click or Enter key bleed during route switch
          if (Date.now() - lastRouteTransitionTime < 300) {
            if (e) {
              e.preventDefault();
              e.stopPropagation();
            }
            return;
          }
          if (window.FreeIPTV.Modal) {
            window.FreeIPTV.Modal.showAddPlaylist();
          }
        });
      }

      // Language switcher buttons
      var btnLangEn = document.getElementById('btn-lang-en');
      if (btnLangEn) {
        btnLangEn.addEventListener('click', function () {
          if (window.FreeIPTV.I18n) {
            window.FreeIPTV.I18n.setLanguage('en');
            self.updateLanguageButtons();
          }
        });
      }

      var btnLangAr = document.getElementById('btn-lang-ar');
      if (btnLangAr) {
        btnLangAr.addEventListener('click', function () {
          if (window.FreeIPTV.I18n) {
            window.FreeIPTV.I18n.setLanguage('ar');
            self.updateLanguageButtons();
          }
        });
      }

      // EPG Cache Clear button
      var btnClearEpg = document.getElementById('btn-clear-epg-cache');
      if (btnClearEpg) {
        btnClearEpg.addEventListener('click', function () {
          self.clearEpgCache();
        });
      }

      // Clear History button
      var btnClearHistory = document.getElementById('btn-clear-history');
      if (btnClearHistory) {
        btnClearHistory.addEventListener('click', function () {
          self.clearHistory();
        });
      }

      // Refresh Diagnostics & Content button
      var btnRefreshDiag = document.getElementById('btn-refresh-diagnostics');
      if (btnRefreshDiag) {
        btnRefreshDiag.addEventListener('click', function () {
          var PlaylistManager = window.FreeIPTV.PlaylistManager;
          var activeId = PlaylistManager ? PlaylistManager.getActivePlaylistId() : null;
          if (activeId) {
            btnRefreshDiag.disabled = true;
            btnRefreshDiag.textContent = 'Refreshing...';
            PlaylistManager.refreshPlaylist(activeId).then(function () {
              self.renderSettings();
              btnRefreshDiag.disabled = false;
              btnRefreshDiag.textContent = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('settings.diag_refresh') : 'Refresh Content';
            }).catch(function () {
              self.renderSettings();
              btnRefreshDiag.disabled = false;
              btnRefreshDiag.textContent = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('settings.diag_refresh') : 'Refresh Content';
            });
          }
        });
      }
    },

    /**
     * Bind playback preferences toggles (saved to localStorage).
     */
    bindPreferenceControls: function () {
      var autoResumeToggle = document.getElementById('toggle-auto-resume');
      if (autoResumeToggle) {
        var savedResume = localStorage.getItem('freeiptv_pref_autoresume') !== 'false';
        autoResumeToggle.checked = savedResume;
        autoResumeToggle.addEventListener('change', function () {
          localStorage.setItem('freeiptv_pref_autoresume', String(autoResumeToggle.checked));
        });
      }

      var autoNextEpisodeToggle = document.getElementById('toggle-auto-next-ep');
      if (autoNextEpisodeToggle) {
        var savedAutoNext = localStorage.getItem('freeiptv_pref_autonext') !== 'false';
        autoNextEpisodeToggle.checked = savedAutoNext;
        autoNextEpisodeToggle.addEventListener('change', function () {
          localStorage.setItem('freeiptv_pref_autonext', String(autoNextEpisodeToggle.checked));
        });
      }
    },

    /**
     * Full render of Settings view.
     */
    renderSettings: function () {
      this.updateLanguageButtons();
      this.renderPlaylists();
      this.renderDiagnostics();
      this.renderAboutStats();
    },

    /**
     * Clear All Caches (EPG, Series details, VOD details, catalogs) and notify user.
     */
    clearEpgCache: function () {
      var ChannelStore = window.FreeIPTV.ChannelStore;
      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      var I18n = window.FreeIPTV.I18n;
      var statusEl = document.getElementById('epg-cache-status');

      var clearPromise = (ChannelStore && ChannelStore.clearAll)
        ? ChannelStore.clearAll()
        : ((ChannelStore && ChannelStore.clearEpgCache) ? ChannelStore.clearEpgCache() : Promise.resolve(true));

      clearPromise.then(function () {
        // Invalidate any in-memory/session caches if available
        if (PlaylistManager && PlaylistManager.clearMemoryCache) {
          PlaylistManager.clearMemoryCache();
        }
        if (statusEl) {
          statusEl.textContent = I18n ? I18n.t('settings.epg_cache_cleared') : 'Cache cleared successfully.';
          setTimeout(function () { statusEl.textContent = ''; }, 3000);
        }
      });
    },

    /**
     * Clear watch history and continue watching data.
     */
    clearHistory: function () {
      var I18n = window.FreeIPTV.I18n;
      var statusEl = document.getElementById('history-status');

      try {
        localStorage.removeItem('freeiptv_watch_history');
        localStorage.removeItem('freeiptv_playback_progress');
        if (window.FreeIPTV.PlaylistManager && window.FreeIPTV.PlaylistManager.clearWatchHistory) {
          window.FreeIPTV.PlaylistManager.clearWatchHistory();
        }
        if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
          window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.HISTORY_UPDATED);
        }
        if (statusEl) {
          statusEl.textContent = I18n ? I18n.t('settings.history_cleared') : 'Playback history cleared.';
          setTimeout(function () { statusEl.textContent = ''; }, 3000);
        }
      } catch (e) {
        // Safe fallback
      }
    },

    /**
     * Update active state of language toggle buttons.
     */
    updateLanguageButtons: function () {
      var current = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.getLanguage() : 'en';
      var btnEn = document.getElementById('btn-lang-en');
      var btnAr = document.getElementById('btn-lang-ar');

      if (btnEn) {
        btnEn.classList.toggle('active', current === 'en');
      }
      if (btnAr) {
        btnAr.classList.toggle('active', current === 'ar');
      }
    },

    /**
     * Render the list of configured playlists/providers.
     */
    renderPlaylists: function () {
      var container = document.getElementById('settings-playlists-container');
      if (!container) return;

      container.innerHTML = '';
      this.updateLanguageButtons();

      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      if (!PlaylistManager) return;

      var playlists = PlaylistManager.getPlaylists();
      var activeId = PlaylistManager.getActivePlaylistId();

      if (playlists.length === 0) {
        var emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-settings-notice';
        emptyMsg.textContent = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('settings.no_playlists') : 'No playlists configured yet.';
        container.appendChild(emptyMsg);
        return;
      }

      var self = this;

      for (var i = 0; i < playlists.length; i++) {
        var p = playlists[i];
        var itemCard = document.createElement('div');
        itemCard.className = 'playlist-card' + (p.id === activeId ? ' is-active' : '');

        var infoGroup = document.createElement('div');
        infoGroup.className = 'playlist-card-info';

        var titleRow = document.createElement('div');
        titleRow.className = 'playlist-card-title-row';

        var nameSpan = document.createElement('h3');
        nameSpan.className = 'playlist-card-name';
        nameSpan.textContent = p.name;
        titleRow.appendChild(nameSpan);

        // Provider Type badge (Xtream / M3U)
        var typeBadge = document.createElement('span');
        typeBadge.className = 'provider-type-badge';
        typeBadge.textContent = p.type === 'xtream' ? 'Xtream Codes' : 'M3U';
        titleRow.appendChild(typeBadge);

        if (p.id === activeId) {
          var badge = document.createElement('span');
          badge.className = 'active-tag';
          badge.textContent = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('settings.active_badge') : 'Active';
          titleRow.appendChild(badge);
        }

        var detailsRow = document.createElement('div');
        detailsRow.className = 'playlist-card-details';
        var updatedDate = new Date(p.updatedAt).toLocaleDateString();

        var PlaylistManager = window.FreeIPTV.PlaylistManager;
        var formatCount = (PlaylistManager && PlaylistManager.formatChannelCount) ? PlaylistManager.formatChannelCount : function (n) { return n; };
        var liveCount = p.liveCount !== undefined ? p.liveCount : (p.channelCount !== undefined ? p.channelCount : 0);
        var statsStr = formatCount(liveCount) + ' ' + (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('home.stat_channels') : 'Live');
        if (p.movieCount) statsStr += ' • ' + formatCount(p.movieCount) + ' Movies';
        if (p.seriesCount) statsStr += ' • ' + formatCount(p.seriesCount) + ' Series';
        statsStr += ' • ' + (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('settings.last_updated').replace('{time}', updatedDate) : 'Updated: ' + updatedDate);

        detailsRow.textContent = statsStr;
        detailsRow.id = 'settings-playlist-details-' + p.id;

        infoGroup.appendChild(titleRow);
        infoGroup.appendChild(detailsRow);

        (function (playlistItem, uDate) {
          if (PlaylistManager && PlaylistManager.getChannelCount) {
            PlaylistManager.getChannelCount(playlistItem.id).then(function (verifiedCount) {
              var rowEl = document.getElementById('settings-playlist-details-' + playlistItem.id);
              if (rowEl) {
                var s = formatCount(verifiedCount) + ' ' + (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('home.stat_channels') : 'Live');
                if (playlistItem.movieCount) s += ' • ' + formatCount(playlistItem.movieCount) + ' Movies';
                if (playlistItem.seriesCount) s += ' • ' + formatCount(playlistItem.seriesCount) + ' Series';
                s += ' • ' + (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('settings.last_updated').replace('{time}', uDate) : 'Updated: ' + uDate);
                rowEl.textContent = s;
              }
            }).catch(function () {});
          }
        })(p, updatedDate);

        // Action Buttons Row
        var actionsGroup = document.createElement('div');
        actionsGroup.className = 'playlist-card-actions';

        // Set Active button (if not already active)
        if (p.id !== activeId) {
          var btnSetActive = document.createElement('button');
          btnSetActive.className = 'btn-settings-action focusable';
          btnSetActive.setAttribute('data-nav-zone', 'settings_actions');
          btnSetActive.textContent = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('settings.btn_set_active') : 'Set Active';
          (function (pId) {
            btnSetActive.addEventListener('click', function () {
              PlaylistManager.setActivePlaylist(pId);
            });
          })(p.id);
          actionsGroup.appendChild(btnSetActive);
        }

        // Refresh button
        var btnRefresh = document.createElement('button');
        btnRefresh.className = 'btn-settings-action focusable';
        btnRefresh.setAttribute('data-nav-zone', 'settings_actions');
        btnRefresh.textContent = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('settings.btn_refresh') : 'Refresh';
        (function (pId, refreshBtn) {
          refreshBtn.addEventListener('click', function () {
            refreshBtn.textContent = '...';
            PlaylistManager.refreshPlaylist(pId)
              .then(function () {
                self.renderPlaylists();
              })
              .catch(function (err) {
                if (window.FreeIPTV.Logger) {
                  window.FreeIPTV.Logger.error('Refresh failed:', err);
                }
                self.renderPlaylists();
              });
          });
        })(p.id, btnRefresh);
        actionsGroup.appendChild(btnRefresh);

        // Delete button
        var btnDelete = document.createElement('button');
        btnDelete.className = 'btn-settings-action btn-danger focusable';
        btnDelete.setAttribute('data-nav-zone', 'settings_actions');
        btnDelete.textContent = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('settings.btn_delete') : 'Delete';
        (function (pId) {
          btnDelete.addEventListener('click', function () {
            PlaylistManager.removePlaylist(pId);
          });
        })(p.id);
        actionsGroup.appendChild(btnDelete);

        itemCard.appendChild(infoGroup);
        itemCard.appendChild(actionsGroup);
        container.appendChild(itemCard);
      }
    },

    /**
     * Render Provider & Content Diagnostics (zero credential leak).
     */
    renderDiagnostics: function () {
      var container = document.getElementById('diagnostics-metrics-grid');
      if (!container) return;

      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      var I18n = window.FreeIPTV.I18n;
      var diag = PlaylistManager ? PlaylistManager.getDiagnostics() : {
        hasActivePlaylist: false,
        playlistName: 'None',
        serverHost: 'None',
        liveCount: 0,
        movieCount: 0,
        seriesCount: 0,
        status: 'No Provider',
        lastRefreshAt: 'Never',
        epgStatus: 'Idle'
      };

      var statusClass = diag.status === 'Connected' ? 'diag-status-ok' : (diag.status === 'Offline' ? 'diag-status-err' : 'diag-status-warn');

      container.innerHTML =
        '<div class="diag-card">' +
          '<div class="diag-card-title">' + (I18n ? I18n.t('settings.diag_provider') : 'Provider Status') + '</div>' +
          '<div class="diag-card-value ' + statusClass + '">' + diag.status + '</div>' +
          '<div class="diag-card-sub">' + (diag.playlistName || 'No active provider') + '</div>' +
        '</div>' +
        '<div class="diag-card">' +
          '<div class="diag-card-title">' + (I18n ? I18n.t('settings.diag_live') : 'Live Channels') + '</div>' +
          '<div class="diag-card-value" id="diag-live-channels-val">' + (PlaylistManager && PlaylistManager.formatChannelCount ? PlaylistManager.formatChannelCount(diag.liveCount) : diag.liveCount) + '</div>' +
          '<div class="diag-card-sub">Type: ' + (diag.playlistType || '').toUpperCase() + '</div>' +
        '</div>' +
        '<div class="diag-card">' +
          '<div class="diag-card-title">' + (I18n ? I18n.t('settings.diag_movies') : 'Movies (VOD)') + '</div>' +
          '<div class="diag-card-value">' + diag.movieCount + '</div>' +
          '<div class="diag-card-sub">Loaded &amp; cached</div>' +
        '</div>' +
        '<div class="diag-card">' +
          '<div class="diag-card-title">' + (I18n ? I18n.t('settings.diag_series') : 'TV Series') + '</div>' +
          '<div class="diag-card-value">' + diag.seriesCount + '</div>' +
          '<div class="diag-card-sub">Loaded &amp; cached</div>' +
        '</div>' +
        '<div class="diag-card">' +
          '<div class="diag-card-title">' + (I18n ? I18n.t('settings.diag_epg') : 'EPG Status') + '</div>' +
          '<div class="diag-card-value" style="font-size: 16px;">' + diag.epgStatus + '</div>' +
          '<div class="diag-card-sub">' + (diag.lastEpgChannel && diag.lastEpgChannel !== 'None' ? 'Channel: ' + diag.lastEpgChannel : 'No channel queried') + '</div>' +
        '</div>' +
        '<div class="diag-card">' +
          '<div class="diag-card-title">' + (I18n ? I18n.t('settings.diag_server') : 'Host Server') + '</div>' +
          '<div class="diag-card-value" style="font-size: 15px; word-break: break-all;">' + diag.serverHost + '</div>' +
          '<div class="diag-card-sub">Refreshed: ' + diag.lastRefreshAt + '</div>' +
        '</div>';

      if (PlaylistManager && PlaylistManager.getChannelCount && diag.hasActivePlaylist) {
        PlaylistManager.getChannelCount().then(function (verifiedCount) {
          var valEl = document.getElementById('diag-live-channels-val');
          if (valEl && PlaylistManager.formatChannelCount) {
            valEl.textContent = PlaylistManager.formatChannelCount(verifiedCount);
          }
        }).catch(function () {});
      }
    },

    /**
     * Render About & System Statistics.
     */
    renderAboutStats: function () {
      var statFavs = document.getElementById('settings-stat-favorites');
      var statHist = document.getElementById('settings-stat-history');

      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      if (!PlaylistManager) return;

      var favs = PlaylistManager.getFavorites('all') || [];
      var hist = PlaylistManager.getWatchHistory() || [];

      if (statFavs) statFavs.textContent = String(favs.length);
      if (statHist) statHist.textContent = String(hist.length);
    }
  };

  window.FreeIPTV.Settings = Settings;
})(window);
