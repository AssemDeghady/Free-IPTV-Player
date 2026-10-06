/**
 * Free IPTV Player — Channel & Content Store Abstraction
 * High-capacity asynchronous content storage using IndexedDB with fallback to Memory / Storage.
 * Safely handles 10,000+ live channels, VOD movies, series, episodes, and EPG caches.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var DB_NAME = 'FreeIPTV_DB';
  var DB_VERSION = 2;

  var STORES = {
    CHANNELS: 'channels_cache',
    MOVIES: 'movies_cache',
    SERIES: 'series_cache',
    VOD_DETAILS: 'vod_details_cache',
    SERIES_DETAILS: 'series_details_cache',
    EPG: 'epg_cache'
  };

  var dbInstance = null;
  var isIndexedDBSupported = typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
  var memoryFallbackStore = {
    channels: {},
    movies: {},
    series: {},
    vodDetails: {},
    seriesDetails: {},
    epg: {}
  };

  /**
   * Open or initialize the IndexedDB database.
   * @returns {Promise<IDBDatabase>}
   */
  function getDatabase() {
    if (!isIndexedDBSupported) {
      return Promise.reject(new Error('IndexedDB not supported in this environment'));
    }

    if (dbInstance) {
      return Promise.resolve(dbInstance);
    }

    return new Promise(function (resolve, reject) {
      try {
        var request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = function (event) {
          var db = event.target.result;
          if (!db.objectStoreNames.contains(STORES.CHANNELS)) {
            db.createObjectStore(STORES.CHANNELS, { keyPath: 'playlistId' });
          }
          if (!db.objectStoreNames.contains(STORES.MOVIES)) {
            db.createObjectStore(STORES.MOVIES, { keyPath: 'playlistId' });
          }
          if (!db.objectStoreNames.contains(STORES.SERIES)) {
            db.createObjectStore(STORES.SERIES, { keyPath: 'playlistId' });
          }
          if (!db.objectStoreNames.contains(STORES.VOD_DETAILS)) {
            db.createObjectStore(STORES.VOD_DETAILS, { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains(STORES.SERIES_DETAILS)) {
            db.createObjectStore(STORES.SERIES_DETAILS, { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains(STORES.EPG)) {
            db.createObjectStore(STORES.EPG, { keyPath: 'key' });
          }
        };

        request.onsuccess = function (event) {
          dbInstance = event.target.result;
          resolve(dbInstance);
        };

        request.onerror = function (event) {
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.warn('IndexedDB open error, falling back to memory/storage:', event.target.error);
          }
          reject(event.target.error || new Error('Failed to open IndexedDB'));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  var ChannelStore = {
    /**
     * Check if IndexedDB is available.
     * @returns {boolean}
     */
    isIndexedDBAvailable: function () {
      return isIndexedDBSupported;
    },

    // ==========================================
    // 1. LIVE CHANNELS
    // ==========================================

    /**
     * Save channel array for a playlist.
     * @param {string} playlistId
     * @param {Array} channels
     * @param {Array<string>} [categories]
     * @returns {Promise<boolean>}
     */
    saveChannels: function (playlistId, channels, categories) {
      var now = Date.now();
      return getDatabase().then(function (db) {
        return new Promise(function (resolve, reject) {
          try {
            var transaction = db.transaction([STORES.CHANNELS], 'readwrite');
            var store = transaction.objectStore(STORES.CHANNELS);
            var record = {
              playlistId: playlistId,
              channels: channels,
              categories: categories || [],
              cachedAt: now,
              updatedAt: now,
              schemaVersion: 1,
              count: channels.length
            };
            var request = store.put(record);

            request.onsuccess = function () {
              resolve(true);
            };
            request.onerror = function (event) {
              reject(event.target.error);
            };
          } catch (e) {
            reject(e);
          }
        });
      }).catch(function (error) {
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.warn('ChannelStore falling back to secondary storage for playlist ' + playlistId + ':', error);
        }
        memoryFallbackStore.channels[playlistId] = {
          channels: channels,
          categories: categories || [],
          cachedAt: now,
          schemaVersion: 1
        };
        if (window.FreeIPTV.Storage && channels.length <= 1500) {
          window.FreeIPTV.Storage.set('channels_' + playlistId, channels);
          window.FreeIPTV.Storage.set('channels_meta_' + playlistId, { cachedAt: now, schemaVersion: 1 });
        }
        return Promise.resolve(true);
      });
    },

    /**
     * Retrieve channels for a playlist.
     * @param {string} playlistId
     * @returns {Promise<Array>}
     */
    getChannels: function (playlistId) {
      return getDatabase().then(function (db) {
        return new Promise(function (resolve, reject) {
          try {
            var transaction = db.transaction([STORES.CHANNELS], 'readonly');
            var store = transaction.objectStore(STORES.CHANNELS);
            var request = store.get(playlistId);

            request.onsuccess = function (event) {
              var result = event.target.result;
              if (result && result.channels) {
                resolve(result.channels);
              } else {
                resolve([]);
              }
            };
            request.onerror = function (event) {
              reject(event.target.error);
            };
          } catch (e) {
            reject(e);
          }
        });
      }).catch(function () {
        if (memoryFallbackStore.channels[playlistId]) {
          var mem = memoryFallbackStore.channels[playlistId];
          return Promise.resolve(Array.isArray(mem) ? mem : (mem.channels || []));
        }
        if (window.FreeIPTV.Storage) {
          var stored = window.FreeIPTV.Storage.get('channels_' + playlistId, []);
          return Promise.resolve(stored || []);
        }
        return Promise.resolve([]);
      });
    },

    // ==========================================
    // 2. VOD / MOVIES
    // ==========================================

    /**
     * Save movies list for a playlist.
     * @param {string} playlistId
     * @param {Array} movies
     * @param {Array<string>} [categories]
     * @returns {Promise<boolean>}
     */
    saveMovies: function (playlistId, movies, categories) {
      var now = Date.now();
      return getDatabase().then(function (db) {
        return new Promise(function (resolve, reject) {
          try {
            var transaction = db.transaction([STORES.MOVIES], 'readwrite');
            var store = transaction.objectStore(STORES.MOVIES);
            var record = {
              playlistId: playlistId,
              movies: movies,
              categories: categories || [],
              cachedAt: now,
              updatedAt: now,
              schemaVersion: 1,
              count: movies.length
            };
            var request = store.put(record);
            request.onsuccess = function () { resolve(true); };
            request.onerror = function (e) { reject(e.target.error); };
          } catch (err) {
            reject(err);
          }
        });
      }).catch(function (error) {
        memoryFallbackStore.movies[playlistId] = {
          movies: movies,
          categories: categories || [],
          cachedAt: now,
          schemaVersion: 1
        };
        if (window.FreeIPTV.Storage && movies.length <= 1500) {
          window.FreeIPTV.Storage.set('movies_' + playlistId, {
            movies: movies,
            categories: categories || [],
            cachedAt: now,
            schemaVersion: 1
          });
        }
        return Promise.resolve(true);
      });
    },

    /**
     * Retrieve movies list for a playlist.
     * @param {string} playlistId
     * @returns {Promise<{ movies: Array, categories: Array<string> }>}
     */
    getMovies: function (playlistId) {
      return getDatabase().then(function (db) {
        return new Promise(function (resolve, reject) {
          try {
            var transaction = db.transaction([STORES.MOVIES], 'readonly');
            var store = transaction.objectStore(STORES.MOVIES);
            var request = store.get(playlistId);
            request.onsuccess = function (e) {
              var result = e.target.result;
              if (result && result.movies) {
                resolve({ movies: result.movies, categories: result.categories || [] });
              } else {
                resolve({ movies: [], categories: [] });
              }
            };
            request.onerror = function (e) { reject(e.target.error); };
          } catch (err) {
            reject(err);
          }
        });
      }).catch(function () {
        if (memoryFallbackStore.movies[playlistId]) {
          return Promise.resolve(memoryFallbackStore.movies[playlistId]);
        }
        if (window.FreeIPTV.Storage) {
          var stored = window.FreeIPTV.Storage.get('movies_' + playlistId, null);
          if (stored) return Promise.resolve(stored);
        }
        return Promise.resolve({ movies: [], categories: [] });
      });
    },

    /**
     * Save VOD detail cache for a movie.
     * @param {string} playlistId
     * @param {string|number} streamId
     * @param {Object} details
     * @returns {Promise<boolean>}
     */
    saveVodDetails: function (playlistId, streamId, details) {
      var key = playlistId + '_' + streamId;
      return getDatabase().then(function (db) {
        return new Promise(function (resolve, reject) {
          try {
            var transaction = db.transaction([STORES.VOD_DETAILS], 'readwrite');
            var store = transaction.objectStore(STORES.VOD_DETAILS);
            var record = {
              key: key,
              playlistId: playlistId,
              streamId: String(streamId),
              details: details,
              updatedAt: Date.now()
            };
            var request = store.put(record);
            request.onsuccess = function () { resolve(true); };
            request.onerror = function (e) { reject(e.target.error); };
          } catch (err) { reject(err); }
        });
      }).catch(function () {
        memoryFallbackStore.vodDetails[key] = details;
        return Promise.resolve(true);
      });
    },

    /**
     * Retrieve VOD detail cache for a movie.
     * @param {string} playlistId
     * @param {string|number} streamId
     * @returns {Promise<Object|null>}
     */
    getVodDetails: function (playlistId, streamId) {
      var key = playlistId + '_' + streamId;
      return getDatabase().then(function (db) {
        return new Promise(function (resolve, reject) {
          try {
            var transaction = db.transaction([STORES.VOD_DETAILS], 'readonly');
            var store = transaction.objectStore(STORES.VOD_DETAILS);
            var request = store.get(key);
            request.onsuccess = function (e) {
              var result = e.target.result;
              resolve(result ? result.details : null);
            };
            request.onerror = function (e) { reject(e.target.error); };
          } catch (err) { reject(err); }
        });
      }).catch(function () {
        return Promise.resolve(memoryFallbackStore.vodDetails[key] || null);
      });
    },

    // ==========================================
    // 3. SERIES & SEASONS/EPISODES
    // ==========================================

    /**
     * Save series list for a playlist.
     * @param {string} playlistId
     * @param {Array} series
     * @param {Array<string>} [categories]
     * @returns {Promise<boolean>}
     */
    saveSeries: function (playlistId, series, categories) {
      var now = Date.now();
      return getDatabase().then(function (db) {
        return new Promise(function (resolve, reject) {
          try {
            var transaction = db.transaction([STORES.SERIES], 'readwrite');
            var store = transaction.objectStore(STORES.SERIES);
            var record = {
              playlistId: playlistId,
              series: series,
              categories: categories || [],
              cachedAt: now,
              updatedAt: now,
              schemaVersion: 1,
              count: series.length
            };
            var request = store.put(record);
            request.onsuccess = function () { resolve(true); };
            request.onerror = function (e) { reject(e.target.error); };
          } catch (err) { reject(err); }
        });
      }).catch(function () {
        memoryFallbackStore.series[playlistId] = {
          series: series,
          categories: categories || [],
          cachedAt: now,
          schemaVersion: 1
        };
        if (window.FreeIPTV.Storage && series.length <= 1500) {
          window.FreeIPTV.Storage.set('series_' + playlistId, {
            series: series,
            categories: categories || [],
            cachedAt: now,
            schemaVersion: 1
          });
        }
        return Promise.resolve(true);
      });
    },

    /**
     * Retrieve series list for a playlist.
     * @param {string} playlistId
     * @returns {Promise<{ series: Array, categories: Array<string> }>}
     */
    getSeries: function (playlistId) {
      return getDatabase().then(function (db) {
        return new Promise(function (resolve, reject) {
          try {
            var transaction = db.transaction([STORES.SERIES], 'readonly');
            var store = transaction.objectStore(STORES.SERIES);
            var request = store.get(playlistId);
            request.onsuccess = function (e) {
              var result = e.target.result;
              if (result && result.series) {
                resolve({ series: result.series, categories: result.categories || [] });
              } else {
                resolve({ series: [], categories: [] });
              }
            };
            request.onerror = function (e) { reject(e.target.error); };
          } catch (err) { reject(err); }
        });
      }).catch(function () {
        if (memoryFallbackStore.series[playlistId]) {
          return Promise.resolve(memoryFallbackStore.series[playlistId]);
        }
        if (window.FreeIPTV.Storage) {
          var stored = window.FreeIPTV.Storage.get('series_' + playlistId, null);
          if (stored) return Promise.resolve(stored);
        }
        return Promise.resolve({ series: [], categories: [] });
      });
    },

    /**
     * Save series details (seasons & episodes) cache.
     * @param {string} playlistId
     * @param {string|number} seriesId
     * @param {Object} details { seasons, episodesBySeason, allEpisodes }
     * @returns {Promise<boolean>}
     */
    saveSeriesDetails: function (playlistId, seriesId, details) {
      var key = playlistId + '_' + seriesId;
      return getDatabase().then(function (db) {
        return new Promise(function (resolve, reject) {
          try {
            var transaction = db.transaction([STORES.SERIES_DETAILS], 'readwrite');
            var store = transaction.objectStore(STORES.SERIES_DETAILS);
            var record = {
              key: key,
              playlistId: playlistId,
              seriesId: String(seriesId),
              details: details,
              updatedAt: Date.now()
            };
            var request = store.put(record);
            request.onsuccess = function () { resolve(true); };
            request.onerror = function (e) { reject(e.target.error); };
          } catch (err) { reject(err); }
        });
      }).catch(function () {
        memoryFallbackStore.seriesDetails[key] = details;
        return Promise.resolve(true);
      });
    },

    /**
     * Retrieve series details cache.
     * @param {string} playlistId
     * @param {string|number} seriesId
     * @returns {Promise<Object|null>}
     */
    getSeriesDetails: function (playlistId, seriesId) {
      var key = playlistId + '_' + seriesId;
      return getDatabase().then(function (db) {
        return new Promise(function (resolve, reject) {
          try {
            var transaction = db.transaction([STORES.SERIES_DETAILS], 'readonly');
            var store = transaction.objectStore(STORES.SERIES_DETAILS);
            var request = store.get(key);
            request.onsuccess = function (e) {
              var result = e.target.result;
              resolve(result ? result.details : null);
            };
            request.onerror = function (e) { reject(e.target.error); };
          } catch (err) { reject(err); }
        });
      }).catch(function () {
        return Promise.resolve(memoryFallbackStore.seriesDetails[key] || null);
      });
    },

    // ==========================================
    // 4. EPG PROGRAM CACHE
    // ==========================================

    /**
     * Save EPG program listing with TTL.
     * @param {string} playlistId
     * @param {string} channelId
     * @param {string} dateStr
     * @param {Array} programs
     * @param {number} [ttlMs=7200000] Defaults to 2 hours
     * @returns {Promise<boolean>}
     */
    saveEpg: function (playlistId, channelId, dateStr, programs, ttlMs) {
      var key = playlistId + '_' + channelId + '_' + (dateStr || 'today');
      var now = Date.now();
      var ttl = ttlMs || (2 * 60 * 60 * 1000); // 2 hours default
      return getDatabase().then(function (db) {
        return new Promise(function (resolve, reject) {
          try {
            var transaction = db.transaction([STORES.EPG], 'readwrite');
            var store = transaction.objectStore(STORES.EPG);
            var record = {
              key: key,
              playlistId: playlistId,
              channelId: channelId,
              dateStr: dateStr || 'today',
              programs: programs,
              fetchedAt: now,
              expiresAt: now + ttl
            };
            var request = store.put(record);
            request.onsuccess = function () { resolve(true); };
            request.onerror = function (e) { reject(e.target.error); };
          } catch (err) { reject(err); }
        });
      }).catch(function () {
        memoryFallbackStore.epg[key] = { programs: programs, expiresAt: now + ttl };
        return Promise.resolve(true);
      });
    },

    /**
     * Retrieve cached EPG program listing if not expired.
     * @param {string} playlistId
     * @param {string} channelId
     * @param {string} [dateStr]
     * @returns {Promise<Array|null>} Returns null if expired or missing
     */
    getEpg: function (playlistId, channelId, dateStr) {
      var key = playlistId + '_' + channelId + '_' + (dateStr || 'today');
      var now = Date.now();

      return getDatabase().then(function (db) {
        return new Promise(function (resolve, reject) {
          try {
            var transaction = db.transaction([STORES.EPG], 'readonly');
            var store = transaction.objectStore(STORES.EPG);
            var request = store.get(key);
            request.onsuccess = function (e) {
              var result = e.target.result;
              if (result && result.programs && result.expiresAt > now) {
                resolve(result.programs);
              } else {
                resolve(null);
              }
            };
            request.onerror = function (e) { reject(e.target.error); };
          } catch (err) { reject(err); }
        });
      }).catch(function () {
        var cached = memoryFallbackStore.epg[key];
        if (cached && cached.programs && cached.expiresAt > now) {
          return Promise.resolve(cached.programs);
        }
        return Promise.resolve(null);
      });
    },

    /**
     * Clear all EPG cache.
     * @returns {Promise<boolean>}
     */
    clearEpgCache: function () {
      memoryFallbackStore.epg = {};
      return getDatabase().then(function (db) {
        return new Promise(function (resolve, reject) {
          try {
            var transaction = db.transaction([STORES.EPG], 'readwrite');
            var store = transaction.objectStore(STORES.EPG);
            var request = store.clear();
            request.onsuccess = function () { resolve(true); };
            request.onerror = function (e) { reject(e.target.error); };
          } catch (err) { reject(err); }
        });
      }).catch(function () { return Promise.resolve(true); });
    },

    // ==========================================
    // 5. TEARDOWN / DELETION
    // ==========================================

    /**
     * Delete all content associated with a playlist (channels, movies, series, details, epg).
     * @param {string} playlistId
     * @returns {Promise<boolean>}
     */
    deletePlaylistContent: function (playlistId) {
      delete memoryFallbackStore.channels[playlistId];
      delete memoryFallbackStore.movies[playlistId];
      delete memoryFallbackStore.series[playlistId];

      if (window.FreeIPTV.Storage) {
        window.FreeIPTV.Storage.remove('channels_' + playlistId);
        window.FreeIPTV.Storage.remove('movies_' + playlistId);
        window.FreeIPTV.Storage.remove('series_' + playlistId);
      }

      return getDatabase().then(function (db) {
        return new Promise(function (resolve) {
          try {
            var storesToClean = [STORES.CHANNELS, STORES.MOVIES, STORES.SERIES];
            var transaction = db.transaction(storesToClean, 'readwrite');

            for (var i = 0; i < storesToClean.length; i++) {
              try {
                transaction.objectStore(storesToClean[i]).delete(playlistId);
              } catch (e) {}
            }

            transaction.oncomplete = function () { resolve(true); };
            transaction.onerror = function () { resolve(true); };
          } catch (err) {
            resolve(true);
          }
        });
      }).catch(function () {
        return Promise.resolve(true);
      });
    },

    /**
     * Retrieve cache metadata (cachedAt, schemaVersion, count) for a playlist and store.
     * @param {string} playlistId
     * @param {'channels'|'movies'|'series'} type
     * @returns {Promise<{ cachedAt: number, schemaVersion: number, count: number }|null>}
     */
    getCacheMeta: function (playlistId, type) {
      var storeName = type === 'movies' ? STORES.MOVIES : (type === 'series' ? STORES.SERIES : STORES.CHANNELS);
      return getDatabase().then(function (db) {
        return new Promise(function (resolve) {
          try {
            var transaction = db.transaction([storeName], 'readonly');
            var store = transaction.objectStore(storeName);
            var request = store.get(playlistId);
            request.onsuccess = function (e) {
              var res = e.target.result;
              if (res && res.cachedAt) {
                resolve({
                  cachedAt: res.cachedAt,
                  schemaVersion: res.schemaVersion || 1,
                  count: res.count || 0
                });
              } else {
                resolve(null);
              }
            };
            request.onerror = function () { resolve(null); };
          } catch (err) {
            resolve(null);
          }
        });
      }).catch(function () {
        var fallbackKey = type === 'movies' ? 'movies' : (type === 'series' ? 'series' : 'channels');
        var mem = memoryFallbackStore[fallbackKey] && memoryFallbackStore[fallbackKey][playlistId];
        if (mem && mem.cachedAt) {
          return Promise.resolve({
            cachedAt: mem.cachedAt,
            schemaVersion: mem.schemaVersion || 1,
            count: mem.count || (mem.channels ? mem.channels.length : 0)
          });
        }
        return Promise.resolve(null);
      });
    },

    /**
     * Legacy alias for deletePlaylistContent.
     * @param {string} playlistId
     * @returns {Promise<boolean>}
     */
    deleteChannels: function (playlistId) {
      return this.deletePlaylistContent(playlistId);
    },

    /**
     * Clear all cached data across all stores.
     * @returns {Promise<boolean>}
     */
    clearAll: function () {
      memoryFallbackStore = {
        channels: {},
        movies: {},
        series: {},
        vodDetails: {},
        seriesDetails: {},
        epg: {}
      };

      return getDatabase().then(function (db) {
        return new Promise(function (resolve) {
          try {
            var allStoreNames = [
              STORES.CHANNELS, STORES.MOVIES, STORES.SERIES,
              STORES.VOD_DETAILS, STORES.SERIES_DETAILS, STORES.EPG
            ];
            var transaction = db.transaction(allStoreNames, 'readwrite');
            for (var i = 0; i < allStoreNames.length; i++) {
              try {
                transaction.objectStore(allStoreNames[i]).clear();
              } catch (e) {}
            }
            transaction.oncomplete = function () { resolve(true); };
            transaction.onerror = function () { resolve(true); };
          } catch (err) {
            resolve(true);
          }
        });
      }).catch(function () {
        return Promise.resolve(true);
      });
    }
  };

  window.FreeIPTV.ChannelStore = ChannelStore;
})(window);
