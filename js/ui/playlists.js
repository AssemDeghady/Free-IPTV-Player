/**
 * Free IPTV Player — Playlists & Providers View Controller (Phase 5.3)
 * Central UI destination for multi-playlist management, switching active provider,
 * reconnecting, renaming, deleting, and adding playlists.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  function formatChannelCount(num) {
    if (num === null || num === undefined) return '';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function getChannelsText(count, isLoading) {
    var I18n = window.FreeIPTV.I18n;
    if (isLoading) {
      return I18n ? I18n.t('playlists.channels_loading') : 'Channels: Loading...';
    }
    var formatted = formatChannelCount(count !== undefined ? count : 0);
    if (I18n) {
      return I18n.t('playlists.channels_count', { count: formatted });
    }
    return 'Channels: ' + formatted;
  }

  var PlaylistsView = {
    formatChannelCount: formatChannelCount,
    getChannelsText: getChannelsText,

    /**
     * Initialize Playlists UI controller.
     */
    init: function () {
      this.bindEvents();
      this.updateHeaderIndicator();

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('Playlists View Controller initialized.');
      }
    },

    /**
     * Bind UI and application lifecycle events.
     */
    bindEvents: function () {
      var self = this;

      // Add Playlist button in header bar
      var btnAdd = document.getElementById('btn-playlists-add');
      if (btnAdd) {
        btnAdd.addEventListener('click', function () {
          if (window.FreeIPTV.Modal) {
            window.FreeIPTV.Modal.showAddPlaylist();
          }
        });
      }

      // Quick indicator in app header -> route to Playlists
      var headerIndicator = document.getElementById('header-active-playlist');
      if (headerIndicator) {
        headerIndicator.addEventListener('click', function () {
          var playlistsNav = document.querySelector('[data-route="playlists"]');
          if (playlistsNav) {
            playlistsNav.click();
          } else {
            var homeView = window.FreeIPTV.Home;
            if (homeView) homeView.switchView('playlists');
          }
        });
      }

      // App Event Bus Listeners
      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.VIEW_CHANGED, function (data) {
          if (data && data.route === 'playlists') {
            self.onEnterView();
          }
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYLIST_ADDED, function () {
          self.render();
          self.updateHeaderIndicator();
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYLIST_UPDATED, function () {
          self.render();
          self.updateHeaderIndicator();
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYLIST_REMOVED, function () {
          self.render();
          self.updateHeaderIndicator();
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYLIST_ACTIVE_CHANGED, function () {
          self.render();
          self.updateHeaderIndicator();
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.LANGUAGE_CHANGED, function () {
          self.render();
          self.updateHeaderIndicator();
        });
      }
    },

    /**
     * Called when the user navigates to the Playlists view.
     */
    onEnterView: function () {
      this.render();
      // Set initial focus to the first focusable element in view-playlists
      setTimeout(function () {
        var firstEl = document.querySelector('#view-playlists .focusable');
        if (firstEl && window.FreeIPTV.Navigation) {
          window.FreeIPTV.Navigation.focus(firstEl);
        }
      }, 50);
    },

    /**
     * Update global header active playlist text.
     */
    updateHeaderIndicator: function () {
      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      if (!PlaylistManager) return;
      var active = PlaylistManager.getActivePlaylist();
      var label = document.getElementById('header-playlist-name');
      if (label) {
        label.textContent = active ? active.name : (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('playlists.no_active') : 'No Playlist');
      }

      var pill = document.getElementById('playlists-active-pill');
      if (pill) {
        pill.textContent = active ? active.name : '';
        pill.style.display = active ? 'inline-block' : 'none';
      }
    },

    /**
     * Render the active playlist card and all saved playlists list.
     */
    render: function () {
      this.updateHeaderIndicator();
      this.renderActivePlaylistSection();
      this.renderSavedPlaylistsList();
    },

    /**
     * Render the highlighted active playlist section.
     */
    renderActivePlaylistSection: function () {
      var container = document.getElementById('playlists-active-container');
      if (!container) return;
      container.innerHTML = '';

      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      var I18n = window.FreeIPTV.I18n;
      var active = PlaylistManager ? PlaylistManager.getActivePlaylist() : null;

      if (!active) {
        var emptyNotice = document.createElement('div');
        emptyNotice.className = 'playlist-empty-card';
        emptyNotice.innerHTML = 
          '<div class="empty-icon"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div>' +
          '<div class="empty-text">' +
            '<h4>' + (I18n ? I18n.t('playlists.no_playlists') : 'No active playlist configured') + '</h4>' +
            '<p>' + (I18n ? I18n.t('playlists.no_playlists_sub') : 'Add an M3U or Xtream Codes playlist to begin.') + '</p>' +
          '</div>';
        container.appendChild(emptyNotice);
        return;
      }

      var card = document.createElement('div');
      card.className = 'playlist-card active-card';
      card.setAttribute('data-playlist-id', active.id);

      var typeLabel = active.type === 'xtream' ? 'Xtream Codes API' : 'M3U / M3U8 Playlist';
      var liveCount = active.liveCount !== undefined ? active.liveCount : (active.channelCount !== undefined ? active.channelCount : null);
      var hasVerifiedCount = typeof liveCount === 'number' && liveCount > 0;
      var initialVal = hasVerifiedCount ? formatChannelCount(liveCount) : (I18n ? I18n.t('live.loading') : 'Loading...');
      var movieCount = active.movieCount || 0;
      var seriesCount = active.seriesCount || 0;

      card.innerHTML =
        '<div class="playlist-card-header">' +
          '<div class="playlist-meta-group">' +
            '<div class="playlist-type-badge ' + active.type + '">' + active.type.toUpperCase() + '</div>' +
            '<h3 class="playlist-card-title">' + this.escapeHtml(active.name) + '</h3>' +
            '<div class="playlist-card-sub">' + typeLabel + ' &bull; <span class="status-connected">' + (active.status || 'Connected') + '</span></div>' +
          '</div>' +
          '<div class="playlist-active-badge">' +
            '<span class="active-dot-live">●</span> ' + (I18n ? I18n.t('playlists.active_badge') : 'ACTIVE') +
          '</div>' +
        '</div>' +
        '<div class="playlist-stats-row">' +
          '<div class="stat-item"><span class="stat-val" id="active-card-channels-val">' + initialVal + '</span> <span class="stat-lbl">' + (I18n ? I18n.t('home.stat_channels') : 'Live TV') + '</span></div>' +
          (active.type === 'xtream' ? '<div class="stat-item"><span class="stat-val">' + movieCount + '</span> <span class="stat-lbl">' + (I18n ? I18n.t('home.stat_movies') : 'Movies') + '</span></div>' : '') +
          (active.type === 'xtream' ? '<div class="stat-item"><span class="stat-val">' + seriesCount + '</span> <span class="stat-lbl">' + (I18n ? I18n.t('home.stat_series') : 'Series') + '</span></div>' : '') +
        '</div>' +
        '<div class="playlist-actions-row">' +
          '<button id="btn-active-refresh" class="btn-playlist-action focusable" data-nav-zone="playlists_actions">' +
            '&#8635; ' + (I18n ? I18n.t('playlists.btn_refresh') : 'Reconnect / Refresh') +
          '</button>' +
          '<button id="btn-active-rename" class="btn-playlist-action focusable" data-nav-zone="playlists_actions">' +
            '&#9998; ' + (I18n ? I18n.t('playlists.btn_rename') : 'Rename') +
          '</button>' +
          '<button id="btn-active-delete" class="btn-playlist-action btn-danger focusable" data-nav-zone="playlists_actions">' +
            '&#128465; ' + (I18n ? I18n.t('playlists.btn_delete') : 'Delete') +
          '</button>' +
        '</div>';

      container.appendChild(card);

      // Asynchronously resolve authoritative Live TV channel count
      if (PlaylistManager && PlaylistManager.getChannelCount) {
        PlaylistManager.getChannelCount(active.id).then(function (verifiedCount) {
          var valEl = document.getElementById('active-card-channels-val');
          if (valEl) {
            valEl.textContent = formatChannelCount(verifiedCount);
          }
        }).catch(function () {
          var valEl = document.getElementById('active-card-channels-val');
          if (valEl && !hasVerifiedCount) {
            valEl.textContent = formatChannelCount(active.liveCount || active.channelCount || 0);
          }
        });
      }

      // Bind active card actions
      var self = this;
      var btnRefresh = card.querySelector('#btn-active-refresh');
      if (btnRefresh) {
        btnRefresh.addEventListener('click', function () {
          self.handleRefresh(active.id, btnRefresh);
        });
      }

      var btnRename = card.querySelector('#btn-active-rename');
      if (btnRename) {
        btnRename.addEventListener('click', function () {
          self.handleRename(active.id, active.name);
        });
      }

      var btnDelete = card.querySelector('#btn-active-delete');
      if (btnDelete) {
        btnDelete.addEventListener('click', function () {
          self.handleDelete(active.id, active.name);
        });
      }
    },

    /**
     * Render the grid/list of all saved playlists.
     */
    renderSavedPlaylistsList: function () {
      var container = document.getElementById('playlists-list-container');
      if (!container) return;
      container.innerHTML = '';

      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      var I18n = window.FreeIPTV.I18n;
      var playlists = PlaylistManager ? PlaylistManager.getPlaylists() : [];
      var activeId = PlaylistManager ? PlaylistManager.getActivePlaylistId() : null;

      if (playlists.length === 0) {
        var emptyEl = document.createElement('div');
        emptyEl.className = 'playlists-empty-text';
        emptyEl.textContent = I18n ? I18n.t('playlists.no_playlists') : 'No playlists saved yet.';
        container.appendChild(emptyEl);
        return;
      }

      var self = this;

      for (var i = 0; i < playlists.length; i++) {
        var p = playlists[i];
        var isCurrentActive = p.id === activeId;

        var card = document.createElement('div');
        card.className = 'playlist-item-card focusable' + (isCurrentActive ? ' is-active' : '');
        card.setAttribute('data-nav-zone', 'playlists_grid');
        card.setAttribute('data-playlist-id', p.id);

        var typeTag = p.type === 'xtream' ? 'XTREAM' : 'M3U';
        var chCount = p.liveCount !== undefined ? p.liveCount : (p.channelCount !== undefined ? p.channelCount : null);
        var hasCount = typeof chCount === 'number' && chCount > 0;
        var initialMetaText = hasCount ? getChannelsText(chCount, false) : getChannelsText(0, true);

        card.innerHTML =
          '<div class="item-header">' +
            '<span class="item-type-badge ' + p.type + '">' + typeTag + '</span>' +
            (isCurrentActive ? '<span class="item-active-tag">✓ ' + (I18n ? I18n.t('playlists.active_badge') : 'ACTIVE') + '</span>' : '') +
          '</div>' +
          '<h4 class="item-name">' + this.escapeHtml(p.name) + '</h4>' +
          '<div class="item-meta" id="playlist-meta-' + p.id + '">' + initialMetaText + '</div>' +
          '<div class="item-buttons-row">' +
            (!isCurrentActive ? 
              '<button class="btn-card-activate focusable" data-nav-zone="playlists_grid" data-action="activate" data-id="' + p.id + '">' +
                (I18n ? I18n.t('playlists.btn_activate') : 'Activate') +
              '</button>' : '') +
            '<button class="btn-card-action focusable" data-nav-zone="playlists_grid" data-action="refresh" data-id="' + p.id + '" title="Refresh">&#8635;</button>' +
            '<button class="btn-card-action focusable" data-nav-zone="playlists_grid" data-action="rename" data-id="' + p.id + '" title="Rename">&#9998;</button>' +
            '<button class="btn-card-action btn-danger focusable" data-nav-zone="playlists_grid" data-action="delete" data-id="' + p.id + '" title="Delete">&#128465;</button>' +
          '</div>';

        // Card click -> if not active, clicking anywhere activates it
        (function (playlistItem, cardEl) {
          cardEl.addEventListener('click', function (e) {
            var actionBtn = e.target.closest('[data-action]');
            if (actionBtn) {
              var action = actionBtn.getAttribute('data-action');
              var id = actionBtn.getAttribute('data-id');
              if (action === 'activate') {
                self.handleActivate(id);
              } else if (action === 'refresh') {
                self.handleRefresh(id, actionBtn);
              } else if (action === 'rename') {
                self.handleRename(id, playlistItem.name);
              } else if (action === 'delete') {
                self.handleDelete(id, playlistItem.name);
              }
            } else if (playlistItem.id !== activeId) {
              self.handleActivate(playlistItem.id);
            }
          });
        })(p, card);

        container.appendChild(card);

        // Asynchronously resolve authoritative count for this specific playlist
        (function (playlistItem) {
          if (PlaylistManager && PlaylistManager.getChannelCount) {
            PlaylistManager.getChannelCount(playlistItem.id).then(function (count) {
              var metaEl = document.getElementById('playlist-meta-' + playlistItem.id);
              if (metaEl) {
                metaEl.textContent = getChannelsText(count, false);
              }
            }).catch(function () {
              var metaEl = document.getElementById('playlist-meta-' + playlistItem.id);
              if (metaEl && !hasCount) {
                metaEl.textContent = getChannelsText(playlistItem.liveCount || playlistItem.channelCount || 0, false);
              }
            });
          }
        })(p);
      }
    },

    /**
     * Activate a selected playlist and refresh all content.
     * @param {string} id
     */
    handleActivate: function (id) {
      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      if (!PlaylistManager) return;

      PlaylistManager.switchActivePlaylist(id);

      if (window.FreeIPTV.LiveTV) {
        window.FreeIPTV.LiveTV.loadActivePlaylist();
      }
      if (window.FreeIPTV.Home) {
        window.FreeIPTV.Home.render();
      }

      this.render();
    },

    /**
     * Reconnect/Refresh channels and content for a playlist.
     * @param {string} id
     * @param {HTMLElement} btnEl
     */
    handleRefresh: function (id, btnEl) {
      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      if (!PlaylistManager) return;

      var self = this;
      var originalText = btnEl ? btnEl.innerHTML : '';
      if (btnEl) {
        btnEl.innerHTML = '&#8635; ' + (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('live.loading') : 'Refreshing...');
        btnEl.disabled = true;
      }

      PlaylistManager.refreshPlaylist(id)
        .then(function () {
          self.render();
        })
        .catch(function (err) {
          if (btnEl) {
            btnEl.innerHTML = originalText;
            btnEl.disabled = false;
          }
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.error('Playlist refresh error:', err);
          }
        });
    },

    /**
     * Rename a playlist.
     * @param {string} id
     * @param {string} currentName
     */
    handleRename: function (id, currentName) {
      var I18n = window.FreeIPTV.I18n;
      var promptMsg = I18n ? I18n.t('playlists.rename_prompt') : 'Enter new playlist name:';
      var newName = window.prompt(promptMsg, currentName);
      if (newName && newName.trim() && newName.trim() !== currentName) {
        var PlaylistManager = window.FreeIPTV.PlaylistManager;
        if (PlaylistManager) {
          PlaylistManager.renamePlaylist(id, newName.trim());
          this.render();
        }
      }
    },

    /**
     * Delete a playlist.
     * @param {string} id
     * @param {string} name
     */
    handleDelete: function (id, name) {
      var I18n = window.FreeIPTV.I18n;
      var confirmMsg = (I18n ? I18n.t('playlists.confirm_delete') : 'Are you sure you want to delete this playlist?') + '\n"' + name + '"';
      if (window.confirm(confirmMsg)) {
        var PlaylistManager = window.FreeIPTV.PlaylistManager;
        if (PlaylistManager) {
          PlaylistManager.deletePlaylist(id);
          this.render();
        }
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

  window.FreeIPTV.Playlists = PlaylistsView;
})(window);
