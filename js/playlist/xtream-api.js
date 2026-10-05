/**
 * Free IPTV Player — Xtream Codes IPTV Provider API Client
 * High-performance, fault-tolerant client for Xtream Codes-compatible IPTV providers.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  /**
   * Normalize server / host URL.
   * Ensures safe protocol (http/https only), removes trailing slashes, and validates hostname.
   * @param {string} url
   * @returns {string}
   */
  function normalizeServerUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('Server URL is required.');
    }
    var trimmed = url.trim();
    if (trimmed.length === 0) {
      throw new Error('Server URL cannot be empty.');
    }

    // Strictly enforce http:// or https://
    if (trimmed.indexOf('http://') !== 0 && trimmed.indexOf('https://') !== 0) {
      throw new Error('Server URL must start with http:// or https://');
    }

    var proto = trimmed.indexOf('https://') === 0 ? 'https://' : 'http://';
    var afterProto = trimmed.substring(proto.length).replace(/\/+$/, '').trim();

    if (!afterProto || afterProto.length === 0) {
      throw new Error('Server URL is missing host name or IP address.');
    }

    return proto + afterProto;
  }

  /**
   * Validate Xtream credentials.
   * @param {string} server
   * @param {string} username
   * @param {string} password
   * @returns {{ isValid: boolean, server?: string, username?: string, password?: string, error?: string }}
   */
  function validateCredentials(server, username, password) {
    var normServer = '';
    try {
      normServer = normalizeServerUrl(server);
    } catch (e) {
      return { isValid: false, error: e.message };
    }

    var u = (username || '').trim();
    if (!u) {
      return { isValid: false, error: 'Username is required.' };
    }

    var p = (password || '').trim();
    if (!p) {
      return { isValid: false, error: 'Password is required.' };
    }

    return {
      isValid: true,
      server: normServer,
      username: u,
      password: p
    };
  }

  /**
   * Construct Xtream API endpoint URL.
   * @param {string} server
   * @param {string} username
   * @param {string} password
   * @param {string} [action]
   * @param {Object} [extraParams]
   * @returns {string}
   */
  function buildApiUrl(server, username, password, action, extraParams) {
    var base = normalizeServerUrl(server) +
      '/player_api.php?username=' + encodeURIComponent(username) +
      '&password=' + encodeURIComponent(password);

    if (action) {
      base += '&action=' + encodeURIComponent(action);
    }

    if (extraParams && typeof extraParams === 'object') {
      for (var k in extraParams) {
        if (extraParams.hasOwnProperty(k) && extraParams[k] !== undefined && extraParams[k] !== null) {
          base += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(extraParams[k]);
        }
      }
    }

    return base;
  }

  /**
   * Generate playable stream URL for a live channel.
   * @param {string} server
   * @param {string} username
   * @param {string} password
   * @param {Object} stream
   * @returns {string}
   */
  function generateStreamUrl(server, username, password, stream) {
    if (!stream) return '';

    // Prefer provider-provided direct source when valid
    if (stream.direct_source && typeof stream.direct_source === 'string') {
      var ds = stream.direct_source.trim();
      if (ds.indexOf('http://') === 0 || ds.indexOf('https://') === 0) {
        return ds;
      }
    }

    var normServer = normalizeServerUrl(server);
    var streamId = stream.stream_id !== undefined ? stream.stream_id : (stream.id !== undefined ? stream.id : '');
    var ext = (stream.container_extension ? String(stream.container_extension).replace(/^\./, '').trim() : '') || 'ts';

    return normServer + '/live/' + encodeURIComponent(username) + '/' + encodeURIComponent(password) + '/' + streamId + '.' + ext;
  }

  /**
   * Generate playable stream URL for a VOD movie.
   * @param {string} server
   * @param {string} username
   * @param {string} password
   * @param {Object|string|number} stream
   * @param {string} [optExt]
   * @returns {string}
   */
  function generateMovieStreamUrl(server, username, password, stream, optExt) {
    if (!stream) return '';

    if (typeof stream === 'object' && stream.direct_source && typeof stream.direct_source === 'string') {
      var ds = stream.direct_source.trim();
      if (ds.indexOf('http://') === 0 || ds.indexOf('https://') === 0) {
        return ds;
      }
    }

    var normServer = normalizeServerUrl(server);
    var streamId = typeof stream === 'object' ?
      (stream.stream_id !== undefined ? stream.stream_id : (stream.id !== undefined ? stream.id : '')) :
      String(stream).trim();
    var ext = typeof stream === 'object' ?
      ((stream.container_extension ? String(stream.container_extension).replace(/^\./, '').trim() : '') || optExt || 'mp4') :
      (optExt ? String(optExt).replace(/^\./, '').trim() : 'mp4');

    return normServer + '/movie/' + encodeURIComponent(username) + '/' + encodeURIComponent(password) + '/' + streamId + '.' + ext;
  }

  /**
   * Generate playable stream URL for a series episode.
   * @param {string} server
   * @param {string} username
   * @param {string} password
   * @param {Object|string|number} episode
   * @param {string} [optExt]
   * @returns {string}
   */
  function generateEpisodeStreamUrl(server, username, password, episode, optExt) {
    if (!episode) return '';

    if (typeof episode === 'object' && episode.direct_source && typeof episode.direct_source === 'string') {
      var ds = episode.direct_source.trim();
      if (ds.indexOf('http://') === 0 || ds.indexOf('https://') === 0) {
        return ds;
      }
    }

    var normServer = normalizeServerUrl(server);
    var epId = typeof episode === 'object' ?
      (episode.id !== undefined ? episode.id : (episode.stream_id !== undefined ? episode.stream_id : '')) :
      String(episode).trim();
    var ext = typeof episode === 'object' ?
      ((episode.container_extension ? String(episode.container_extension).replace(/^\./, '').trim() : '') || optExt || 'mp4') :
      (optExt ? String(optExt).replace(/^\./, '').trim() : 'mp4');

    return normServer + '/series/' + encodeURIComponent(username) + '/' + encodeURIComponent(password) + '/' + epId + '.' + ext;
  }

  /**
   * Safe Base64 decoder supporting browser atob and Node.js Buffer.
   * Accurately distinguishes between base64 encoded strings and plain text.
   * @param {string} str
   * @returns {string}
   */
  function safeDecodeBase64(str) {
    if (!str || typeof str !== 'string') return '';
    var trimmed = str.trim();
    if (!trimmed) return '';

    // If it contains spaces or characters outside base64 alphabet, it's plain text
    var base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
    if (trimmed.length % 4 !== 0 || !base64Regex.test(trimmed)) {
      return trimmed;
    }

    try {
      var decoded = '';
      if (typeof window !== 'undefined' && typeof window.atob === 'function') {
        decoded = window.atob(trimmed);
        try {
          decoded = decodeURIComponent(escape(decoded));
        } catch (e) {
          // Keep raw decoded
        }
      } else if (typeof Buffer !== 'undefined') {
        decoded = Buffer.from(trimmed, 'base64').toString('utf8');
      }

      // Check that decoded text contains reasonable printable text (not binary garbage)
      if (decoded && !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(decoded)) {
        return decoded;
      }
    } catch (err) {
      // Fallback
    }
    return trimmed;
  }

  /**
   * Parse JSON response safely with context-sensitive error messaging.
   * @param {string|Object} data
   * @param {string} contextName
   * @returns {any}
   */
  function parseJsonSafely(data, contextName) {
    if (typeof data === 'object' && data !== null) {
      return data;
    }
    if (!data || typeof data !== 'string') {
      throw new Error((contextName || 'Provider') + ' returned empty or invalid response.');
    }
    try {
      return JSON.parse(data);
    } catch (e) {
      throw new Error((contextName || 'Provider') + ' returned malformed JSON response.');
    }
  }

  var XtreamApi = {
    normalizeServerUrl: normalizeServerUrl,
    validateCredentials: validateCredentials,
    buildApiUrl: buildApiUrl,
    generateStreamUrl: generateStreamUrl,
    generateMovieStreamUrl: generateMovieStreamUrl,
    generateEpisodeStreamUrl: generateEpisodeStreamUrl,
    safeDecodeBase64: safeDecodeBase64,
    parseJsonSafely: parseJsonSafely,

    /**
     * Authenticate with Xtream server.
     * @param {string} server
     * @param {string} username
     * @param {string} password
     * @returns {Promise<{ success: boolean, userInfo: Object, serverInfo: Object }>}
     */
    authenticate: function (server, username, password) {
      var validation = validateCredentials(server, username, password);
      if (!validation.isValid) {
        return Promise.reject(new Error(validation.error));
      }

      var url = buildApiUrl(validation.server, validation.username, validation.password);

      return window.FreeIPTV.Http.get(url).then(function (response) {
        var json = parseJsonSafely(response.data, 'Authentication');

        // Check user_info
        if (json.user_info) {
          var uInfo = json.user_info;
          // Check auth flag
          if (uInfo.auth === 0 || uInfo.auth === '0' || uInfo.auth === false) {
            var msg = uInfo.message || 'Authentication failed. Please check your username and password.';
            var authErr = new Error(msg);
            authErr.code = 'AUTH_FAILURE';
            throw authErr;
          }
          // Check account status
          if (uInfo.status) {
            var statusStr = String(uInfo.status).toLowerCase();
            if (statusStr === 'expired') {
              throw new Error('Account has expired. Please contact your IPTV provider.');
            }
            if (statusStr === 'disabled' || statusStr === 'banned') {
              throw new Error('Account is disabled or banned. Please contact your IPTV provider.');
            }
          }
          return {
            success: true,
            userInfo: uInfo,
            serverInfo: json.server_info || {}
          };
        }

        // Some servers return top-level error
        if (json.status === 'error' || json.error) {
          throw new Error(json.error || json.message || 'Authentication failed.');
        }

        // Handle empty object response
        if (!json || Object.keys(json).length === 0) {
          throw new Error('Provider returned an empty response. Check credentials and server URL.');
        }

        return {
          success: true,
          userInfo: json,
          serverInfo: json.server_info || {}
        };
      });
    },

    /**
     * Fetch live categories from Xtream server.
     * @param {string} server
     * @param {string} username
     * @param {string} password
     * @returns {Promise<Array<{ id: string, name: string, parentId: number }>>}
     */
    getCategories: function (server, username, password) {
      var validation = validateCredentials(server, username, password);
      if (!validation.isValid) {
        return Promise.reject(new Error(validation.error));
      }

      var url = buildApiUrl(validation.server, validation.username, validation.password, 'get_live_categories');

      return window.FreeIPTV.Http.get(url).then(function (response) {
        var data = parseJsonSafely(response.data, 'Live Categories');
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          if (data.user_info && (data.user_info.auth === 0 || data.user_info.auth === '0' || data.user_info.auth === false)) {
            var authErr = new Error(data.user_info.message || 'Authentication failed.');
            authErr.code = 'AUTH_FAILURE';
            throw authErr;
          }
          if (Array.isArray(data.categories)) {
            data = data.categories;
          } else {
            data = Object.values(data);
          }
        }
        if (!Array.isArray(data)) {
          return [];
        }

        var normalized = [];
        var seenIds = {};
        for (var i = 0; i < data.length; i++) {
          var item = data[i];
          if (!item || typeof item !== 'object') continue;
          var catId = item.category_id !== undefined ? String(item.category_id).trim() : (item.id !== undefined ? String(item.id).trim() : 'cat_' + (i + 1));
          var catName = item.category_name !== undefined ? String(item.category_name).trim() : (item.name !== undefined ? String(item.name).trim() : '');
          if (!catName) {
            catName = 'Other';
          }
          if (!seenIds[catId]) {
            seenIds[catId] = true;
            normalized.push({
              id: catId,
              name: catName,
              parentId: item.parent_id || 0
            });
          }
        }
        return normalized;
      });
    },

    /**
     * Fetch live streams from Xtream server.
     * @param {string} server
     * @param {string} username
     * @param {string} password
     * @param {string} [categoryId]
     * @returns {Promise<Array<Object>>}
     */
    getStreams: function (server, username, password, categoryId) {
      var validation = validateCredentials(server, username, password);
      if (!validation.isValid) {
        return Promise.reject(new Error(validation.error));
      }

      var params = categoryId ? { category_id: categoryId } : null;
      var url = buildApiUrl(validation.server, validation.username, validation.password, 'get_live_streams', params);

      return window.FreeIPTV.Http.get(url).then(function (response) {
        var data = parseJsonSafely(response.data, 'Live Streams');
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          // Check for auth rejection in response
          if (data.user_info && (data.user_info.auth === 0 || data.user_info.auth === '0' || data.user_info.auth === false)) {
            var authMsg = data.user_info.message || 'Authentication failed. Please check your username and password.';
            var authErr = new Error(authMsg);
            authErr.code = 'AUTH_FAILURE';
            throw authErr;
          }
          if (data.status === 'error' || (data.error && typeof data.error === 'string')) {
            var sErr = new Error(data.error || data.message || 'Provider server error.');
            sErr.code = 'CONNECTION_FAILURE';
            throw sErr;
          }
          if (Array.isArray(data.streams)) {
            data = data.streams;
          } else if (Array.isArray(data.channels)) {
            data = data.channels;
          } else {
            // Associative object { "0": {...}, "1": {...} }
            data = Object.values(data);
          }
        }
        return Array.isArray(data) ? data : [];
      });
    },

    /**
     * Normalize raw stream records into the existing application channel model.
     * @param {Array|Object} rawStreams
     * @param {Array|Object} categories
     * @param {string} server
     * @param {string} username
     * @param {string} password
     * @param {string} playlistId
     * @returns {{ channels: Array, categories: Array<string>, categoryObjects: Array, stats: Object }}
     */
    normalizeStreams: function (rawStreams, categories, server, username, password, playlistId) {
      var pId = playlistId || 'pl_' + Date.now();
      var normServer = normalizeServerUrl(server);

      // Handle associative object for rawStreams
      if (!Array.isArray(rawStreams) && rawStreams && typeof rawStreams === 'object') {
        rawStreams = Object.values(rawStreams);
      }

      // Handle associative object or array for categories
      var catList = categories;
      if (!Array.isArray(catList) && catList && typeof catList === 'object') {
        catList = Object.values(catList);
      }

      // Build category ID -> Name map
      var categoryMap = {};
      if (Array.isArray(catList)) {
        for (var c = 0; c < catList.length; c++) {
          var cat = catList[c];
          if (cat && typeof cat === 'object') {
            var cId = cat.id !== undefined ? String(cat.id).trim() : (cat.category_id !== undefined ? String(cat.category_id).trim() : '');
            var cName = cat.name !== undefined ? String(cat.name).trim() : (cat.category_name !== undefined ? String(cat.category_name).trim() : '');
            if (cId && cName) {
              categoryMap[cId] = cName;
            }
          }
        }
      }

      var channels = [];
      var seenStreamIds = {};
      var categoriesSet = {};
      var totalStreams = Array.isArray(rawStreams) ? rawStreams.length : 0;

      if (Array.isArray(rawStreams)) {
        for (var i = 0; i < rawStreams.length; i++) {
          var s = rawStreams[i];
          if (!s || typeof s !== 'object') continue;

          var streamId = s.stream_id !== undefined ? String(s.stream_id).trim() : (s.id !== undefined ? String(s.id).trim() : '');
          if (!streamId && s.direct_source) {
            streamId = 'direct_' + (i + 1);
          }
          if (!streamId) {
            // Missing stream id and direct source, cannot construct playable URL
            continue;
          }

          // Deduplicate stream IDs
          if (seenStreamIds[streamId]) {
            continue;
          }
          seenStreamIds[streamId] = true;

          var channelName = (s.name && String(s.name).trim()) || (s.title && String(s.title).trim()) || ('Channel ' + streamId);
          var catId = s.category_id !== undefined ? String(s.category_id).trim() : '';
          var groupTitle = categoryMap[catId] || s.category_name || 'Other';
          if (!groupTitle || groupTitle.trim().length === 0) {
            groupTitle = 'Other';
          }

          var logoUrl = s.stream_icon ? String(s.stream_icon).trim() : (s.thumbnail ? String(s.thumbnail).trim() : '');
          var streamUrl = generateStreamUrl(normServer, username, password, s);

          var channel = {
            id: 'xtream_' + pId + '_' + streamId,
            name: channelName,
            streamUrl: streamUrl,
            logoUrl: logoUrl,
            groupTitle: groupTitle,
            tvgId: s.epg_channel_id ? String(s.epg_channel_id).trim() : (s.custom_sid ? String(s.custom_sid).trim() : ''),
            tvgName: channelName,
            tvgLogo: logoUrl,
            tvgCountry: '',
            tvgLanguage: '',
            tvgChno: s.num !== undefined ? String(s.num) : String(channels.length + 1),
            isFavorite: false,
            playlistId: pId,
            providerId: pId,
            providerType: 'xtream',
            categoryId: catId,
            categoryName: groupTitle,
            metadata: {
              streamId: streamId,
              streamType: s.stream_type || 'live',
              directSource: s.direct_source || '',
              tvArchive: s.tv_archive || 0,
              tvArchiveDuration: s.tv_archive_duration || 0,
              containerExtension: s.container_extension || 'ts'
            }
          };

          channels.push(channel);
          categoriesSet[groupTitle] = (categoriesSet[groupTitle] || 0) + 1;
        }
      }

      var orderedCategories = [];
      var seenCats = {};
      if (Array.isArray(categories)) {
        for (var c = 0; c < categories.length; c++) {
          var cName = categories[c] ? (categories[c].name || categories[c].category_name) : null;
          if (cName && categoriesSet[cName] && !seenCats[cName]) {
            seenCats[cName] = true;
            orderedCategories.push(cName);
          }
        }
      }
      for (var catName in categoriesSet) {
        if (!seenCats[catName]) {
          seenCats[catName] = true;
          orderedCategories.push(catName);
        }
      }

      return {
        channels: channels,
        categories: orderedCategories,
        categoryObjects: Array.isArray(categories) ? categories : [],
        stats: {
          totalEntries: totalStreams,
          validEntries: channels.length,
          skippedEntries: totalStreams - channels.length,
          categoriesCount: orderedCategories.length
        }
      };
    },

    /**
     * Authenticate, fetch categories, and fetch live streams in a unified workflow.
     * @param {string} server
     * @param {string} username
     * @param {string} password
     * @param {string} [playlistId]
     * @returns {Promise<{ channels: Array, categories: Array<string>, categoryObjects: Array, stats: Object, userInfo: Object, serverInfo: Object }>}
     */
    fetchAll: function (server, username, password, playlistId) {
      var self = this;
      var pId = playlistId || 'pl_' + Date.now();

      var validation = validateCredentials(server, username, password);
      if (!validation.isValid) {
        return Promise.reject(new Error(validation.error));
      }

      var normServer = validation.server;
      var cleanUser = validation.username;
      var cleanPass = validation.password;

      return self.authenticate(normServer, cleanUser, cleanPass)
        .then(function (authResult) {
          return Promise.all([
            self.getCategories(normServer, cleanUser, cleanPass).catch(function () { return []; }),
            self.getStreams(normServer, cleanUser, cleanPass)
          ]).then(function (results) {
            var categories = results[0] || [];
            var rawStreams = results[1] || [];
            if (!rawStreams || rawStreams.length === 0) {
              var noChErr = new Error('No live channels found for this account.');
              noChErr.code = 'NO_CHANNELS';
              throw noChErr;
            }

            var normalized = self.normalizeStreams(rawStreams, categories, normServer, cleanUser, cleanPass, pId);
            if (!normalized.channels || normalized.channels.length === 0) {
              var normErr = new Error('Provider returned data, but no playable channels could be loaded.');
              normErr.code = 'NORMALIZATION_FAILURE';
              throw normErr;
            }
            return {
              channels: normalized.channels,
              categories: normalized.categories,
              categoryObjects: normalized.categoryObjects,
              stats: normalized.stats,
              userInfo: authResult.userInfo,
              serverInfo: authResult.serverInfo
            };
          });
        });
    },

    /**
     * Fetch VOD categories from Xtream server.
     * @param {string} server
     * @param {string} username
     * @param {string} password
     * @returns {Promise<Array<{ id: string, name: string, parentId: number }>>}
     */
    getVodCategories: function (server, username, password) {
      var validation = validateCredentials(server, username, password);
      if (!validation.isValid) {
        return Promise.reject(new Error(validation.error));
      }

      var url = buildApiUrl(validation.server, validation.username, validation.password, 'get_vod_categories');

      return window.FreeIPTV.Http.get(url).then(function (response) {
        var data = parseJsonSafely(response.data, 'VOD Categories');
        if (!Array.isArray(data)) {
          if (data && typeof data === 'object') {
            data = Object.values(data);
          } else {
            return [];
          }
        }

        var normalized = [];
        var seenIds = {};
        for (var i = 0; i < data.length; i++) {
          var item = data[i];
          if (!item || typeof item !== 'object') continue;
          var catId = item.category_id !== undefined ? String(item.category_id).trim() : 'vod_cat_' + (i + 1);
          var catName = item.category_name !== undefined ? String(item.category_name).trim() : '';
          if (!catName) catName = 'Other';
          if (!seenIds[catId]) {
            seenIds[catId] = true;
            normalized.push({
              id: catId,
              name: catName,
              parentId: item.parent_id || 0
            });
          }
        }
        return normalized;
      });
    },

    /**
     * Fetch VOD streams / movies from Xtream server.
     * @param {string} server
     * @param {string} username
     * @param {string} password
     * @param {string} [categoryId]
     * @returns {Promise<Array<Object>>}
     */
    getVodStreams: function (server, username, password, categoryId) {
      var validation = validateCredentials(server, username, password);
      if (!validation.isValid) {
        return Promise.reject(new Error(validation.error));
      }

      var params = categoryId ? { category_id: categoryId } : null;
      var url = buildApiUrl(validation.server, validation.username, validation.password, 'get_vod_streams', params);

      return window.FreeIPTV.Http.get(url).then(function (response) {
        var data = parseJsonSafely(response.data, 'VOD Streams');
        if (!Array.isArray(data)) {
          if (data && typeof data === 'object') {
            data = Object.values(data);
          } else {
            return [];
          }
        }
        return data;
      });
    },

    /**
     * Fetch detailed metadata for a specific VOD movie.
     * @param {string} server
     * @param {string} username
     * @param {string} password
     * @param {string|number} vodId
     * @returns {Promise<Object>}
     */
    getVodInfo: function (server, username, password, vodId) {
      var validation = validateCredentials(server, username, password);
      if (!validation.isValid) {
        return Promise.reject(new Error(validation.error));
      }

      var params = { vod_id: String(vodId) };
      var url = buildApiUrl(validation.server, validation.username, validation.password, 'get_vod_info', params);

      return window.FreeIPTV.Http.get(url).then(function (response) {
        return parseJsonSafely(response.data, 'VOD Info');
      });
    },

    /**
     * Normalize raw VOD stream records into the application Movie model.
     * @param {Array} rawVod
     * @param {Array} categories
     * @param {string} server
     * @param {string} username
     * @param {string} password
     * @param {string} playlistId
     * @returns {{ movies: Array, categories: Array<string>, stats: Object }}
     */
    normalizeVodStreams: function (rawVod, categories, server, username, password, playlistId) {
      var pId = playlistId || 'pl_' + Date.now();
      var normServer = normalizeServerUrl(server);

      if (!Array.isArray(rawVod) && rawVod && typeof rawVod === 'object') {
        rawVod = Object.values(rawVod);
      }
      if (!Array.isArray(categories) && categories && typeof categories === 'object') {
        categories = Object.values(categories);
      }

      var categoryMap = {};
      if (Array.isArray(categories)) {
        for (var c = 0; c < categories.length; c++) {
          if (categories[c] && categories[c].id) {
            categoryMap[String(categories[c].id)] = categories[c].name;
          }
        }
      }

      var movies = [];
      var seenIds = {};
      var categoriesSet = {};
      var total = Array.isArray(rawVod) ? rawVod.length : 0;

      if (Array.isArray(rawVod)) {
        for (var i = 0; i < rawVod.length; i++) {
          var item = rawVod[i];
          if (!item || typeof item !== 'object') continue;

          var streamId = item.stream_id !== undefined ? String(item.stream_id).trim() :
            (item.id !== undefined ? String(item.id).trim() :
            (item.vod_id !== undefined ? String(item.vod_id).trim() : ''));
          if (!streamId || seenIds[streamId]) continue;
          seenIds[streamId] = true;

          var name = item.name ? String(item.name).trim() : (item.title ? String(item.title).trim() : 'Movie ' + streamId);
          var catId = item.category_id !== undefined ? String(item.category_id).trim() : '';
          var groupTitle = categoryMap[catId] || item.category_name || 'Other';
          if (!groupTitle || groupTitle.trim().length === 0) groupTitle = 'Other';

          var posterUrl = item.stream_icon ? String(item.stream_icon).trim() : (item.cover ? String(item.cover).trim() : '');
          var backdropUrl = '';
          if (Array.isArray(item.backdrop_path) && item.backdrop_path[0]) {
            backdropUrl = String(item.backdrop_path[0]).trim();
          } else if (typeof item.backdrop_path === 'string' && item.backdrop_path) {
            backdropUrl = item.backdrop_path.trim();
          }

          var ext = (item.container_extension ? String(item.container_extension).replace(/^\./, '').trim() : '') || 'mp4';
          var streamUrl = generateMovieStreamUrl(normServer, username, password, item, ext);

          var movie = {
            id: 'movie_' + pId + '_' + streamId,
            providerId: pId,
            name: name,
            streamUrl: streamUrl,
            posterUrl: posterUrl,
            backdropUrl: backdropUrl,
            categoryId: catId,
            categoryName: groupTitle,
            description: item.plot || item.description || item.plot_raw || '',
            rating: item.rating ? String(item.rating) : (item.rating_5based ? String(item.rating_5based) : ''),
            releaseDate: item.releaseDate || item.releasedate || item.year || '',
            duration: item.duration || (item.episode_run_time ? item.episode_run_time + ' min' : ''),
            genre: item.genre || '',
            director: item.director || '',
            cast: item.cast || item.actors || '',
            containerExtension: ext,
            isFavorite: false,
            progress: 0,
            durationSeconds: item.duration_secs || 0,
            added: item.added || item.created_at || '',
            metadata: {
              streamId: streamId,
              added: item.added || item.created_at || '',
              rating5Based: item.rating_5based || null
            }
          };

          movies.push(movie);
          categoriesSet[groupTitle] = (categoriesSet[groupTitle] || 0) + 1;
        }
      }

      var orderedCategories = [];
      var seenCats = {};
      if (Array.isArray(categories)) {
        for (var c = 0; c < categories.length; c++) {
          var cName = categories[c] ? (categories[c].name || categories[c].category_name) : null;
          if (cName && categoriesSet[cName] && !seenCats[cName]) {
            seenCats[cName] = true;
            orderedCategories.push(cName);
          }
        }
      }
      for (var catName in categoriesSet) {
        if (!seenCats[catName]) {
          seenCats[catName] = true;
          orderedCategories.push(catName);
        }
      }

      return {
        movies: movies,
        categories: orderedCategories,
        stats: {
          totalEntries: total,
          validEntries: movies.length,
          skippedEntries: total - movies.length,
          categoriesCount: orderedCategories.length
        }
      };
    },

    /**
     * Fetch VOD categories and streams in a unified workflow.
     * @param {string} server
     * @param {string} username
     * @param {string} password
     * @param {string} [playlistId]
     * @returns {Promise<{ movies: Array, categories: Array<string>, stats: Object }>}
     */
    fetchAllVod: function (server, username, password, playlistId) {
      var self = this;
      var pId = playlistId || 'pl_' + Date.now();

      return Promise.all([
        self.getVodCategories(server, username, password).catch(function () { return []; }),
        self.getVodStreams(server, username, password)
      ]).then(function (results) {
        var categories = results[0] || [];
        var rawStreams = results[1] || [];
        return self.normalizeVodStreams(rawStreams, categories, server, username, password, pId);
      });
    },

    /**
     * Fetch Series categories from Xtream server.
     * @param {string} server
     * @param {string} username
     * @param {string} password
     * @returns {Promise<Array<{ id: string, name: string, parentId: number }>>}
     */
    getSeriesCategories: function (server, username, password) {
      var validation = validateCredentials(server, username, password);
      if (!validation.isValid) {
        return Promise.reject(new Error(validation.error));
      }

      var url = buildApiUrl(validation.server, validation.username, validation.password, 'get_series_categories');

      return window.FreeIPTV.Http.get(url).then(function (response) {
        var data = parseJsonSafely(response.data, 'Series Categories');
        if (!Array.isArray(data)) {
          if (data && typeof data === 'object') {
            data = Object.values(data);
          } else {
            return [];
          }
        }

        var normalized = [];
        var seenIds = {};
        for (var i = 0; i < data.length; i++) {
          var item = data[i];
          if (!item || typeof item !== 'object') continue;
          var catId = item.category_id !== undefined ? String(item.category_id).trim() : 'series_cat_' + (i + 1);
          var catName = item.category_name !== undefined ? String(item.category_name).trim() : '';
          if (!catName) catName = 'Other';
          if (!seenIds[catId]) {
            seenIds[catId] = true;
            normalized.push({
              id: catId,
              name: catName,
              parentId: item.parent_id || 0
            });
          }
        }
        return normalized;
      });
    },

    /**
     * Fetch Series list from Xtream server.
     * @param {string} server
     * @param {string} username
     * @param {string} password
     * @param {string} [categoryId]
     * @returns {Promise<Array<Object>>}
     */
    getSeries: function (server, username, password, categoryId) {
      var validation = validateCredentials(server, username, password);
      if (!validation.isValid) {
        return Promise.reject(new Error(validation.error));
      }

      var params = categoryId ? { category_id: categoryId } : null;
      var url = buildApiUrl(validation.server, validation.username, validation.password, 'get_series', params);

      return window.FreeIPTV.Http.get(url).then(function (response) {
        var data = parseJsonSafely(response.data, 'Series List');
        if (!Array.isArray(data)) {
          if (data && typeof data === 'object') {
            data = Object.values(data);
          } else {
            return [];
          }
        }
        return data;
      });
    },

    /**
     * Fetch detailed seasons and episodes for a specific series.
     * @param {string} server
     * @param {string} username
     * @param {string} password
     * @param {string|number} seriesId
     * @returns {Promise<Object>}
     */
    getSeriesInfo: function (server, username, password, seriesId) {
      var validation = validateCredentials(server, username, password);
      if (!validation.isValid) {
        return Promise.reject(new Error(validation.error));
      }

      var params = { series_id: String(seriesId) };
      var url = buildApiUrl(validation.server, validation.username, validation.password, 'get_series_info', params);

      return window.FreeIPTV.Http.get(url).then(function (response) {
        return parseJsonSafely(response.data, 'Series Info');
      });
    },

    /**
     * Normalize raw series records into the application Series model.
     * @param {Array} rawSeries
     * @param {Array} categories
     * @param {string} server
     * @param {string} username
     * @param {string} password
     * @param {string} playlistId
     * @returns {{ series: Array, categories: Array<string>, stats: Object }}
     */
    normalizeSeriesList: function (rawSeries, categories, server, username, password, playlistId) {
      var pId = playlistId || 'pl_' + Date.now();

      if (!Array.isArray(rawSeries) && rawSeries && typeof rawSeries === 'object') {
        rawSeries = Object.values(rawSeries);
      }
      if (!Array.isArray(categories) && categories && typeof categories === 'object') {
        categories = Object.values(categories);
      }

      var categoryMap = {};
      if (Array.isArray(categories)) {
        for (var c = 0; c < categories.length; c++) {
          if (categories[c] && categories[c].id) {
            categoryMap[String(categories[c].id)] = categories[c].name;
          }
        }
      }

      var seriesList = [];
      var seenIds = {};
      var categoriesSet = {};
      var total = Array.isArray(rawSeries) ? rawSeries.length : 0;

      if (Array.isArray(rawSeries)) {
        for (var i = 0; i < rawSeries.length; i++) {
          var item = rawSeries[i];
          if (!item || typeof item !== 'object') continue;

          var seriesId = item.series_id !== undefined ? String(item.series_id).trim() :
            (item.id !== undefined ? String(item.id).trim() :
            (item.stream_id !== undefined ? String(item.stream_id).trim() : ''));
          if (!seriesId || seenIds[seriesId]) continue;
          seenIds[seriesId] = true;

          var name = item.name ? String(item.name).trim() : (item.title ? String(item.title).trim() : 'Series ' + seriesId);
          var catId = item.category_id !== undefined ? String(item.category_id).trim() : '';
          var groupTitle = categoryMap[catId] || item.category_name || 'Other';
          if (!groupTitle || groupTitle.trim().length === 0) groupTitle = 'Other';

          var posterUrl = item.cover ? String(item.cover).trim() : (item.stream_icon ? String(item.stream_icon).trim() : '');
          var backdropUrl = '';
          if (Array.isArray(item.backdrop_path) && item.backdrop_path[0]) {
            backdropUrl = String(item.backdrop_path[0]).trim();
          } else if (typeof item.backdrop_path === 'string' && item.backdrop_path) {
            backdropUrl = item.backdrop_path.trim();
          }

          var series = {
            id: 'series_' + pId + '_' + seriesId,
            providerId: pId,
            name: name,
            posterUrl: posterUrl,
            backdropUrl: backdropUrl,
            categoryId: catId,
            categoryName: groupTitle,
            description: item.plot || item.overview || item.description || '',
            rating: item.rating ? String(item.rating) : (item.rating_5based ? String(item.rating_5based) : ''),
            releaseDate: item.releaseDate || item.releasedate || item.year || '',
            genre: item.genre || '',
            cast: item.cast || item.actors || '',
            director: item.director || '',
            seasons: [],
            isFavorite: false,
            added: item.added || item.created_at || '',
            lastModified: item.last_modified || '',
            last_modified: item.last_modified || '',
            metadata: {
              seriesId: seriesId,
              added: item.added || item.created_at || '',
              lastModified: item.last_modified || '',
              last_modified: item.last_modified || '',
              episodeRunTime: item.episode_run_time || ''
            }
          };

          seriesList.push(series);
          categoriesSet[groupTitle] = (categoriesSet[groupTitle] || 0) + 1;
        }
      }

      var orderedCategories = [];
      var seenCats = {};
      if (Array.isArray(categories)) {
        for (var c = 0; c < categories.length; c++) {
          var cName = categories[c] ? (categories[c].name || categories[c].category_name) : null;
          if (cName && categoriesSet[cName] && !seenCats[cName]) {
            seenCats[cName] = true;
            orderedCategories.push(cName);
          }
        }
      }
      for (var catName in categoriesSet) {
        if (!seenCats[catName]) {
          seenCats[catName] = true;
          orderedCategories.push(catName);
        }
      }

      return {
        series: seriesList,
        categories: orderedCategories,
        stats: {
          totalEntries: total,
          validEntries: seriesList.length,
          skippedEntries: total - seriesList.length,
          categoriesCount: orderedCategories.length
        }
      };
    },

    /**
     * Normalize detailed series response into Season and Episode models.
     * @param {Object} rawInfo
     * @param {string} seriesId
     * @param {string} server
     * @param {string} username
     * @param {string} password
     * @param {string} playlistId
     * @returns {{ seasons: Array, episodesBySeason: Object, allEpisodes: Array }}
     */
    normalizeSeriesInfo: function (rawInfo, seriesId, server, username, password, playlistId) {
      var pId = playlistId || 'pl_' + Date.now();
      var normServer = normalizeServerUrl(server);
      var sId = String(seriesId);

      var seasons = [];
      var episodesBySeason = {};
      var allEpisodes = [];

      if (!rawInfo || typeof rawInfo !== 'object') {
        return { seasons: seasons, episodesBySeason: episodesBySeason, allEpisodes: allEpisodes };
      }

      // 1. Process explicit Seasons metadata if returned
      var rawSeasons = rawInfo.seasons;
      var rawSeasonList = [];

      if (Array.isArray(rawSeasons)) {
        rawSeasonList = rawSeasons;
      } else if (rawSeasons && typeof rawSeasons === 'object') {
        var sKeys = Object.keys(rawSeasons);
        for (var sk = 0; sk < sKeys.length; sk++) {
          var item = rawSeasons[sKeys[sk]];
          if (item && typeof item === 'object') {
            if (item.season_number === undefined && item.season_num === undefined && item.season === undefined) {
              item.season_number = sKeys[sk];
            }
            rawSeasonList.push(item);
          }
        }
      }

      var seenSeasons = {};
      for (var i = 0; i < rawSeasonList.length; i++) {
        var s = rawSeasonList[i];
        if (!s) continue;
        var rawNum = s.season_number !== undefined ? s.season_number :
                     (s.season_num !== undefined ? s.season_num :
                     (s.season !== undefined ? s.season :
                     (s.seasonNumber !== undefined ? s.seasonNumber : null)));
        var sNum = null;
        if (rawNum !== null && rawNum !== undefined) {
          var sMatch = String(rawNum).match(/\d+/);
          if (sMatch) sNum = parseInt(sMatch[0], 10);
        }
        if (sNum === null || isNaN(sNum)) {
          sNum = i + 1;
        }

        var sName = s.name ? String(s.name).trim() :
                    (s.title ? String(s.title).trim() : (sNum === 0 ? 'Specials' : ('Season ' + sNum)));
        var epCount = s.episode_count !== undefined ? Number(s.episode_count) :
                      (s.episodeCount !== undefined ? Number(s.episodeCount) : 0);
        var customId = s.id || s.season_id ? String(s.id || s.season_id) : ('season_' + pId + '_' + sId + '_' + sNum);

        if (!seenSeasons[sNum]) {
          seenSeasons[sNum] = true;
          seasons.push({
            id: customId,
            seriesId: sId,
            seasonNumber: sNum,
            name: sName,
            episodeCount: epCount
          });
        }
      }

      // 2. Process Episodes defensively (handling objects {"1":[...]}, flat arrays, and associative maps)
      var rawEpisodes = rawInfo.episodes || {};

      function processEpisodeItem(ep, fallbackSeasonNum, indexHint) {
        if (!ep || typeof ep !== 'object') return;

        // Season discovery priority: episode-level field -> fallback key season number -> 1
        var epSeasonRaw = ep.season_num !== undefined ? ep.season_num :
                          (ep.season !== undefined ? ep.season :
                          (ep.seasonNumber !== undefined ? ep.seasonNumber :
                          (ep.info && ep.info.season !== undefined ? ep.info.season : undefined)));
        var sNumVal = fallbackSeasonNum;
        if (epSeasonRaw !== undefined && epSeasonRaw !== null && epSeasonRaw !== '') {
          var sMatch = String(epSeasonRaw).match(/\d+/);
          if (sMatch) {
            sNumVal = parseInt(sMatch[0], 10);
          }
        }
        if (sNumVal === undefined || sNumVal === null || isNaN(sNumVal)) {
          sNumVal = 1;
        }

        if (!episodesBySeason[sNumVal]) {
          episodesBySeason[sNumVal] = [];
        }

        var epId = ep.id !== undefined ? String(ep.id).trim() : (ep.stream_id !== undefined ? String(ep.stream_id).trim() : String(indexHint + 1));
        var epNum = ep.episode_num !== undefined ? Number(ep.episode_num) : (indexHint + 1);
        var epTitle = ep.title ? String(ep.title).trim() : (ep.info && ep.info.name ? String(ep.info.name).trim() : 'Episode ' + epNum);

        var info = ep.info || {};
        var thumb = ep.movie_image ? String(ep.movie_image).trim() : (info.movie_image ? String(info.movie_image).trim() : '');
        var plot = info.plot || ep.plot || info.description || '';
        var duration = info.duration || ep.duration || (info.duration_secs ? Math.round(info.duration_secs / 60) + ' min' : '');
        var airDate = ep.air_date || info.releasedate || '';
        var ext = (ep.container_extension ? String(ep.container_extension).replace(/^\./, '').trim() : '') || 'mp4';

        var streamUrl = generateEpisodeStreamUrl(normServer, username, password, ep);

        var episodeModel = {
          id: 'episode_' + pId + '_' + sId + '_' + sNumVal + '_' + epId,
          seriesId: sId,
          seasonNumber: sNumVal,
          episodeNumber: epNum,
          name: epTitle,
          streamUrl: streamUrl,
          thumbnailUrl: thumb,
          description: plot,
          duration: duration,
          airDate: airDate,
          containerExtension: ext,
          progress: 0,
          metadata: {
            episodeId: epId,
            durationSeconds: info.duration_secs || 0
          }
        };

        episodesBySeason[sNumVal].push(episodeModel);
        allEpisodes.push(episodeModel);
      }

      if (Array.isArray(rawEpisodes)) {
        // Flat array of episodes: group by each episode's season field
        for (var e = 0; e < rawEpisodes.length; e++) {
          processEpisodeItem(rawEpisodes[e], 1, e);
        }
      } else if (typeof rawEpisodes === 'object' && rawEpisodes !== null) {
        var seasonKeys = Object.keys(rawEpisodes);
        for (var k = 0; k < seasonKeys.length; k++) {
          var sKey = seasonKeys[k];
          var epEntry = rawEpisodes[sKey];

          var sMatch = String(sKey).match(/\d+/);
          var sNumVal = sMatch ? parseInt(sMatch[0], 10) : (parseInt(sKey, 10) || 1);

          if (Array.isArray(epEntry)) {
            for (var e = 0; e < epEntry.length; e++) {
              processEpisodeItem(epEntry[e], sNumVal, e);
            }
          } else if (epEntry && typeof epEntry === 'object') {
            // Associative map where key is episode id / index or single episode object
            processEpisodeItem(epEntry, sNumVal, k);
          }
        }
      }

      // 3. SYNTHESIS STEP: Ensure ALL seasons present in episodesBySeason are represented in seasons
      for (var sn in episodesBySeason) {
        if (episodesBySeason.hasOwnProperty(sn)) {
          var snInt = parseInt(sn, 10);
          if (isNaN(snInt)) continue;

          // Sort episodes in this season numerically by episodeNumber
          episodesBySeason[snInt].sort(function (a, b) {
            return (Number(a.episodeNumber) || 0) - (Number(b.episodeNumber) || 0);
          });

          if (!seenSeasons[snInt]) {
            seenSeasons[snInt] = true;
            seasons.push({
              id: 'season_' + pId + '_' + sId + '_' + snInt,
              seriesId: sId,
              seasonNumber: snInt,
              name: snInt === 0 ? 'Specials' : ('Season ' + snInt),
              episodeCount: episodesBySeason[snInt].length
            });
          } else {
            // Update episodeCount: actual episode data takes precedence over metadata
            for (var sIdx = 0; sIdx < seasons.length; sIdx++) {
              if (seasons[sIdx].seasonNumber === snInt) {
                if (episodesBySeason[snInt].length > 0 || !seasons[sIdx].episodeCount) {
                  seasons[sIdx].episodeCount = episodesBySeason[snInt].length;
                }
              }
            }
          }
        }
      }

      // Ensure every season in seasons has an episodes array in episodesBySeason
      for (var si = 0; si < seasons.length; si++) {
        var sNum = seasons[si].seasonNumber;
        if (!episodesBySeason[sNum]) {
          episodesBySeason[sNum] = [];
        }
      }

      // Sort seasons strictly ascending by seasonNumber (Specials 0, then 1, 2, ... 10)
      seasons.sort(function (a, b) {
        return (a.seasonNumber || 0) - (b.seasonNumber || 0);
      });

      return {
        seasons: seasons,
        episodesBySeason: episodesBySeason,
        allEpisodes: allEpisodes
      };
    },

    /**
     * Fetch Series categories and series list in a unified workflow.
     * @param {string} server
     * @param {string} username
     * @param {string} password
     * @param {string} [playlistId]
     * @returns {Promise<{ series: Array, categories: Array<string>, stats: Object }>}
     */
    fetchAllSeries: function (server, username, password, playlistId) {
      var self = this;
      var pId = playlistId || 'pl_' + Date.now();

      return Promise.all([
        self.getSeriesCategories(server, username, password).catch(function () { return []; }),
        self.getSeries(server, username, password)
      ]).then(function (results) {
        var categories = results[0] || [];
        var rawSeries = results[1] || [];
        return self.normalizeSeriesList(rawSeries, categories, server, username, password, pId);
      });
    },

    /**
     * Fetch short EPG table for a specific stream.
     * @param {string} server
     * @param {string} username
     * @param {string} password
     * @param {string|number} streamId
     * @param {number} [limit]
     * @returns {Promise<Object>}
     */
    getShortEpg: function (server, username, password, streamId, limit) {
      var validation = validateCredentials(server, username, password);
      if (!validation.isValid) {
        return Promise.reject(new Error(validation.error));
      }

      var params = {
        stream_id: String(streamId),
        limit: limit || 10
      };
      var url = buildApiUrl(validation.server, validation.username, validation.password, 'get_short_epg', params);

      return window.FreeIPTV.Http.get(url).then(function (response) {
        return parseJsonSafely(response.data, 'Short EPG');
      });
    },

    /**
     * Fetch simple data table EPG for a specific stream.
     * @param {string} server
     * @param {string} username
     * @param {string} password
     * @param {string|number} streamId
     * @returns {Promise<Object>}
     */
    getSimpleDataTable: function (server, username, password, streamId) {
      var validation = validateCredentials(server, username, password);
      if (!validation.isValid) {
        return Promise.reject(new Error(validation.error));
      }

      var params = { stream_id: String(streamId) };
      var url = buildApiUrl(validation.server, validation.username, validation.password, 'get_simple_data_table', params);

      return window.FreeIPTV.Http.get(url).then(function (response) {
        return parseJsonSafely(response.data, 'Simple EPG Table');
      });
    },

    /**
     * Normalize raw EPG listings into normalized EPGProgram models.
     * Handles base64 encoded strings, timestamps, and current program state.
     * @param {Object|Array} rawEpg
     * @param {string} channelId
     * @param {string} [tvgId]
     * @returns {Array<Object>}
     */
    normalizeEpgPrograms: function (rawEpg, channelId, tvgId) {
      if (!rawEpg) return [];

      var listings = [];
      if (Array.isArray(rawEpg)) {
        listings = rawEpg;
      } else if (rawEpg && Array.isArray(rawEpg.epg_listings)) {
        listings = rawEpg.epg_listings;
      }

      var now = Date.now();
      var programs = [];

      for (var i = 0; i < listings.length; i++) {
        var item = listings[i];
        if (!item || typeof item !== 'object') continue;

        var rawTitle = item.title || '';
        var rawDesc = item.description || '';

        // Decode base64 if present
        var title = safeDecodeBase64(rawTitle);
        var description = safeDecodeBase64(rawDesc);

        // Parse timestamps
        var startMs = 0;
        var stopMs = 0;

        if (item.start_timestamp) {
          startMs = Number(item.start_timestamp) * 1000;
        } else if (item.start) {
          startMs = new Date(String(item.start).replace(' ', 'T')).getTime();
        }

        if (item.stop_timestamp) {
          stopMs = Number(item.stop_timestamp) * 1000;
        } else if (item.end) {
          stopMs = new Date(String(item.end).replace(' ', 'T')).getTime();
        }

        var durationSecs = (stopMs > startMs) ? Math.round((stopMs - startMs) / 1000) : 0;
        var isCurrent = (now >= startMs && now < stopMs);

        var progress = 0;
        if (isCurrent && stopMs > startMs) {
          progress = Math.min(100, Math.max(0, Math.round(((now - startMs) / (stopMs - startMs)) * 100)));
        }

        programs.push({
          id: 'epg_' + (channelId || 'ch') + '_' + (item.id || i),
          channelId: channelId || '',
          tvgId: tvgId || item.epg_id || '',
          title: title || 'No Program Title',
          description: description,
          startTime: startMs,
          endTime: stopMs,
          duration: durationSecs,
          progress: progress,
          isCurrent: isCurrent
        });
      }

      // Sort by start time ascending
      programs.sort(function (a, b) { return a.startTime - b.startTime; });

      return programs;
    }
  };

  XtreamApi.generateMovieStreamUrl = generateMovieStreamUrl;
  XtreamApi.generateEpisodeStreamUrl = generateEpisodeStreamUrl;
  XtreamApi.safeDecodeBase64 = safeDecodeBase64;

  window.FreeIPTV.XtreamApi = XtreamApi;
  window.FreeIPTV.XtreamAPI = XtreamApi;
})(window);
