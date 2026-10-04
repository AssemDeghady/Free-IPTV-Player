/**
 * Free IPTV Player — Playlist & Content Manager
 * Orchestrates playlist/provider CRUD, active provider tracking, content caching,
 * unified favorites, playback history, continue watching, and global search.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var STORAGE_PLAYLISTS_KEY = 'playlists';
  var STORAGE_ACTIVE_KEY = 'active_playlist_id';
  var STORAGE_FAVORITES_KEY = 'favorites';
  var STORAGE_FAVORITES_ITEMS_KEY = 'favorites_items';
  var STORAGE_HISTORY_KEY = 'watch_history';
  var STORAGE_PROGRESS_KEY = 'playback_progress';
  var MAX_HISTORY_ITEMS = 100;
  var _loadingChannelPromises = {};

  var PlaylistManager = {
    /**
     * Retrieve all saved playlists/providers (metadata only).
     * @returns {Array<Object>}
     */
    getPlaylists: function () {
      var Storage = window.FreeIPTV.Storage;
      if (!Storage) return [];
      return Storage.get(STORAGE_PLAYLISTS_KEY, []) || [];
    },

    /**
     * Get a specific playlist by ID.
     * @param {string} id
     * @returns {Object|null}
     */
    getPlaylist: function (id) {
      var list = this.getPlaylists();
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          return list[i];
        }
      }
      return null;
    },

    getPlaylistById: function (id) {
      return this.getPlaylist(id);
    },

    /**
     * Get the active playlist ID.
     * @returns {string|null}
     */
    getActivePlaylistId: function () {
      var Storage = window.FreeIPTV.Storage;
      if (!Storage) return null;
      var activeId = Storage.get(STORAGE_ACTIVE_KEY, null);
      if (!activeId) {
        var all = this.getPlaylists();
        if (all.length > 0) {
          activeId = all[0].id;
          Storage.set(STORAGE_ACTIVE_KEY, activeId);
        }
      }
      return activeId;
    },

    /**
     * Set the active playlist ID.
     * @param {string} id
     */
    setActivePlaylist: function (id) {
      var Storage = window.FreeIPTV.Storage;
      if (Storage) {
        Storage.set(STORAGE_ACTIVE_KEY, id);
      }
      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.PLAYLIST_ACTIVE_CHANGED, {
          playlistId: id
        });
      }
    },

    /**
     * Switch active playlist by ID and emit active changed event.
     * @param {string} id
     * @returns {Object|null}
     */
    switchActivePlaylist: function (id) {
      var playlist = this.getPlaylist(id);
      if (!playlist) return null;
      this.setActivePlaylist(id);
      return playlist;
    },

    /**
     * Rename a playlist and update persistent storage.
     * @param {string} playlistId
     * @param {string} newName
     * @returns {Object|null}
     */
    renamePlaylist: function (playlistId, newName) {
      var cleanName = (newName || '').trim();
      if (!cleanName) return null;
      var playlists = this.getPlaylists();
      var target = null;
      for (var i = 0; i < playlists.length; i++) {
        if (playlists[i].id === playlistId) {
          playlists[i].name = cleanName;
          playlists[i].updatedAt = Date.now();
          target = playlists[i];
          break;
        }
      }
      if (target) {
        window.FreeIPTV.Storage.set(STORAGE_PLAYLISTS_KEY, playlists);
        if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
          window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.PLAYLIST_UPDATED, {
            playlist: target
          });
        }
      }
      return target;
    },

    /**
     * Update playlist attributes (server, credentials, url, etc.).
     * Strictly protects credentials and never logs passwords.
     * @param {string} playlistId
     * @param {Object} updateData
     * @returns {Object|null}
     */
    updatePlaylist: function (playlistId, updateData) {
      if (!playlistId || !updateData) return null;
      var playlists = this.getPlaylists();
      var target = null;
      for (var i = 0; i < playlists.length; i++) {
        if (playlists[i].id === playlistId) {
          if (updateData.name) playlists[i].name = updateData.name.trim();
          if (updateData.url) {
            playlists[i].url = updateData.url.trim();
            playlists[i].playlistUrl = playlists[i].url;
          }
          if (updateData.server) playlists[i].server = updateData.server.trim();
          if (updateData.username !== undefined) playlists[i].username = updateData.username.trim();
          if (updateData.password !== undefined) playlists[i].password = updateData.password.trim();
          if (updateData.enabled !== undefined) playlists[i].enabled = Boolean(updateData.enabled);
          playlists[i].updatedAt = Date.now();
          target = playlists[i];
          break;
        }
      }
      if (target) {
        window.FreeIPTV.Storage.set(STORAGE_PLAYLISTS_KEY, playlists);
        if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
          window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.PLAYLIST_UPDATED, {
            playlist: target
          });
        }
      }
      return target;
    },

    /**
     * Delete playlist (official alias for removePlaylist).
     * @param {string} playlistId
     * @returns {Promise<boolean>}
     */
    deletePlaylist: function (playlistId) {
      return this.removePlaylist(playlistId);
    },

    /**
     * Get active playlist metadata.
     * @returns {Object|null}
     */
    getActivePlaylist: function () {
      var id = this.getActivePlaylistId();
      return id ? this.getPlaylist(id) : null;
    },

    /**
     * Add a new playlist from a URL or raw content (M3U).
     * @param {string} name User-provided playlist name
     * @param {string} url Playlist download URL
     * @param {string} [rawContent] Optional raw content (e.g. for testing/offline)
     * @returns {Promise<{ playlist: Object, channels: Array, stats: Object }>}
     */
    addPlaylist: function (name, url, rawContent) {
      var self = this;
      var cleanName = (name || '').trim();
      var cleanUrl = (url || '').trim();

      if (!cleanName) {
        cleanName = 'IPTV Playlist ' + (this.getPlaylists().length + 1);
      }

      var playlistId = 'pl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

      var fetchPromise = rawContent !== undefined
        ? Promise.resolve({ data: rawContent })
        : window.FreeIPTV.Http.get(cleanUrl);

      return fetchPromise.then(function (response) {
        var content = response.data;
        if (!content || typeof content !== 'string' || content.trim().length === 0) {
          throw new Error('Playlist is empty or invalid.');
        }

        var parsed = window.FreeIPTV.M3UParser.parse(content, playlistId);

        if (!parsed.channels || parsed.channels.length === 0) {
          throw new Error('No valid playable channels were found in this playlist.');
        }

        var now = Date.now();
        var playlist = {
          id: playlistId,
          name: cleanName,
          url: cleanUrl,
          playlistUrl: cleanUrl,
          type: 'm3u',
          addedAt: now,
          updatedAt: now,
          lastRefreshAt: now,
          channelCount: parsed.channels.length,
          liveCount: parsed.channels.length,
          movieCount: 0,
          seriesCount: 0,
          status: 'Connected',
          categories: parsed.categories,
          metadata: {}
        };

        // Save channel data
        var channelStore = window.FreeIPTV.ChannelStore;
        var savePromise = channelStore
          ? channelStore.saveChannels(playlistId, parsed.channels)
          : Promise.resolve(true);

        return savePromise.then(function () {
          // Save playlist metadata
          var playlists = self.getPlaylists();
          playlists.push(playlist);
          window.FreeIPTV.Storage.set(STORAGE_PLAYLISTS_KEY, playlists);

          // If this is the only playlist or none active, set active
          if (!self.getActivePlaylistId() || playlists.length === 1) {
            self.setActivePlaylist(playlistId);
          }

          if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
            window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.PLAYLIST_ADDED, {
              playlist: playlist,
              stats: parsed.stats
            });
          }

          return {
            playlist: playlist,
            channels: parsed.channels,
            stats: parsed.stats
          };
        });
      });
    },

    /**
     * Add a new Xtream Codes IPTV provider playlist.
     * Authenticates with provider, fetches categories and live streams, and persists data.
     * @param {string} name User-provided playlist/provider name
     * @param {string} server Server / Host URL
     * @param {string} username Account username
     * @param {string} password Account password
     * @returns {Promise<{ playlist: Object, channels: Array, stats: Object }>}
     */
    addXtreamPlaylist: function (name, server, username, password) {
      var self = this;
      var XtreamApi = window.FreeIPTV.XtreamApi;
      if (!XtreamApi) {
        return Promise.reject(new Error('Xtream API service is not available.'));
      }

      var validation = XtreamApi.validateCredentials(server, username, password);
      if (!validation.isValid) {
        return Promise.reject(new Error(validation.error));
      }

      var cleanName = (name || '').trim();
      if (!cleanName) {
        cleanName = 'Xtream IPTV ' + (this.getPlaylists().length + 1);
      }

      var playlistId = 'pl_xtream_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

      return XtreamApi.fetchAll(validation.server, validation.username, validation.password, playlistId)
        .then(function (result) {
          if (!result.channels || result.channels.length === 0) {
            throw new Error('No live channels found for this account.');
          }

          var now = Date.now();
          var playlist = {
            id: playlistId,
            name: cleanName,
            type: 'xtream',
            server: validation.server,
            username: validation.username,
            password: validation.password,
            addedAt: now,
            updatedAt: now,
            lastRefreshAt: now,
            channelCount: result.channels.length,
            liveCount: result.channels.length,
            movieCount: 0,
            seriesCount: 0,
            status: 'Connected',
            categories: result.categories,
            metadata: {
              userInfo: result.userInfo || {},
              serverInfo: result.serverInfo || {}
            }
          };

          // Save channel data
          var channelStore = window.FreeIPTV.ChannelStore;
          var savePromise = channelStore
            ? channelStore.saveChannels(playlistId, result.channels)
            : Promise.resolve(true);

          return savePromise.then(function () {
            // Save playlist metadata
            var playlists = self.getPlaylists();
            playlists.push(playlist);
            window.FreeIPTV.Storage.set(STORAGE_PLAYLISTS_KEY, playlists);

            // If this is the only playlist or none active, set active
            if (!self.getActivePlaylistId() || playlists.length === 1) {
              self.setActivePlaylist(playlistId);
            }

            if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
              window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.PLAYLIST_ADDED, {
                playlist: playlist,
                stats: result.stats
              });
            }

            // Asynchronously fetch VOD and Series in background (non-blocking)
            self.fetchAndCacheXtreamVodAndSeries(playlist);

            return {
              playlist: playlist,
              channels: result.channels,
              stats: result.stats
            };
          });
        });
    },

    /**
     * Background fetch and cache for Xtream VOD movies and Series lists.
     * @param {Object} playlist
     */
    fetchAndCacheXtreamVodAndSeries: function (playlist) {
      if (!playlist || playlist.type !== 'xtream') return;
      var XtreamApi = window.FreeIPTV.XtreamApi;
      var ChannelStore = window.FreeIPTV.ChannelStore;
      if (!XtreamApi || !ChannelStore) return;

      var self = this;
      var pId = playlist.id;
      var server = playlist.server;
      var username = playlist.username;
      var password = playlist.password;

      // 1. Fetch VOD
      XtreamApi.fetchAllVod(server, username, password, pId)
        .then(function (vodResult) {
          if (vodResult && vodResult.movies) {
            ChannelStore.saveMovies(pId, vodResult.movies, vodResult.categories)
              .then(function () {
                self.updatePlaylistCounts(pId, { movieCount: vodResult.movies.length });
                if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
                  window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.VOD_UPDATED, {
                    playlistId: pId,
                    count: vodResult.movies.length
                  });
                }
              });
          }
        })
        .catch(function (err) {
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.warn('Background VOD fetch failed (may be unsupported by provider):', err.message);
          }
        });

      // 2. Fetch Series
      XtreamApi.fetchAllSeries(server, username, password, pId)
        .then(function (seriesResult) {
          if (seriesResult && seriesResult.series) {
            ChannelStore.saveSeries(pId, seriesResult.series, seriesResult.categories)
              .then(function () {
                self.updatePlaylistCounts(pId, { seriesCount: seriesResult.series.length });
                if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
                  window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.SERIES_UPDATED, {
                    playlistId: pId,
                    count: seriesResult.series.length
                  });
                }
              });
          }
        })
        .catch(function (err) {
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.warn('Background Series fetch failed (may be unsupported by provider):', err.message);
          }
        });
    },

    /**
     * Update live/movie/series counts on a playlist record.
     * @param {string} playlistId
     * @param {Object} counts { liveCount?, movieCount?, seriesCount?, status? }
     */
    updatePlaylistCounts: function (playlistId, counts) {
      if (!playlistId || !counts) return null;
      var playlists = this.getPlaylists();
      var changed = false;
      var updatedPlaylist = null;
      for (var i = 0; i < playlists.length; i++) {
        if (playlists[i].id === playlistId) {
          if (counts.liveCount !== undefined && playlists[i].liveCount !== counts.liveCount) {
            playlists[i].liveCount = counts.liveCount;
            playlists[i].channelCount = counts.liveCount;
            changed = true;
          }
          if (counts.channelCount !== undefined && playlists[i].channelCount !== counts.channelCount) {
            playlists[i].channelCount = counts.channelCount;
            if (playlists[i].liveCount === undefined || playlists[i].liveCount === 0) {
              playlists[i].liveCount = counts.channelCount;
            }
            changed = true;
          }
          if (counts.movieCount !== undefined && playlists[i].movieCount !== counts.movieCount) {
            playlists[i].movieCount = counts.movieCount;
            changed = true;
          }
          if (counts.seriesCount !== undefined && playlists[i].seriesCount !== counts.seriesCount) {
            playlists[i].seriesCount = counts.seriesCount;
            changed = true;
          }
          if (counts.status !== undefined && playlists[i].status !== counts.status) {
            playlists[i].status = counts.status;
            changed = true;
          }
          if (changed) {
            playlists[i].updatedAt = Date.now();
          }
          updatedPlaylist = playlists[i];
          break;
        }
      }
      if (changed) {
        window.FreeIPTV.Storage.set(STORAGE_PLAYLISTS_KEY, playlists);
        if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
          window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.PLAYLIST_UPDATED, {
            playlist: updatedPlaylist
          });
        }
      }
      return updatedPlaylist;
    },

    /**
     * Load channels for a playlist with automatic on-demand API fetch if cache is empty.
     * Includes in-flight deduplication to avoid redundant concurrent requests.
     * @param {string} [playlistId] Defaults to active playlist
     * @param {boolean} [forceRefresh] If true, re-fetches from provider API
     * @returns {Promise<Array>}
     */
    loadChannels: function (playlistId, forceRefresh) {
      var self = this;
      var targetId = playlistId || this.getActivePlaylistId();
      if (!targetId) {
        var noProvErr = new Error('No active playlist configured.');
        noProvErr.code = 'NO_PROVIDER';
        return Promise.reject(noProvErr);
      }

      var playlist = this.getPlaylist(targetId);
      if (!playlist) {
        var missingErr = new Error('No active playlist configured.');
        missingErr.code = 'NO_PROVIDER';
        return Promise.reject(missingErr);
      }

      // In-flight request deduplication: reuse running request if not forceRefresh
      if (!forceRefresh && _loadingChannelPromises[targetId]) {
        return _loadingChannelPromises[targetId];
      }

      var channelStore = window.FreeIPTV.ChannelStore;

      function decorateChannels(channels) {
        var favorites = self.getFavoriteIds();
        var favSet = {};
        for (var i = 0; i < favorites.length; i++) {
          favSet[favorites[i]] = true;
        }
        return channels.map(function (ch) {
          ch.isFavorite = Boolean(favSet[ch.id] || favSet[ch.streamUrl] || favSet[ch.name]);
          return ch;
        });
      }

      function fetchFromStore() {
        var getPromise = channelStore
          ? channelStore.getChannels(targetId)
          : Promise.resolve([]);

        return getPromise.then(function (channels) {
          var hasCached = channels && Array.isArray(channels) && channels.length > 0;
          if (!hasCached || forceRefresh) {
            return fetchFromProvider(hasCached ? channels : null);
          }
          // Synchronize cached count to playlist metadata
          self.updatePlaylistCounts(targetId, {
            channelCount: channels.length,
            liveCount: channels.length
          });
          return decorateChannels(channels);
        });
      }

      function fetchFromProvider(fallbackCached) {
        if (playlist.type === 'xtream') {
          var XtreamApi = window.FreeIPTV.XtreamApi;
          if (!XtreamApi) {
            if (fallbackCached) return Promise.resolve(decorateChannels(fallbackCached));
            var apiErr = new Error('Xtream API service is not available.');
            apiErr.code = 'CONNECTION_FAILURE';
            return Promise.reject(apiErr);
          }

          var normServer = playlist.server;
          var cleanUser = playlist.username;
          var cleanPass = playlist.password;

          return XtreamApi.authenticate(normServer, cleanUser, cleanPass)
            .catch(function (authErr) {
              if (fallbackCached) return null;
              var msg = (authErr && authErr.message) || 'Authentication failed.';
              var err = new Error(msg);
              err.code = 'AUTH_FAILURE';
              throw err;
            })
            .then(function (authRes) {
              if (!authRes && fallbackCached) {
                return decorateChannels(fallbackCached);
              }
              return Promise.all([
                XtreamApi.getCategories(normServer, cleanUser, cleanPass).catch(function () { return []; }),
                XtreamApi.getStreams(normServer, cleanUser, cleanPass)
              ]).then(function (results) {
                var categories = results[0] || [];
                var rawStreams = results[1] || [];

                if (!rawStreams || rawStreams.length === 0) {
                  if (fallbackCached) return decorateChannels(fallbackCached);
                  var noChErr = new Error('No live TV channels were returned by this provider.');
                  noChErr.code = 'NO_CHANNELS';
                  throw noChErr;
                }

                var normalized = XtreamApi.normalizeStreams(rawStreams, categories, normServer, cleanUser, cleanPass, targetId);
                var validChannels = normalized.channels || [];

                if (validChannels.length === 0) {
                  if (fallbackCached) return decorateChannels(fallbackCached);
                  var normErr = new Error('Provider returned data, but no playable channels could be loaded.');
                  normErr.code = 'NORMALIZATION_FAILURE';
                  throw normErr;
                }

                var savePromise = channelStore
                  ? channelStore.saveChannels(targetId, validChannels)
                  : Promise.resolve(true);

                return savePromise.then(function () {
                  self.updatePlaylistCounts(targetId, {
                    channelCount: validChannels.length,
                    liveCount: validChannels.length,
                    status: 'Connected'
                  });
                  return decorateChannels(validChannels);
                });
              });
            })
            .catch(function (err) {
              if (fallbackCached) {
                if (window.FreeIPTV.Logger) {
                  window.FreeIPTV.Logger.warn('Provider live stream refresh failed, using cached channels:', err);
                }
                return decorateChannels(fallbackCached);
              }
              throw err;
            });
        } else if (playlist.type === 'm3u') {
          var cleanUrl = playlist.url || playlist.playlistUrl;
          if (!cleanUrl) {
            if (fallbackCached) return Promise.resolve(decorateChannels(fallbackCached));
            var noUrlErr = new Error('M3U playlist URL is missing.');
            noUrlErr.code = 'NO_PROVIDER';
            return Promise.reject(noUrlErr);
          }

          return window.FreeIPTV.Http.get(cleanUrl)
            .catch(function (netErr) {
              if (fallbackCached) return null;
              var connErr = new Error('Unable to connect to IPTV provider.');
              connErr.code = 'CONNECTION_FAILURE';
              throw connErr;
            })
            .then(function (response) {
              if (!response && fallbackCached) {
                return decorateChannels(fallbackCached);
              }
              var content = response ? response.data : null;
              if (!content || typeof content !== 'string' || content.trim().length === 0) {
                if (fallbackCached) return decorateChannels(fallbackCached);
                var emptyErr = new Error('No live TV channels were returned by this provider.');
                emptyErr.code = 'NO_CHANNELS';
                throw emptyErr;
              }

              var parsed = window.FreeIPTV.M3UParser.parse(content, targetId);
              if (!parsed.channels || parsed.channels.length === 0) {
                if (fallbackCached) return decorateChannels(fallbackCached);
                var normErr = new Error('Provider returned data, but no playable channels could be loaded.');
                normErr.code = 'NORMALIZATION_FAILURE';
                throw normErr;
              }

              var savePromise = channelStore
                ? channelStore.saveChannels(targetId, parsed.channels)
                : Promise.resolve(true);

              return savePromise.then(function () {
                self.updatePlaylistCounts(targetId, {
                  channelCount: parsed.channels.length,
                  liveCount: parsed.channels.length,
                  status: 'Connected'
                });
                return decorateChannels(parsed.channels);
              });
            })
            .catch(function (err) {
              if (fallbackCached) {
                return decorateChannels(fallbackCached);
              }
              throw err;
            });
        } else {
          return Promise.resolve(fallbackCached ? decorateChannels(fallbackCached) : []);
        }
      }

      var runningPromise = fetchFromStore().then(
        function (res) {
          delete _loadingChannelPromises[targetId];
          return res;
        },
        function (err) {
          delete _loadingChannelPromises[targetId];
          throw err;
        }
      );

      _loadingChannelPromises[targetId] = runningPromise;
      return runningPromise;
    },

    /**
     * Authoritative single source of truth for normalized Live TV channel counts.
     * 1. Resolves target playlist (defaults to active).
     * 2. Checks cached channels in ChannelStore / in-memory.
     * 3. If cache is empty, fetches channels on-demand.
     * 4. Updates playlist metadata so counts stay synchronized across all UI views.
     * 5. Returns total normalized live channel count (0 only if genuinely empty).
     * @param {string} [playlistId] Defaults to active playlist
     * @returns {Promise<number>}
     */
    getChannelCount: function (playlistId) {
      var self = this;
      var targetId = playlistId || this.getActivePlaylistId();
      if (!targetId) {
        var noPlErr = new Error('No active playlist configured.');
        noPlErr.code = 'NO_PLAYLIST';
        return Promise.reject(noPlErr);
      }

      var playlist = this.getPlaylist(targetId);
      if (!playlist) {
        var notFoundErr = new Error('Playlist not found: ' + targetId);
        notFoundErr.code = 'PLAYLIST_NOT_FOUND';
        return Promise.reject(notFoundErr);
      }

      var channelStore = window.FreeIPTV.ChannelStore;
      var getStorePromise = channelStore
        ? channelStore.getChannels(targetId)
        : Promise.resolve([]);

      return getStorePromise.then(function (cachedChannels) {
        if (cachedChannels && Array.isArray(cachedChannels) && cachedChannels.length > 0) {
          self.updatePlaylistCounts(targetId, {
            channelCount: cachedChannels.length,
            liveCount: cachedChannels.length
          });
          return cachedChannels.length;
        }

        // Cache is empty (cold cache): load on-demand
        return self.loadChannels(targetId, false)
          .then(function (loaded) {
            var count = (loaded && Array.isArray(loaded)) ? loaded.length : 0;
            self.updatePlaylistCounts(targetId, {
              channelCount: count,
              liveCount: count
            });
            return count;
          })
          .catch(function (loadErr) {
            if (loadErr && loadErr.code === 'NO_CHANNELS') {
              self.updatePlaylistCounts(targetId, {
                channelCount: 0,
                liveCount: 0
              });
              return 0;
            }
            return playlist.liveCount || playlist.channelCount || 0;
          });
      });
    },

    /**
     * Synchronous channel count inspection. Returns known count or null if unknown/loading.
     * @param {string} [playlistId]
     * @returns {number|null}
     */
    getChannelCountSync: function (playlistId) {
      var targetId = playlistId || this.getActivePlaylistId();
      if (!targetId) return null;
      var playlist = this.getPlaylist(targetId);
      if (!playlist) return null;
      if (typeof playlist.liveCount === 'number') {
        return playlist.liveCount;
      }
      if (typeof playlist.channelCount === 'number') {
        return playlist.channelCount;
      }
      return null;
    },

    /**
     * Format a numeric channel count with standard thousand separators.
     * @param {number|string} num
     * @returns {string}
     */
    formatChannelCount: function (num) {
      if (num === null || num === undefined) return '';
      return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },

    /**
     * Load VOD movies for a playlist with automatic on-demand API fetch if cache is empty.
     * @param {string} [playlistId] Defaults to active playlist
     * @param {boolean} [forceRefresh] If true, re-fetches from provider API
     * @returns {Promise<{ movies: Array, categories: Array }>}
     */
    loadMovies: function (playlistId, forceRefresh) {
      var self = this;
      var targetId = playlistId || this.getActivePlaylistId();
      if (!targetId) {
        return Promise.resolve({ movies: [], categories: [] });
      }

      var channelStore = window.FreeIPTV.ChannelStore;
      if (!channelStore) return Promise.resolve({ movies: [], categories: [] });

      var playlist = self.getPlaylist(targetId);

      function fetchFromStore() {
        return channelStore.getMovies(targetId).then(function (result) {
          var movies = (result && result.movies) || [];
          var categories = (result && result.categories) || [];

          if ((movies.length === 0 || forceRefresh) && playlist && playlist.type === 'xtream') {
            return fetchFromApi();
          }

          return decorateMovies(movies, categories);
        });
      }

      function fetchFromApi() {
        var XtreamApi = window.FreeIPTV.XtreamApi;
        if (!XtreamApi || !playlist || playlist.type !== 'xtream') {
          return Promise.resolve({ movies: [], categories: [] });
        }

        return XtreamApi.fetchAllVod(playlist.server, playlist.username, playlist.password, targetId)
          .then(function (vodResult) {
            var movies = (vodResult && vodResult.movies) || [];
            var categories = (vodResult && vodResult.categories) || [];
            return channelStore.saveMovies(targetId, movies, categories).then(function () {
              self.updatePlaylistCounts(targetId, { movieCount: movies.length });
              return decorateMovies(movies, categories);
            });
          })
          .catch(function (err) {
            if (window.FreeIPTV.Logger) {
              window.FreeIPTV.Logger.warn('On-demand VOD fetch failed:', err.message);
            }
            self._lastApiError = 'VOD: ' + err.message;
            return channelStore.getMovies(targetId).then(function (res) {
              return decorateMovies((res && res.movies) || [], (res && res.categories) || []);
            });
          });
      }

      function decorateMovies(movies, categories) {
        var favItems = self.getFavorites('movie');
        var favSet = {};
        for (var i = 0; i < favItems.length; i++) {
          favSet[favItems[i].contentId] = true;
        }

        for (var m = 0; m < movies.length; m++) {
          movies[m].isFavorite = Boolean(favSet[movies[m].id]);
        }

        return {
          movies: movies,
          categories: categories || []
        };
      }

      if (forceRefresh && playlist && playlist.type === 'xtream') {
        return fetchFromApi();
      }

      return fetchFromStore();
    },

    /**
     * Load Series for a playlist with automatic on-demand API fetch if cache is empty.
     * @param {string} [playlistId] Defaults to active playlist
     * @param {boolean} [forceRefresh] If true, re-fetches from provider API
     * @returns {Promise<{ series: Array, categories: Array }>}
     */
    loadSeries: function (playlistId, forceRefresh) {
      var self = this;
      var targetId = playlistId || this.getActivePlaylistId();
      if (!targetId) {
        return Promise.resolve({ series: [], categories: [] });
      }

      var channelStore = window.FreeIPTV.ChannelStore;
      if (!channelStore) return Promise.resolve({ series: [], categories: [] });

      var playlist = self.getPlaylist(targetId);

      function fetchFromStore() {
        return channelStore.getSeries(targetId).then(function (result) {
          var series = (result && result.series) || [];
          var categories = (result && result.categories) || [];

          if ((series.length === 0 || forceRefresh) && playlist && playlist.type === 'xtream') {
            return fetchFromApi();
          }

          return decorateSeries(series, categories);
        });
      }

      function fetchFromApi() {
        var XtreamApi = window.FreeIPTV.XtreamApi;
        if (!XtreamApi || !playlist || playlist.type !== 'xtream') {
          return Promise.resolve({ series: [], categories: [] });
        }

        return XtreamApi.fetchAllSeries(playlist.server, playlist.username, playlist.password, targetId)
          .then(function (seriesResult) {
            var seriesList = (seriesResult && seriesResult.series) || [];
            var categories = (seriesResult && seriesResult.categories) || [];
            return channelStore.saveSeries(targetId, seriesList, categories).then(function () {
              self.updatePlaylistCounts(targetId, { seriesCount: seriesList.length });
              return decorateSeries(seriesList, categories);
            });
          })
          .catch(function (err) {
            if (window.FreeIPTV.Logger) {
              window.FreeIPTV.Logger.warn('On-demand Series fetch failed:', err.message);
            }
            self._lastApiError = 'Series: ' + err.message;
            return channelStore.getSeries(targetId).then(function (res) {
              return decorateSeries((res && res.series) || [], (res && res.categories) || []);
            });
          });
      }

      function decorateSeries(series, categories) {
        var favItems = self.getFavorites('series');
        var favSet = {};
        for (var i = 0; i < favItems.length; i++) {
          favSet[favItems[i].contentId] = true;
        }

        for (var s = 0; s < series.length; s++) {
          series[s].isFavorite = Boolean(favSet[series[s].id]);
        }

        return {
          series: series,
          categories: categories || []
        };
      }

      if (forceRefresh && playlist && playlist.type === 'xtream') {
        return fetchFromApi();
      }

      return fetchFromStore();
    },

    /**
     * Get detailed metadata for a movie (from cache or API).
     * @param {string} playlistId
     * @param {Object} movie
     * @returns {Promise<Object>}
     */
    getMovieDetails: function (playlistId, movie) {
      if (!movie) return Promise.resolve({});
      var channelStore = window.FreeIPTV.ChannelStore;
      var streamId = (movie.metadata && movie.metadata.streamId) || movie.id;

      if (channelStore) {
        return channelStore.getVodDetails(playlistId, streamId).then(function (cached) {
          if (cached) return cached;
          return fetchVodDetailsFromApi();
        });
      }

      return fetchVodDetailsFromApi();

      function fetchVodDetailsFromApi() {
        var playlist = PlaylistManager.getPlaylist(playlistId);
        var XtreamApi = window.FreeIPTV.XtreamApi;
        if (!playlist || playlist.type !== 'xtream' || !XtreamApi) {
          return Promise.resolve(movie);
        }

        return XtreamApi.getVodInfo(playlist.server, playlist.username, playlist.password, streamId)
          .then(function (infoObj) {
            if (channelStore) {
              channelStore.saveVodDetails(playlistId, streamId, infoObj);
            }
            return infoObj;
          })
          .catch(function () {
            return movie;
          });
      }
    },

    /**
     * Get detailed seasons and episodes for a series (from cache or API).
     * @param {string} playlistId
     * @param {Object} series
     * @returns {Promise<{ seasons: Array, episodesBySeason: Object, allEpisodes: Array }>}
     */
    getSeriesDetails: function (playlistId, series) {
      if (!series) return Promise.resolve({ seasons: [], episodesBySeason: {}, allEpisodes: [] });
      var channelStore = window.FreeIPTV.ChannelStore;
      var seriesId = (series.metadata && series.metadata.seriesId) || series.id;

      if (channelStore) {
        return channelStore.getSeriesDetails(playlistId, seriesId).then(function (cached) {
          if (cached) return cached;
          return fetchSeriesDetailsFromApi();
        });
      }

      return fetchSeriesDetailsFromApi();

      function fetchSeriesDetailsFromApi() {
        var playlist = PlaylistManager.getPlaylist(playlistId);
        var XtreamApi = window.FreeIPTV.XtreamApi;
        if (!playlist || playlist.type !== 'xtream' || !XtreamApi) {
          return Promise.resolve({ seasons: [], episodesBySeason: {}, allEpisodes: [] });
        }

        return XtreamApi.getSeriesInfo(playlist.server, playlist.username, playlist.password, seriesId)
          .then(function (rawInfo) {
            var normalized = XtreamApi.normalizeSeriesInfo(rawInfo, seriesId, playlist.server, playlist.username, playlist.password, playlistId);
            if (channelStore) {
              channelStore.saveSeriesDetails(playlistId, seriesId, normalized);
            }
            return normalized;
          })
          .catch(function () {
            return { seasons: [], episodesBySeason: {}, allEpisodes: [] };
          });
      }
    },

    /**
     * Load EPG programs for a channel with TTL caching.
     * @param {string} playlistId
     * @param {Object} channel
     * @returns {Promise<Array>}
     */
    loadChannelEpg: function (playlistId, channel) {
      if (!channel) return Promise.resolve([]);
      var self = this;
      var channelStore = window.FreeIPTV.ChannelStore;
      var dateStr = new Date().toISOString().slice(0, 10);
      var streamId = (channel.metadata && channel.metadata.streamId) || channel.id;

      if (channelStore) {
        return channelStore.getEpg(playlistId, channel.id, dateStr).then(function (cached) {
          if (cached && cached.length > 0) {
            self._lastEpgStatus = 'Cached (' + cached.length + ')';
            self._lastEpgChannel = channel.name;
            self._lastEpgCount = cached.length;
            return cached;
          }
          return fetchEpgFromApi();
        });
      }

      return fetchEpgFromApi();

      function fetchEpgFromApi() {
        var playlist = PlaylistManager.getPlaylist(playlistId);
        var XtreamApi = window.FreeIPTV.XtreamApi;
        if (!playlist || playlist.type !== 'xtream' || !XtreamApi || !streamId) {
          self._lastEpgStatus = 'Unavailable';
          self._lastEpgChannel = channel.name;
          self._lastEpgCount = 0;
          return Promise.resolve([]);
        }

        return XtreamApi.getShortEpg(playlist.server, playlist.username, playlist.password, streamId, 10)
          .then(function (rawEpg) {
            var programs = XtreamApi.normalizeEpgPrograms(rawEpg, channel.id, channel.tvgId);
            if (programs && programs.length > 0) {
              if (channelStore) {
                channelStore.saveEpg(playlistId, channel.id, dateStr, programs, 2 * 60 * 60 * 1000);
              }
              self._lastEpgStatus = 'Live OK (' + programs.length + ')';
              self._lastEpgChannel = channel.name;
              self._lastEpgCount = programs.length;
            } else {
              self._lastEpgStatus = 'No Programs';
              self._lastEpgChannel = channel.name;
              self._lastEpgCount = 0;
            }
            return programs || [];
          })
          .catch(function (err) {
            self._lastEpgStatus = 'Failed: ' + (err.message || 'Error');
            self._lastEpgChannel = channel.name;
            self._lastEpgCount = 0;
            return [];
          });
      }
    },

    /**
     * Get sanitized diagnostic metrics and status for Settings panel (zero credential leak).
     * @returns {Object}
     */
    getDiagnostics: function () {
      var activePlaylist = this.getActivePlaylist();
      var host = 'None';
      if (activePlaylist) {
        if (activePlaylist.server) {
          try {
            var parsed = new URL(activePlaylist.server);
            host = parsed.host;
          } catch (e) {
            host = activePlaylist.server.replace(/^https?:\/\//, '').split('/')[0];
          }
        } else if (activePlaylist.url) {
          host = 'M3U Source';
        }
      }

      return {
        hasActivePlaylist: Boolean(activePlaylist),
        playlistId: activePlaylist ? activePlaylist.id : null,
        playlistType: activePlaylist ? activePlaylist.type : 'none',
        playlistName: activePlaylist ? activePlaylist.name : 'No Provider Active',
        serverHost: host,
        liveCount: activePlaylist ? (activePlaylist.liveCount || activePlaylist.channelCount || 0) : 0,
        movieCount: activePlaylist ? (activePlaylist.movieCount || 0) : 0,
        seriesCount: activePlaylist ? (activePlaylist.seriesCount || 0) : 0,
        status: activePlaylist ? (activePlaylist.status || 'Connected') : 'No Provider',
        lastRefreshAt: activePlaylist && activePlaylist.lastRefreshAt ? new Date(activePlaylist.lastRefreshAt).toLocaleTimeString() : 'Never',
        epgStatus: this._lastEpgStatus || 'Idle',
        lastEpgChannel: this._lastEpgChannel || 'None',
        lastEpgCount: this._lastEpgCount || 0,
        lastApiError: this._lastApiError || 'None'
      };
    },

    /**
     * Build an arbitrary-depth category tree supporting Xtream parentId and M3U delimiters.
     * @param {Array} categories Category objects or strings
     * @param {Array} channels Channel list
     * @returns {{ rootNodes: Array<Object>, nodeMap: Object }}
     */
    buildCategoryTree: function (categories, channels) {
      var nodeMap = {};
      var rootNodes = [];
      var channelList = Array.isArray(channels) ? channels : [];

      // 1. Process category definitions
      if (Array.isArray(categories)) {
        for (var i = 0; i < categories.length; i++) {
          var item = categories[i];
          if (!item) continue;

          if (typeof item === 'object') {
            // Xtream category object: { id, name, parentId }
            var catId = item.id !== undefined ? String(item.id).trim() : 'cat_' + i;
            var catName = item.name ? String(item.name).trim() : 'Category ' + (i + 1);
            var pIdVal = item.parentId !== undefined ? item.parentId : (item.parent_id !== undefined ? item.parent_id : null);
            var parentId = (pIdVal && pIdVal !== 0 && pIdVal !== '0') ? String(pIdVal).trim() : null;

            nodeMap[catId] = {
              id: catId,
              name: catName,
              parentId: parentId,
              children: [],
              channels: [],
              channelCount: 0
            };
          } else if (typeof item === 'string') {
            var rawStr = item.trim();
            if (!rawStr) continue;

            // Check for delimiter hierarchy e.g. "USA | Sports" or "UK / News" or "Movies :: Action"
            var parts = rawStr.split(/\s*\|\s*|\s*::\s*|\s*\/\s*/);
            if (parts.length > 1) {
              var parentKey = 'm3u_p_' + parts[0];
              if (!nodeMap[parentKey]) {
                nodeMap[parentKey] = {
                  id: parentKey,
                  name: parts[0],
                  parentId: null,
                  children: [],
                  channels: [],
                  channelCount: 0
                };
              }

              var childKey = 'm3u_c_' + rawStr;
              nodeMap[childKey] = {
                id: childKey,
                name: parts.slice(1).join(' - '),
                originalName: rawStr,
                parentId: parentKey,
                children: [],
                channels: [],
                channelCount: 0
              };
            } else {
              var flatKey = 'm3u_' + rawStr;
              nodeMap[flatKey] = {
                id: flatKey,
                name: rawStr,
                originalName: rawStr,
                parentId: null,
                children: [],
                channels: [],
                channelCount: 0
              };
            }
          }
        }
      }

      // 2. Associate channels to categories
      for (var c = 0; c < channelList.length; c++) {
        var ch = channelList[c];
        var assigned = false;

        // Match by categoryId first
        if (ch.categoryId && nodeMap[String(ch.categoryId)]) {
          nodeMap[String(ch.categoryId)].channels.push(ch);
          assigned = true;
        }

        // Match by groupTitle
        if (!assigned && ch.groupTitle) {
          var gt = ch.groupTitle.trim();
          var foundNode = null;
          for (var k in nodeMap) {
            if (nodeMap[k].originalName === gt || nodeMap[k].name === gt) {
              foundNode = nodeMap[k];
              break;
            }
          }

          if (foundNode) {
            foundNode.channels.push(ch);
            assigned = true;
          } else {
            // Dynamic category creation if not predefined
            var dynKey = 'dyn_' + gt;
            if (!nodeMap[dynKey]) {
              nodeMap[dynKey] = {
                id: dynKey,
                name: gt,
                originalName: gt,
                parentId: null,
                children: [],
                channels: [],
                channelCount: 0
              };
            }
            nodeMap[dynKey].channels.push(ch);
            assigned = true;
          }
        }
      }

      // 3. Assemble tree hierarchy
      for (var key in nodeMap) {
        var node = nodeMap[key];
        if (node.parentId && nodeMap[node.parentId] && node.parentId !== node.id) {
          nodeMap[node.parentId].children.push(node);
        } else {
          rootNodes.push(node);
        }
      }

      // 4. Recursively roll up channel counts
      function rollup(n) {
        var sum = n.channels.length;
        for (var chIdx = 0; chIdx < n.children.length; chIdx++) {
          sum += rollup(n.children[chIdx]);
        }
        n.channelCount = sum;
        return sum;
      }

      for (var r = 0; r < rootNodes.length; r++) {
        rollup(rootNodes[r]);
      }

      return {
        rootNodes: rootNodes,
        nodeMap: nodeMap
      };
    },

    /**
     * Get all channels in a category node and all of its descendants recursively.
     * @param {Object} node
     * @returns {Array}
     */
    getChannelsForCategoryNode: function (node) {
      if (!node) return [];
      var result = [].concat(node.channels || []);
      if (Array.isArray(node.children)) {
        for (var i = 0; i < node.children.length; i++) {
          result = result.concat(this.getChannelsForCategoryNode(node.children[i]));
        }
      }
      return result;
    },

    /**
     * Refresh a playlist by re-fetching channels and content from its source.
     * Preserves favorites and keeps cached data if refresh fails.
     * @param {string} playlistId
     * @returns {Promise<{ playlist: Object, stats: Object }>}
     */
    refreshPlaylist: function (playlistId) {
      var self = this;
      var playlist = this.getPlaylist(playlistId);
      if (!playlist) {
        return Promise.reject(new Error('Playlist not found.'));
      }

      // Handle Xtream Codes playlist refresh
      if (playlist.type === 'xtream') {
        var XtreamApi = window.FreeIPTV.XtreamApi;
        if (!XtreamApi) {
          return Promise.reject(new Error('Xtream API service is not available.'));
        }

        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.info('Refreshing Xtream playlist:', playlist.name);
        }

        return XtreamApi.fetchAll(playlist.server, playlist.username, playlist.password, playlistId)
          .then(function (result) {
            if (!result.channels || result.channels.length === 0) {
              throw new Error('Refreshed Xtream playlist contains no valid channels.');
            }

            var channelStore = window.FreeIPTV.ChannelStore;
            var savePromise = channelStore
              ? channelStore.saveChannels(playlistId, result.channels)
              : Promise.resolve(true);

            return savePromise.then(function () {
              var playlists = self.getPlaylists();
              for (var i = 0; i < playlists.length; i++) {
                if (playlists[i].id === playlistId) {
                  playlists[i].updatedAt = Date.now();
                  playlists[i].lastRefreshAt = Date.now();
                  playlists[i].channelCount = result.channels.length;
                  playlists[i].liveCount = result.channels.length;
                  playlists[i].categories = result.categories;
                  playlists[i].status = 'Connected';
                  playlist = playlists[i];
                  break;
                }
              }
              window.FreeIPTV.Storage.set(STORAGE_PLAYLISTS_KEY, playlists);

              // Also refresh VOD and Series in background
              self.fetchAndCacheXtreamVodAndSeries(playlist);

              if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
                window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.PLAYLIST_UPDATED, {
                  playlist: playlist,
                  stats: result.stats
                });
              }

              return {
                playlist: playlist,
                stats: result.stats
              };
            });
          })
          .catch(function (err) {
            self.updatePlaylistCounts(playlistId, { status: 'Offline' });
            throw err;
          });
      }

      // Handle M3U playlist refresh
      if (!playlist.url) {
        return Promise.reject(new Error('Playlist has no URL to refresh.'));
      }

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('Refreshing M3U playlist:', playlist.name, playlist.url);
      }

      return window.FreeIPTV.Http.get(playlist.url).then(function (response) {
        var content = response.data;
        var parsed = window.FreeIPTV.M3UParser.parse(content, playlistId);

        if (!parsed.channels || parsed.channels.length === 0) {
          throw new Error('Refreshed playlist contains no valid channels.');
        }

        // Save updated channels
        var channelStore = window.FreeIPTV.ChannelStore;
        var savePromise = channelStore
          ? channelStore.saveChannels(playlistId, parsed.channels)
          : Promise.resolve(true);

        return savePromise.then(function () {
          // Update playlist metadata
          var playlists = self.getPlaylists();
          for (var i = 0; i < playlists.length; i++) {
            if (playlists[i].id === playlistId) {
              playlists[i].updatedAt = Date.now();
              playlists[i].lastRefreshAt = Date.now();
              playlists[i].channelCount = parsed.channels.length;
              playlists[i].liveCount = parsed.channels.length;
              playlists[i].categories = parsed.categories;
              playlists[i].status = 'Connected';
              playlist = playlists[i];
              break;
            }
          }
          window.FreeIPTV.Storage.set(STORAGE_PLAYLISTS_KEY, playlists);

          if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
            window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.PLAYLIST_UPDATED, {
              playlist: playlist,
              stats: parsed.stats
            });
          }

          return {
            playlist: playlist,
            stats: parsed.stats
          };
        });
      });
    },

    /**
     * Remove a playlist and clean up all its cached content.
     * @param {string} playlistId
     * @returns {Promise<boolean>}
     */
    removePlaylist: function (playlistId) {
      var self = this;
      var playlists = this.getPlaylists().filter(function (p) {
        return p.id !== playlistId;
      });

      window.FreeIPTV.Storage.set(STORAGE_PLAYLISTS_KEY, playlists);

      // If removed playlist was active, switch active to another playlist
      var activeId = this.getActivePlaylistId();
      if (activeId === playlistId) {
        var newActive = playlists.length > 0 ? playlists[0].id : null;
        if (newActive) {
          self.setActivePlaylist(newActive);
        } else {
          window.FreeIPTV.Storage.remove(STORAGE_ACTIVE_KEY);
        }
      }

      var channelStore = window.FreeIPTV.ChannelStore;
      var deletePromise = channelStore
        ? channelStore.deletePlaylistContent(playlistId)
        : Promise.resolve(true);

      return deletePromise.then(function () {
        if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
          window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.PLAYLIST_REMOVED, {
            playlistId: playlistId
          });
        }
        return true;
      });
    },

    // ==========================================
    // UNIFIED FAVORITES MANAGEMENT (Phase N)
    // ==========================================

    /**
     * Get list of favorite channel IDs/identifiers (Legacy compatibility).
     * @returns {Array<string>}
     */
    getFavoriteIds: function () {
      var Storage = window.FreeIPTV.Storage;
      if (!Storage) return [];
      return Storage.get(STORAGE_FAVORITES_KEY, []) || [];
    },

    /**
     * Check if a channel is in favorites (Legacy compatibility).
     * @param {string} channelIdentifier ID or streamUrl
     * @returns {boolean}
     */
    isFavorite: function (channelIdentifier) {
      var favs = this.getFavoriteIds();
      return favs.indexOf(channelIdentifier) !== -1;
    },

    /**
     * Toggle favorite status of a channel (Legacy compatibility).
     * @param {string} channelIdentifier
     * @returns {boolean} New favorite state
     */
    toggleFavorite: function (channelIdentifier) {
      var favs = this.getFavoriteIds();
      var index = favs.indexOf(channelIdentifier);
      var newState = false;

      if (index === -1) {
        favs.push(channelIdentifier);
        newState = true;
      } else {
        favs.splice(index, 1);
        newState = false;
      }

      window.FreeIPTV.Storage.set(STORAGE_FAVORITES_KEY, favs);

      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.FAVORITES_UPDATED, {
          channelId: channelIdentifier,
          isFavorite: newState,
          favorites: favs
        });
      }

      return newState;
    },

    /**
     * Get all structured favorite items, optionally filtered by content type and playlist.
     * @param {string} [contentType] 'live' | 'movie' | 'series' | 'all'
     * @param {string} [playlistId] Optional playlist ID to restrict to specific provider
     * @returns {Array<Object>}
     */
    getFavorites: function (contentType, playlistId) {
      var Storage = window.FreeIPTV.Storage;
      if (!Storage) return [];
      var items = Storage.get(STORAGE_FAVORITES_ITEMS_KEY, []) || [];
      var targetProvider = playlistId || null;
      return items.filter(function (it) {
        var matchType = (!contentType || contentType === 'all') ? true : (it.contentType === contentType);
        var matchProvider = targetProvider ? (it.providerId === targetProvider) : true;
        return matchType && matchProvider;
      });
    },

    /**
     * Check if a structured item is favorited.
     * @param {string} contentId
     * @param {string} [contentType]
     * @returns {boolean}
     */
    isFavoriteItem: function (contentId, contentType) {
      var items = this.getFavorites();
      for (var i = 0; i < items.length; i++) {
        if (items[i].contentId === contentId) {
          if (!contentType || items[i].contentType === contentType) {
            return true;
          }
        }
      }
      return false;
    },

    /**
     * Add or remove a structured favorite item.
     * @param {Object} item { providerId, contentType, contentId, title, posterUrl, streamUrl, categoryName }
     * @returns {boolean} New favorite state
     */
    toggleFavoriteItem: function (item) {
      if (!item || !item.contentId) return false;
      var Storage = window.FreeIPTV.Storage;
      if (!Storage) return false;

      var items = this.getFavorites();
      var foundIndex = -1;
      for (var i = 0; i < items.length; i++) {
        if (items[i].contentId === item.contentId && items[i].contentType === item.contentType) {
          foundIndex = i;
          break;
        }
      }

      var newState = false;
      if (foundIndex === -1) {
        var favRecord = {
          providerId: item.providerId || this.getActivePlaylistId() || '',
          contentType: item.contentType || 'live',
          contentId: item.contentId,
          title: item.title || item.name || '',
          posterUrl: item.posterUrl || item.logoUrl || '',
          streamUrl: item.streamUrl || '',
          categoryName: item.categoryName || item.groupTitle || '',
          createdAt: Date.now()
        };
        items.push(favRecord);
        newState = true;

        // Keep legacy ID list synchronized
        var favIds = this.getFavoriteIds();
        if (favIds.indexOf(item.contentId) === -1) {
          favIds.push(item.contentId);
          Storage.set(STORAGE_FAVORITES_KEY, favIds);
        }
      } else {
        items.splice(foundIndex, 1);
        newState = false;

        // Remove from legacy ID list
        var legacyIds = this.getFavoriteIds().filter(function (id) {
          return id !== item.contentId;
        });
        Storage.set(STORAGE_FAVORITES_KEY, legacyIds);
      }

      Storage.set(STORAGE_FAVORITES_ITEMS_KEY, items);

      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.FAVORITES_UPDATED, {
          contentId: item.contentId,
          contentType: item.contentType,
          isFavorite: newState,
          favorites: items
        });
      }

      return newState;
    },

    // ==========================================
    // WATCH HISTORY & CONTINUE WATCHING (Phases O, P)
    // ==========================================

    /**
     * Record a watched item in playback history.
     * @param {Object} item { providerId, contentType, contentId, title, posterUrl, positionSeconds, durationSeconds, streamUrl, seriesId, seasonNumber, episodeNumber }
     */
    recordWatchHistory: function (item) {
      if (!item || !item.contentId) return;
      var Storage = window.FreeIPTV.Storage;
      if (!Storage) return;

      var history = Storage.get(STORAGE_HISTORY_KEY, []) || [];
      var now = Date.now();

      // Deduplicate: remove existing entry for same contentId
      history = history.filter(function (h) {
        return !(h.contentId === item.contentId && h.contentType === item.contentType);
      });

      var record = {
        providerId: item.providerId || this.getActivePlaylistId() || '',
        contentType: item.contentType || 'live',
        contentId: item.contentId,
        title: item.title || item.name || '',
        posterUrl: item.posterUrl || item.logoUrl || item.thumbnailUrl || '',
        streamUrl: item.streamUrl || '',
        lastWatchedAt: now,
        positionSeconds: item.positionSeconds || 0,
        durationSeconds: item.durationSeconds || 0,
        seriesId: item.seriesId || '',
        seasonNumber: item.seasonNumber || 0,
        episodeNumber: item.episodeNumber || 0
      };

      // Prepend to top
      history.unshift(record);

      // Cap at MAX_HISTORY_ITEMS
      if (history.length > MAX_HISTORY_ITEMS) {
        history = history.slice(0, MAX_HISTORY_ITEMS);
      }

      Storage.set(STORAGE_HISTORY_KEY, history);

      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.HISTORY_UPDATED, {
          item: record,
          history: history
        });
      }
    },

    /**
     * Get recent watch history items, optionally filtered by playlist.
     * @param {number} [limit=50]
     * @param {string} [playlistId]
     * @returns {Array<Object>}
     */
    getWatchHistory: function (limit, playlistId) {
      var Storage = window.FreeIPTV.Storage;
      if (!Storage) return [];
      var history = Storage.get(STORAGE_HISTORY_KEY, []) || [];
      if (playlistId) {
        history = history.filter(function (h) {
          return h.providerId === playlistId;
        });
      }
      return limit ? history.slice(0, limit) : history;
    },

    /**
     * Save playback progress for resume.
     * Supports both (contentId, positionSeconds, durationSeconds, contentType, meta)
     * and single object { contentId, contentType, positionSec, durationSec, ... }
     */
    savePlaybackProgress: function (contentIdOrObj, positionSeconds, durationSeconds, contentType, meta) {
      var contentId = contentIdOrObj;
      var pos = positionSeconds;
      var dur = durationSeconds;
      var type = contentType;
      var metadata = meta;

      if (typeof contentIdOrObj === 'object' && contentIdOrObj !== null) {
        contentId = contentIdOrObj.contentId;
        pos = contentIdOrObj.positionSeconds !== undefined ? contentIdOrObj.positionSeconds : (contentIdOrObj.positionSec || 0);
        dur = contentIdOrObj.durationSeconds !== undefined ? contentIdOrObj.durationSeconds : (contentIdOrObj.durationSec || 0);
        type = contentIdOrObj.contentType || 'movie';
        metadata = contentIdOrObj;
      }

      if (!contentId) return;
      var Storage = window.FreeIPTV.Storage;
      if (!Storage) return;

      var progressMap = Storage.get(STORAGE_PROGRESS_KEY, {}) || {};
      progressMap[contentId] = {
        contentId: contentId,
        positionSeconds: Math.round(pos || 0),
        durationSeconds: Math.round(dur || 0),
        contentType: type || 'movie',
        updatedAt: Date.now(),
        meta: metadata || {}
      };

      Storage.set(STORAGE_PROGRESS_KEY, progressMap);

      // Also record in watch history
      if (metadata) {
        this.recordWatchHistory({
          providerId: metadata.providerId,
          contentType: type,
          contentId: contentId,
          title: metadata.title || metadata.name,
          posterUrl: metadata.posterUrl || metadata.poster,
          positionSeconds: Math.round(pos || 0),
          durationSeconds: Math.round(dur || 0),
          streamUrl: metadata.streamUrl,
          seriesId: metadata.seriesId,
          seasonNumber: metadata.seasonNumber,
          episodeNumber: metadata.episodeNumber
        });
      }
    },

    /**
     * Retrieve playback progress for resume.
     * Supports getPlaybackProgress(contentId) or getPlaybackProgress(contentType, contentId).
     */
    getPlaybackProgress: function (contentIdOrType, optContentId) {
      var contentId = optContentId || contentIdOrType;
      if (!contentId) return null;
      var Storage = window.FreeIPTV.Storage;
      if (!Storage) return null;

      var progressMap = Storage.get(STORAGE_PROGRESS_KEY, {}) || {};
      var record = progressMap[contentId];
      if (!record || !record.positionSeconds) return null;

      var percent = 0;
      if (record.durationSeconds > 0) {
        percent = Math.round((record.positionSeconds / record.durationSeconds) * 100);
      }

      return {
        positionSeconds: record.positionSeconds,
        durationSeconds: record.durationSeconds,
        progressPercent: percent
      };
    },

    /**
     * Clear progress after finishing content.
     * @param {string} contentId
     */
    clearPlaybackProgress: function (contentId) {
      if (!contentId) return;
      var Storage = window.FreeIPTV.Storage;
      if (!Storage) return;

      var progressMap = Storage.get(STORAGE_PROGRESS_KEY, {}) || {};
      if (progressMap[contentId]) {
        delete progressMap[contentId];
        Storage.set(STORAGE_PROGRESS_KEY, progressMap);
      }
    },

    /**
     * Get Continue Watching list (movies and episodes with unfinished progress), optionally filtered by playlist.
     * @param {number} [limit=20]
     * @param {string} [playlistId]
     * @returns {Array<Object>}
     */
    getContinueWatching: function (limit, playlistId) {
      var history = this.getWatchHistory(null, playlistId);
      var continueList = [];

      for (var i = 0; i < history.length; i++) {
        var h = history[i];
        // Only movies and series episodes qualify for Continue Watching
        if (h.contentType === 'movie' || h.contentType === 'episode') {
          var pos = h.positionSeconds || 0;
          var dur = h.durationSeconds || 0;
          // Must have watched at least 15s and have at least 30s remaining
          if (pos >= 15 && (dur === 0 || pos < dur - 30)) {
            var remainingMins = dur > pos ? Math.round((dur - pos) / 60) : 0;
            var percent = dur > 0 ? Math.round((pos / dur) * 100) : 0;

            continueList.push({
              providerId: h.providerId,
              contentType: h.contentType,
              contentId: h.contentId,
              title: h.title,
              posterUrl: h.posterUrl,
              streamUrl: h.streamUrl,
              positionSeconds: pos,
              durationSeconds: dur,
              remainingMinutes: remainingMins,
              progressPercent: percent,
              seriesId: h.seriesId,
              seasonNumber: h.seasonNumber,
              episodeNumber: h.episodeNumber
            });
          }
        }
      }

      return limit ? continueList.slice(0, limit) : continueList;
    },

    // ==========================================
    // GLOBAL SEARCH (Phase M)
    // ==========================================

    /**
     * Search and filter channels locally (Live TV).
     * @param {Array} channels
     * @param {string} query
     * @param {string} [categoryFilter]
     * @returns {Array} Filtered channels
     */
    searchChannels: function (channels, query, categoryFilter) {
      if (!channels || !Array.isArray(channels)) {
        return [];
      }

      var q = (query || '').trim().toLowerCase();
      var cat = (categoryFilter || '').trim();

      return channels.filter(function (channel) {
        if (cat && cat.toLowerCase() !== 'all' && channel.groupTitle !== cat) {
          return false;
        }

        if (!q) {
          return true;
        }

        var nameMatch = channel.name && channel.name.toLowerCase().indexOf(q) !== -1;
        var tvgNameMatch = channel.tvgName && channel.tvgName.toLowerCase().indexOf(q) !== -1;
        var groupMatch = channel.groupTitle && channel.groupTitle.toLowerCase().indexOf(q) !== -1;
        var chnoMatch = channel.tvgChno && String(channel.tvgChno).indexOf(q) !== -1;

        return nameMatch || tvgNameMatch || groupMatch || chnoMatch;
      });
    },

    /**
     * Unified Global Search across live channels, movies, and series.
     * @param {string} query
     * @returns {Promise<{ live: Array, movies: Array, series: Array, totalCount: number }>}
     */
    globalSearch: function (query) {
      var q = (query || '').trim().toLowerCase();
      if (!q) {
        return Promise.resolve({ live: [], movies: [], series: [], totalCount: 0 });
      }

      var activeId = this.getActivePlaylistId();
      if (!activeId) {
        return Promise.resolve({ live: [], movies: [], series: [], totalCount: 0 });
      }

      var self = this;
      return Promise.all([
        self.loadChannels(activeId),
        self.loadMovies(activeId),
        self.loadSeries(activeId)
      ]).then(function (results) {
        var channels = results[0] || [];
        var movies = (results[1] && results[1].movies) || [];
        var series = (results[2] && results[2].series) || [];

        var matchedChannels = channels.filter(function (c) {
          return (c.name && c.name.toLowerCase().indexOf(q) !== -1) ||
                 (c.groupTitle && c.groupTitle.toLowerCase().indexOf(q) !== -1);
        }).slice(0, 30);

        var matchedMovies = movies.filter(function (m) {
          return (m.name && m.name.toLowerCase().indexOf(q) !== -1) ||
                 (m.genre && m.genre.toLowerCase().indexOf(q) !== -1) ||
                 (m.cast && m.cast.toLowerCase().indexOf(q) !== -1);
        }).slice(0, 30);

        var matchedSeries = series.filter(function (s) {
          return (s.name && s.name.toLowerCase().indexOf(q) !== -1) ||
                 (s.genre && s.genre.toLowerCase().indexOf(q) !== -1) ||
                 (s.cast && s.cast.toLowerCase().indexOf(q) !== -1);
        }).slice(0, 30);

        return {
          live: matchedChannels,
          movies: matchedMovies,
          series: matchedSeries,
          totalCount: matchedChannels.length + matchedMovies.length + matchedSeries.length
        };
      });
    }
  };

  window.FreeIPTV.PlaylistManager = PlaylistManager;
})(window);
