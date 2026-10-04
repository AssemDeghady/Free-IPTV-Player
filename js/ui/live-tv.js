/**
 * Free IPTV Player — Live TV View Controller (Phase 5.2)
 * Arbitrary-depth Category Tree with stack-based remote navigation,
 * Virtualized channel browsing, local search, and integrated Live EPG pane.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var activeCategory = 'all';
  var allChannels = [];
  var filteredChannels = [];
  var currentSearchQuery = '';
  var renderedCount = 0;
  var CHUNK_SIZE = 40;

  // Category Tree State
  var categoryTree = null; // { rootNodes: [], nodeMap: {} }
  var categoryStack = []; // Stack of category nodes for drill-down navigation
  var selectedCategoryNode = null; // Current active category node (or null for root/all/fav)

  // Live EPG State
  var selectedChannel = null;
  var epgDebounceTimer = null;

  // Live Channel Preview State (Phase 5.3)
  var PREVIEW_DEBOUNCE_MS = 700;
  var previewTimer = null;
  var currentPreviewChannel = null;
  var isPreviewActive = false;

  var LiveTV = {
    /**
     * Initialize Live TV view.
     */
    init: function () {
      this.bindEvents();

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('Live TV View initialized with Category Tree & Integrated EPG.');
      }
    },

    /**
     * Bind search input and global app events.
     */
    bindEvents: function () {
      var self = this;

      var searchInput = document.getElementById('live-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', function (e) {
          self.setSearchQuery(e.target.value);
        });
      }

      // Re-load when active playlist changes or playlists are updated
      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYLIST_ACTIVE_CHANGED, function () {
          self.loadActivePlaylist();
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYLIST_UPDATED, function () {
          self.loadActivePlaylist();
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.VIEW_CHANGED, function (data) {
          if (data && data.route === 'live_tv') {
            self.onEnterView();
          } else {
            self.stopChannelPreview();
          }
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.FAVORITES_UPDATED, function () {
          self.refreshFavoritesState();
        });
      }
    },

    /**
     * Called when user enters Live TV screen.
     */
    onEnterView: function () {
      this.loadActivePlaylist();
    },

    /**
     * Check if category stack has depth for back navigation.
     * @returns {boolean}
     */
    canNavigateBackCategory: function () {
      return categoryStack.length > 0;
    },

    /**
     * Pop category stack and navigate back to parent category level.
     */
    navigateBackCategory: function () {
      if (categoryStack.length === 0) return;

      categoryStack.pop();

      if (categoryStack.length > 0) {
        var parentNode = categoryStack[categoryStack.length - 1];
        this.selectCategoryNode(parentNode);
      } else {
        selectedCategoryNode = null;
        activeCategory = 'all';
        this.applyFilter();
      }

      this.renderCategories();

      // Focus first item in categories list
      var firstCat = document.querySelector('#live-categories-list .focusable');
      if (firstCat && window.FreeIPTV.Navigation) {
        window.FreeIPTV.Navigation.focus(firstCat);
      }
    },

    /**
     * Load channels and categories from the active playlist.
     * @param {boolean} [forceRefresh] If true, re-fetches from provider API
     */
    loadActivePlaylist: function (forceRefresh) {
      var self = this;
      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      if (!PlaylistManager) return;

      var activePlaylist = PlaylistManager.getActivePlaylist();
      if (!activePlaylist) {
        self.renderEmptyState('NO_PROVIDER');
        return;
      }

      // 1. Show immediate loading state
      self.renderLoadingState();

      // 2. Update badge
      var badge = document.getElementById('live-tv-playlist-badge');
      if (badge) {
        badge.textContent = activePlaylist.name;
      }

      // 3. Section 2 Mandated Diagnostics Logging
      console.log('[LIVE-TV] LIVE TV LOAD START');
      console.log('[LIVE-TV] activePlaylist=' + activePlaylist.id);
      console.log('[LIVE-TV] activePlaylistName=' + activePlaylist.name);
      console.log('[LIVE-TV] provider=' + activePlaylist.type);

      if (activePlaylist.type === 'xtream') {
        var host = 'unknown';
        try {
          host = new URL(activePlaylist.server).host;
        } catch (e) {
          host = (activePlaylist.server || '').replace(/https?:\/\//i, '').split('/')[0];
        }
        console.log('[LIVE-TV] serverHost=' + host);
      }

      PlaylistManager.loadChannels(activePlaylist.id, forceRefresh)
        .then(function (channels) {
          allChannels = channels || [];

          // Log authentication and channel counts
          console.log('[LIVE-TV] auth=SUCCESS');
          var rawCats = activePlaylist.rawCategories || activePlaylist.categories || [];
          console.log('[LIVE-TV] categories.raw=' + (rawCats ? rawCats.length : 0));
          console.log('[LIVE-TV] streams.raw=' + (activePlaylist.channelCount || allChannels.length));
          console.log('[LIVE-TV] channels.normalized=' + allChannels.length);
          console.log('[LIVE-TV] channels.cached=' + allChannels.length);

          if (allChannels.length === 0) {
            console.log('[LIVE-TV] channels.ui=0');
            self.renderEmptyState('NO_CHANNELS');
            return;
          }

          // Build arbitrary-depth category tree
          categoryTree = PlaylistManager.buildCategoryTree(rawCats, allChannels);
          categoryStack = [];
          selectedCategoryNode = null;
          activeCategory = 'all';

          self.renderCategories();
          self.applyFilter();

          console.log('[LIVE-TV] channels.ui=' + filteredChannels.length);

          // Focus first channel if navigation engine is ready
          if (filteredChannels.length > 0) {
            self.renderChannelEpg(filteredChannels[0]);
          } else {
            self.renderEpgPlaceholder();
          }
        })
        .catch(function (error) {
          var code = (error && error.code) || 'CONNECTION_FAILURE';
          var msg = (error && error.message) || '';
          console.error('[LIVE-TV] loadChannels failed: [' + code + '] ' + msg);
          if (code === 'AUTH_FAILURE') {
            console.log('[LIVE-TV] auth=FAILURE');
          }
          self.renderEmptyState(code, msg);
        });
    },

    /**
     * Force re-fetch channels directly from provider (bypasses cache).
     */
    forceRefreshChannels: function () {
      this.loadActivePlaylist(true);
    },

    /**
     * Render the categories column for the current drill-down level.
     */
    renderCategories: function () {
      var container = document.getElementById('live-categories-list');
      if (!container) return;

      container.innerHTML = '';
      var self = this;
      var I18n = window.FreeIPTV.I18n;

      // 1. If currently inside a subcategory level, render Back Button at top
      if (categoryStack.length > 0) {
        var currentParent = categoryStack[categoryStack.length - 1];

        var backBtn = document.createElement('button');
        backBtn.className = 'category-back-btn focusable';
        backBtn.setAttribute('data-nav-zone', 'live_categories');
        backBtn.innerHTML = '<span class="back-arrow">&larr;</span> <span>' +
          (I18n ? I18n.t('live.back_category') : '.. Back') + ' (' + currentParent.name + ')</span>';

        backBtn.addEventListener('click', function () {
          self.navigateBackCategory();
        });
        container.appendChild(backBtn);

        // "All in [Parent]" category item
        var allInParent = document.createElement('button');
        allInParent.className = 'category-item focusable' + (selectedCategoryNode === currentParent ? ' active' : '');
        allInParent.setAttribute('data-nav-zone', 'live_categories');

        var allInLabel = document.createElement('span');
        allInLabel.textContent = (I18n ? I18n.t('live.all_channels') : 'All Channels') + ' (' + currentParent.name + ')';
        var allInCount = document.createElement('span');
        allInCount.className = 'category-count';
        allInCount.textContent = String(currentParent.channelCount);

        allInParent.appendChild(allInLabel);
        allInParent.appendChild(allInCount);

        allInParent.addEventListener('click', function () {
          self.selectCategoryNode(currentParent, allInParent);
        });
        container.appendChild(allInParent);
      } else {
        // Root Level: Render "All Channels" & "Favorites"
        // A. "All Channels"
        var allItem = document.createElement('button');
        allItem.className = 'category-item focusable' + (activeCategory === 'all' ? ' active' : '');
        allItem.setAttribute('data-nav-zone', 'live_categories');
        allItem.setAttribute('data-category', 'all');

        var allLabel = document.createElement('span');
        allLabel.textContent = I18n ? I18n.t('live.all_channels') : 'All Channels';
        var allCount = document.createElement('span');
        allCount.className = 'category-count';
        allCount.textContent = String(allChannels.length);

        allItem.appendChild(allLabel);
        allItem.appendChild(allCount);

        allItem.addEventListener('click', function () {
          selectedCategoryNode = null;
          activeCategory = 'all';
          self.highlightCategoryItem(allItem);
          self.applyFilter();
        });
        container.appendChild(allItem);

        // B. "Favorites"
        var favChannelsCount = allChannels.filter(function (c) { return c.isFavorite; }).length;
        var favItem = document.createElement('button');
        favItem.className = 'category-item focusable' + (activeCategory === 'favorites' ? ' active' : '');
        favItem.setAttribute('data-nav-zone', 'live_categories');
        favItem.setAttribute('data-category', 'favorites');

        var favLabel = document.createElement('span');
        favLabel.textContent = I18n ? I18n.t('live.favorites_category') : 'Favorites';
        var favCount = document.createElement('span');
        favCount.className = 'category-count';
        favCount.textContent = String(favChannelsCount);

        favItem.appendChild(favLabel);
        favItem.appendChild(favCount);

        favItem.addEventListener('click', function () {
          selectedCategoryNode = null;
          activeCategory = 'favorites';
          self.highlightCategoryItem(favItem);
          self.applyFilter();
        });
        container.appendChild(favItem);
      }

      // 2. Render nodes at the current level
      var nodes = [];
      if (categoryTree) {
        if (categoryStack.length > 0) {
          nodes = categoryStack[categoryStack.length - 1].children || [];
        } else {
          nodes = categoryTree.rootNodes || [];
        }
      }

      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var itemEl = document.createElement('button');
        itemEl.className = 'category-item focusable' + (selectedCategoryNode === node ? ' active' : '');
        itemEl.setAttribute('data-nav-zone', 'live_categories');
        itemEl.setAttribute('data-category-id', node.id);
        itemEl.setAttribute('data-category', node.name);

        var nameSpan = document.createElement('span');
        nameSpan.textContent = node.name;

        var rightGroup = document.createElement('span');
        rightGroup.style.display = 'flex';
        rightGroup.style.alignItems = 'center';
        rightGroup.style.gap = '6px';

        var countSpan = document.createElement('span');
        countSpan.className = 'category-count';
        countSpan.textContent = String(node.channelCount);
        rightGroup.appendChild(countSpan);

        // If node has children, show chevron indicator
        if (node.children && node.children.length > 0) {
          var chevron = document.createElement('span');
          chevron.className = 'category-expand-indicator';
          chevron.innerHTML = '&#9656;';
          rightGroup.appendChild(chevron);
        }

        itemEl.appendChild(nameSpan);
        itemEl.appendChild(rightGroup);

        (function (catNode, el) {
          el.addEventListener('click', function () {
            if (catNode.children && catNode.children.length > 0) {
              // Drill down into child subcategories
              categoryStack.push(catNode);
              self.selectCategoryNode(catNode);
              self.renderCategories();
              // Auto focus first item in subcategory
              var firstChild = document.querySelector('#live-categories-list .focusable');
              if (firstChild && window.FreeIPTV.Navigation) {
                window.FreeIPTV.Navigation.focus(firstChild);
              }
            } else {
              // Leaf category
              self.selectCategoryNode(catNode, el);
            }
          });
        })(node, itemEl);

        container.appendChild(itemEl);
      }
    },

    /**
     * Switch active category to a CategoryNode.
     * @param {Object} node
     * @param {HTMLElement} [itemEl]
     */
    selectCategoryNode: function (node, itemEl) {
      selectedCategoryNode = node;
      activeCategory = node ? node.name : 'all';

      if (itemEl) {
        this.highlightCategoryItem(itemEl);
      }

      this.applyFilter();
    },

    /**
     * Direct category select by name (legacy test & shortcut compatibility).
     * @param {string} categoryName
     * @param {HTMLElement} [itemEl]
     */
    selectCategory: function (categoryName, itemEl) {
      if (categoryName === 'all') {
        selectedCategoryNode = null;
        activeCategory = 'all';
      } else if (categoryName === 'favorites') {
        selectedCategoryNode = null;
        activeCategory = 'favorites';
      } else {
        activeCategory = categoryName;
        var found = null;
        if (categoryTree && categoryTree.nodeMap) {
          for (var k in categoryTree.nodeMap) {
            if (categoryTree.nodeMap[k].name === categoryName || categoryTree.nodeMap[k].originalName === categoryName) {
              found = categoryTree.nodeMap[k];
              break;
            }
          }
        }
        selectedCategoryNode = found;
      }

      if (itemEl) {
        this.highlightCategoryItem(itemEl);
      }

      this.applyFilter();
    },

    /**
     * Highlight an active category element in the DOM.
     * @param {HTMLElement} itemEl
     */
    highlightCategoryItem: function (itemEl) {
      var items = document.querySelectorAll('.category-item, .category-back-btn');
      for (var i = 0; i < items.length; i++) {
        items[i].classList.remove('active');
      }
      if (itemEl) {
        itemEl.classList.add('active');
      }
    },

    /**
     * Update search query.
     * @param {string} query
     */
    setSearchQuery: function (query) {
      currentSearchQuery = query || '';
      this.applyFilter();
    },

    /**
     * Filter channels and render visible slice.
     */
    applyFilter: function () {
      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      var candidateChannels = allChannels;

      if (activeCategory === 'favorites') {
        candidateChannels = allChannels.filter(function (ch) {
          return ch.isFavorite;
        });
      } else if (selectedCategoryNode && PlaylistManager) {
        candidateChannels = PlaylistManager.getChannelsForCategoryNode(selectedCategoryNode);
      }

      if (currentSearchQuery && PlaylistManager) {
        filteredChannels = PlaylistManager.searchChannels(candidateChannels, currentSearchQuery);
      } else {
        filteredChannels = candidateChannels;
      }

      // Update channel count headline
      var countEl = document.getElementById('live-channel-count-label');
      if (countEl) {
        var tmpl = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('live.channel_count') : '{count} Channels';
        countEl.textContent = tmpl.replace('{count}', filteredChannels.length);
      }

      this.renderChannelList(true);

      // Update EPG pane with the first channel of the filtered list
      if (filteredChannels.length > 0) {
        this.renderChannelEpg(filteredChannels[0]);
      } else {
        this.renderEpgPlaceholder();
      }
    },

    /**
     * Render channels chunk to DOM.
     * @param {boolean} reset If true, resets list to top
     */
    renderChannelList: function (reset) {
      var container = document.getElementById('live-channels-container');
      if (!container) return;

      if (reset) {
        container.innerHTML = '';
        renderedCount = 0;
      }

      if (filteredChannels.length === 0) {
        var emptyCard = document.createElement('div');
        emptyCard.className = 'channels-empty-notice';
        emptyCard.innerHTML = '<p class="empty-title">' + (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('live.no_channels') : 'No channels found') + '</p>' +
                              '<p class="empty-sub">' + (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('live.no_channels_sub') : 'Try selecting another category or changing your search query.') + '</p>';
        container.appendChild(emptyCard);
        return;
      }

      var endIndex = Math.min(renderedCount + CHUNK_SIZE, filteredChannels.length);

      for (var i = renderedCount; i < endIndex; i++) {
        var channel = filteredChannels[i];
        var card = this.createChannelElement(channel, i);
        container.appendChild(card);
      }

      renderedCount = endIndex;
    },

    /**
     * Build DOM node for a channel.
     * @param {Object} channel
     * @param {number} index
     * @returns {HTMLElement}
     */
    createChannelElement: function (channel, index) {
      var self = this;
      var btn = document.createElement('button');
      btn.className = 'channel-card focusable';
      btn.setAttribute('data-nav-zone', 'live_channels');
      btn.setAttribute('data-channel-id', channel.id);
      btn.setAttribute('data-index', String(index));

      // Channel Number (if available) or ordinal index
      var chNum = document.createElement('div');
      chNum.className = 'channel-number';
      chNum.textContent = channel.tvgChno ? channel.tvgChno : String(index + 1);

      // Logo container with fallback TV icon
      var logoContainer = document.createElement('div');
      logoContainer.className = 'channel-logo-container';

      var fallbackSvg = document.createElement('div');
      fallbackSvg.className = 'channel-fallback-icon';
      fallbackSvg.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg>';

      if (channel.logoUrl) {
        var img = document.createElement('img');
        img.className = 'channel-logo-img';
        img.alt = '';
        img.loading = 'lazy';
        img.src = channel.logoUrl;

        img.onerror = function () {
          this.style.display = 'none';
          fallbackSvg.style.display = 'flex';
        };

        logoContainer.appendChild(img);
        fallbackSvg.style.display = 'none';
      }

      logoContainer.appendChild(fallbackSvg);

      // Info group (Name + Category)
      var infoGroup = document.createElement('div');
      infoGroup.className = 'channel-info-group';

      var title = document.createElement('div');
      title.className = 'channel-name';
      title.textContent = channel.name;

      var cat = document.createElement('div');
      cat.className = 'channel-category-tag';
      cat.textContent = channel.groupTitle;

      infoGroup.appendChild(title);
      infoGroup.appendChild(cat);

      // Favorite toggle star button / indicator
      var favBtn = document.createElement('div');
      favBtn.className = 'channel-fav-indicator' + (channel.isFavorite ? ' is-favorite' : '');
      favBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';

      btn.appendChild(chNum);
      btn.appendChild(logoContainer);
      btn.appendChild(infoGroup);
      btn.appendChild(favBtn);

      // Channel Click -> Play
      btn.addEventListener('click', function () {
        self.onChannelSelected(channel);
      });

      // Channel Focus -> Update Integrated EPG Pane
      btn.addEventListener('focus', function () {
        self.onChannelFocused(channel);
      });

      return btn;
    },

    /**
     * Debounced channel focus handler for integrated EPG pane updates and YouTube-style live preview.
     * @param {Object} channel
     */
    onChannelFocused: function (channel) {
      var self = this;
      selectedChannel = channel;

      // 1. Update EPG pane
      if (epgDebounceTimer) {
        clearTimeout(epgDebounceTimer);
      }
      epgDebounceTimer = setTimeout(function () {
        self.renderChannelEpg(channel);
      }, 150);

      // 2. YouTube-style debounced live preview (Muted)
      if (previewTimer) {
        clearTimeout(previewTimer);
        previewTimer = null;
      }

      if (currentPreviewChannel !== channel) {
        this.stopChannelPreview();
        this.renderPreviewStatus(window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('live.preview_loading') : 'Loading preview...', true);

        previewTimer = setTimeout(function () {
          self.startChannelPreview(channel);
        }, PREVIEW_DEBOUNCE_MS);
      }
    },

    /**
     * Start muted preview of a focused channel after debounce delay (~700ms).
     * Uses Samsung AVPlay with volume 0 / muted and designated preview viewport.
     * @param {Object} channel
     */
    startChannelPreview: function (channel) {
      if (!channel || selectedChannel !== channel) return;
      var streamUrl = channel.streamUrl;
      if (!streamUrl) {
        this.renderPreviewStatus(window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('live.preview_unavailable') : 'Preview unavailable', false);
        return;
      }

      var self = this;
      var AVPlayEngine = window.FreeIPTV.AVPlayEngine;
      currentPreviewChannel = channel;

      this.renderPreviewStatus(window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('live.preview_loading') : 'Loading preview...', true);

      var previewWindow = document.getElementById('live-preview-window');
      var rect = null;
      if (previewWindow) {
        rect = previewWindow.getBoundingClientRect();
      }

      if (AVPlayEngine) {
        AVPlayEngine.startPreview(streamUrl, rect)
          .then(function () {
            if (currentPreviewChannel === channel) {
              isPreviewActive = true;
              self.renderPreviewStatus('', false);

              // In mock/browser fallback environment: attach HTML5 video
              var vid = document.getElementById('live-preview-video');
              if (vid && (!window.webapis || !window.webapis.avplay)) {
                vid.src = streamUrl;
                vid.muted = true;
                vid.classList.remove('hidden');
                var p = vid.play();
                if (p && p.catch) p.catch(function () {});
              }
            }
          })
          .catch(function (err) {
            if (currentPreviewChannel === channel) {
              self.renderPreviewStatus(window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('live.preview_unavailable') : 'Preview unavailable', false);
              if (window.FreeIPTV.Logger) {
                window.FreeIPTV.Logger.warn('Channel preview failed safely:', err.message);
              }
            }
          });
      }
    },

    /**
     * Safely stop active channel preview and clean up resources.
     */
    stopChannelPreview: function () {
      if (previewTimer) {
        clearTimeout(previewTimer);
        previewTimer = null;
      }

      if (isPreviewActive || currentPreviewChannel) {
        var AVPlayEngine = window.FreeIPTV.AVPlayEngine;
        if (AVPlayEngine) {
          AVPlayEngine.stopPreview();
        }

        var vid = document.getElementById('live-preview-video');
        if (vid) {
          try {
            vid.pause();
            vid.removeAttribute('src');
            vid.load();
          } catch (e) {}
          vid.classList.add('hidden');
        }

        isPreviewActive = false;
        currentPreviewChannel = null;
      }

      this.renderPreviewStatus(window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('live.preview_idle') : 'Focus a channel to preview', false);
    },

    /**
     * Render status and loading spinner in preview area.
     * @param {string} text
     * @param {boolean} showSpinner
     */
    renderPreviewStatus: function (text, showSpinner) {
      var statusEl = document.getElementById('live-preview-status');
      var spinnerEl = document.getElementById('live-preview-spinner');
      if (statusEl) {
        statusEl.textContent = text || '';
      }
      if (spinnerEl) {
        if (showSpinner) {
          spinnerEl.classList.remove('hidden');
        } else {
          spinnerEl.classList.add('hidden');
        }
      }
    },

    /**
     * Render integrated EPG pane for the currently focused/selected channel.
     * @param {Object} channel
     */
    renderChannelEpg: function (channel) {
      var container = document.getElementById('live-epg-content');
      if (!container || !channel) return;

      var I18n = window.FreeIPTV.I18n;
      var PlaylistManager = window.FreeIPTV.PlaylistManager;

      // 1. Header with logo, channel name, category tag, and number
      var headerHtml = '<div class="live-epg-channel-header">' +
        '<div class="live-epg-channel-logo">' +
          (channel.logoUrl ? '<img src="' + channel.logoUrl + '" alt="" onerror="this.style.display=\'none\'">' : '<svg viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg>') +
        '</div>' +
        '<div class="live-epg-channel-meta">' +
          '<div class="live-epg-channel-name">' + (channel.name || 'Channel') + '</div>' +
          '<div class="live-epg-channel-sub">' + (channel.tvgChno ? '#' + channel.tvgChno + ' • ' : '') + (channel.groupTitle || 'Live') + '</div>' +
        '</div>' +
      '</div>';

      container.innerHTML = headerHtml +
        '<div class="live-epg-loading"><div class="loading-spinner"></div></div>';

      // 2. Fetch EPG data
      var activePlaylist = PlaylistManager ? PlaylistManager.getActivePlaylist() : null;
      var pId = activePlaylist ? activePlaylist.id : (channel.playlistId || '');

      PlaylistManager.loadChannelEpg(pId, channel).then(function (programs) {
        // If user moved to another channel in the meantime, discard stale response
        if (selectedChannel && selectedChannel.id !== channel.id) {
          return;
        }

        if (!programs || programs.length === 0) {
          var emptyNotice = '<div class="live-epg-empty-notice">' +
            '<div class="live-epg-empty-title">' + (I18n ? I18n.t('live.epg_unavailable') : 'EPG Unavailable') + '</div>' +
            '<div class="live-epg-empty-desc">' + (I18n ? I18n.t('live.no_epg') : 'No program guide data available for this channel.') + '</div>' +
          '</div>';
          container.innerHTML = headerHtml + emptyNotice;
          return;
        }

        // Find Current program
        var now = Date.now();
        var currentProg = null;
        var nextProg = null;
        var upcoming = [];

        for (var i = 0; i < programs.length; i++) {
          var p = programs[i];
          if (p.isCurrent || (now >= p.startTime && now < p.endTime)) {
            currentProg = p;
          } else if (p.startTime >= now) {
            if (!nextProg) {
              nextProg = p;
            } else {
              upcoming.push(p);
            }
          }
        }

        // Fallback: if no program was current, use first program as current
        if (!currentProg && programs.length > 0) {
          currentProg = programs[0];
          nextProg = programs.length > 1 ? programs[1] : null;
          upcoming = programs.slice(2);
        }

        var contentHtml = headerHtml;

        // Render "Now Playing" card
        if (currentProg) {
          var timeStr = self.formatTimeRange(currentProg.startTime, currentProg.endTime);
          contentHtml += '<div class="live-epg-card">' +
            '<div class="live-epg-badge">' + (I18n ? I18n.t('live.now_playing') : 'NOW PLAYING') + '</div>' +
            '<div class="live-epg-prog-title">' + (currentProg.title || 'Live Program') + '</div>' +
            (timeStr ? '<div class="live-epg-prog-times">' + timeStr + '</div>' : '') +
            '<div class="live-epg-progress-wrap"><div class="live-epg-progress-fill" style="width: ' + (currentProg.progress || 0) + '%;"></div></div>' +
            (currentProg.description ? '<div class="live-epg-prog-desc">' + currentProg.description + '</div>' : '') +
          '</div>';
        }

        // Render "Next" card
        if (nextProg) {
          var nextTimeStr = self.formatTimeRange(nextProg.startTime, nextProg.endTime);
          contentHtml += '<div class="live-epg-card" style="background: rgba(255,255,255,0.02); border-color: rgba(255,255,255,0.06);">' +
            '<div class="live-epg-badge" style="color: #94a3b8;">' + (I18n ? I18n.t('live.next_playing') : 'NEXT') + '</div>' +
            '<div class="live-epg-prog-title" style="font-size: 14px;">' + (nextProg.title || 'Next Program') + '</div>' +
            (nextTimeStr ? '<div class="live-epg-prog-times">' + nextTimeStr + '</div>' : '') +
          '</div>';
        }

        // Render Upcoming Schedule list
        if (upcoming.length > 0) {
          contentHtml += '<div class="live-epg-schedule-title">' + (I18n ? I18n.t('live.upcoming') : 'Upcoming Schedule') + '</div>';
          contentHtml += '<div class="live-epg-schedule-list">';

          var listCount = Math.min(upcoming.length, 6);
          for (var u = 0; u < listCount; u++) {
            var up = upcoming[u];
            var upTime = up.startTime ? new Date(up.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
            contentHtml += '<div class="live-epg-schedule-item focusable" data-nav-zone="live_epg">' +
              '<span class="live-epg-schedule-time">' + upTime + '</span>' +
              '<span class="live-epg-schedule-name">' + (up.title || 'Program') + '</span>' +
            '</div>';
          }
          contentHtml += '</div>';
        }

        container.innerHTML = contentHtml;
      }).catch(function () {
        var emptyNotice = '<div class="live-epg-empty-notice">' +
          '<div class="live-epg-empty-title">' + (I18n ? I18n.t('live.epg_unavailable') : 'EPG Unavailable') + '</div>' +
          '<div class="live-epg-empty-desc">' + (I18n ? I18n.t('live.no_epg') : 'No program guide data available for this channel.') + '</div>' +
        '</div>';
        container.innerHTML = headerHtml + emptyNotice;
      });
    },

    /**
     * Render placeholder in EPG pane when no channel is focused/selected.
     */
    renderEpgPlaceholder: function () {
      var container = document.getElementById('live-epg-content');
      if (!container) return;
      var I18n = window.FreeIPTV.I18n;
      container.innerHTML = '<div class="live-epg-empty-notice">' +
        '<div class="live-epg-empty-title">' + (I18n ? I18n.t('live.epg_header') : 'Program Guide') + '</div>' +
        '<div class="live-epg-empty-desc">' + (I18n ? I18n.t('live.no_channels_sub') : 'Select a channel to view program guide and schedule.') + '</div>' +
      '</div>';
    },

    /**
     * Format start and end timestamps into a clean HH:MM - HH:MM string.
     * @param {number} startMs
     * @param {number} stopMs
     * @returns {string}
     */
    formatTimeRange: function (startMs, stopMs) {
      if (!startMs && !stopMs) return '';
      try {
        var s = startMs ? new Date(startMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        var e = stopMs ? new Date(stopMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        if (s && e) return s + ' - ' + e;
        return s || e;
      } catch (err) {
        return '';
      }
    },

    /**
     * Channel selected action handler.
     * Starts playback in AVPlay TV engine.
     * @param {Object} channel
     */
    onChannelSelected: function (channel) {
      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('Channel selected for playback:', channel.name, channel.streamUrl);
      }

      if (window.FreeIPTV.Player) {
        window.FreeIPTV.Player.playChannel(channel, filteredChannels);
      }
    },

    /**
     * Refresh favorite star indicators when favorites update.
     */
    refreshFavoritesState: function () {
      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      if (!PlaylistManager) return;

      var favSet = {};
      var favIds = PlaylistManager.getFavoriteIds();
      for (var i = 0; i < favIds.length; i++) {
        favSet[favIds[i]] = true;
      }

      for (var j = 0; j < allChannels.length; j++) {
        allChannels[j].isFavorite = Boolean(favSet[allChannels[j].id] || favSet[allChannels[j].streamUrl]);
      }

      var cards = document.querySelectorAll('.channel-card');
      for (var k = 0; k < cards.length; k++) {
        var chId = cards[k].getAttribute('data-channel-id');
        var indicator = cards[k].querySelector('.channel-fav-indicator');
        if (indicator && chId) {
          if (favSet[chId]) {
            indicator.classList.add('is-favorite');
          } else {
            indicator.classList.remove('is-favorite');
          }
        }
      }
    },

    /**
     * Check if more channels should be loaded when approaching bottom of list.
     * @param {HTMLElement} focusedElement
     */
    checkLoadMore: function (focusedElement) {
      if (!focusedElement) return;
      var index = parseInt(focusedElement.getAttribute('data-index'), 10);
      if (!isNaN(index) && index >= renderedCount - 10 && renderedCount < filteredChannels.length) {
        this.renderChannelList(false);
      }
    },

    /**
     * Render visible loading state while channels are fetched or cached.
     */
    renderLoadingState: function () {
      var container = document.getElementById('live-channels-container');
      if (container) {
        var I18n = window.FreeIPTV.I18n;
        container.innerHTML = '<div class="channels-loading-notice">' +
                              '  <div class="spinner-ring"></div>' +
                              '  <p class="loading-title">' + (I18n ? I18n.t('live.loading_channels') : 'Loading TV channels...') + '</p>' +
                              '</div>';
      }
      var countEl = document.getElementById('live-channel-count-label');
      if (countEl) {
        countEl.textContent = '...';
      }
    },

    /**
     * Render empty state notice with contextual error messaging (Section 6 & 20).
     * @param {string} stateCode
     * @param {string} [detailMessage]
     */
    renderEmptyState: function (stateCode, detailMessage) {
      var container = document.getElementById('live-channels-container');
      var catContainer = document.getElementById('live-categories-list');
      var I18n = window.FreeIPTV.I18n;

      if (catContainer && (stateCode === 'NO_PROVIDER' || stateCode === 'AUTH_FAILURE' || stateCode === 'CONNECTION_FAILURE')) {
        catContainer.innerHTML = '';
      }

      var title = 'No channels found';
      var sub = 'Try selecting another category or changing your search query.';

      switch (stateCode) {
        case 'NO_PROVIDER':
          title = I18n ? I18n.t('live.state_no_provider') : 'No IPTV playlist configured.';
          sub = I18n ? I18n.t('live.state_no_provider_sub') : 'Please add an IPTV playlist to begin.';
          break;
        case 'AUTH_FAILURE':
          title = I18n ? I18n.t('live.state_auth_failure') : 'Unable to connect to IPTV provider.';
          sub = detailMessage || (I18n ? I18n.t('live.state_auth_failure_sub') : 'Authentication failed. Please verify your username and password.');
          break;
        case 'CONNECTION_FAILURE':
          title = I18n ? I18n.t('live.state_connection_failure') : 'Unable to connect to IPTV provider.';
          sub = detailMessage || (I18n ? I18n.t('live.state_connection_failure_sub') : 'Check your internet connection or server host address.');
          break;
        case 'NO_CHANNELS':
          title = I18n ? I18n.t('live.state_no_channels') : 'No live TV channels were returned by this provider.';
          sub = I18n ? I18n.t('live.state_no_channels_sub') : 'The provider account has no live broadcast channels.';
          break;
        case 'NORMALIZATION_FAILURE':
          title = I18n ? I18n.t('live.state_norm_failure') : 'Provider returned data, but no playable channels could be loaded.';
          sub = I18n ? I18n.t('live.state_norm_failure_sub') : 'Stream format returned by the provider is unsupported.';
          break;
        default:
          if (detailMessage) {
            title = detailMessage;
            sub = '';
          }
          break;
      }

      if (container) {
        container.innerHTML = '<div class="channels-empty-notice">' +
                              '  <div class="empty-icon"><svg viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12zM9 10h6v2H9z"/></svg></div>' +
                              '  <p class="empty-title">' + title + '</p>' +
                              (sub ? '<p class="empty-sub">' + sub + '</p>' : '') +
                              '</div>';
      }

      var countEl = document.getElementById('live-channel-count-label');
      if (countEl) {
        var tmpl = I18n ? I18n.t('live.channel_count') : '{count} Channels';
        countEl.textContent = tmpl.replace('{count}', '0');
      }

      this.renderEpgPlaceholder();
    }
  };

  window.FreeIPTV.LiveTV = LiveTV;
})(window);
