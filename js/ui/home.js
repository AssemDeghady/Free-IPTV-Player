/**
 * Free IPTV Player — Home View Controller
 * Manages Home view interactions, dashboard rows (Continue Watching, Recent, Quick Actions),
 * sidebar routing, and view switching.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var Home = {
    /**
     * Initialize Home View.
     */
    init: function () {
      this.bindSidebarEvents();
      this.bindActionEvents();
      this.bindDataEvents();
      this.renderDashboard();

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('Home View initialized.');
      }
    },

    /**
     * Bind data change events to refresh dashboard.
     */
    bindDataEvents: function () {
      var self = this;

      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYLIST_ACTIVE_CHANGED, function () {
          self.renderDashboard();
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYLIST_UPDATED, function () {
          self.renderDashboard();
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.HISTORY_UPDATED, function () {
          self.renderDashboard();
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.VIEW_CHANGED, function (data) {
          if (data && data.route === 'home') {
            self.renderDashboard();
          }
        });
      }
    },

    /**
     * Render the Home dashboard based on active playlist status.
     */
    renderDashboard: function () {
      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      var activePlaylist = PlaylistManager ? PlaylistManager.getActivePlaylist() : null;

      var onboardingArea = document.getElementById('home-onboarding-area');
      var emptyCard = document.getElementById('home-empty-card');
      var dashboardContent = document.getElementById('home-dashboard-content');
      var btnAddPlaylist = document.getElementById('btn-add-playlist');

      if (!activePlaylist) {
        if (onboardingArea) onboardingArea.classList.remove('hidden');
        if (emptyCard) emptyCard.classList.remove('hidden');
        if (dashboardContent) dashboardContent.classList.add('hidden');
        if (btnAddPlaylist) btnAddPlaylist.style.display = 'inline-flex';
        return;
      }

      if (onboardingArea) onboardingArea.classList.add('hidden');
      if (emptyCard) emptyCard.classList.add('hidden');
      if (dashboardContent) dashboardContent.classList.remove('hidden');
      if (btnAddPlaylist) btnAddPlaylist.style.display = 'none';

      var bannerEl = document.getElementById('home-provider-banner');
      if (bannerEl) bannerEl.innerHTML = '';
      var actionsEl = document.getElementById('home-quick-actions-row');
      if (actionsEl) actionsEl.innerHTML = '';
      this.renderQuickAccess(activePlaylist);
      this.renderContinueWatching();
      this.renderRecentlyWatched();
    },

    /**
     * Render the active provider banner with metadata and content counts.
     * @param {Object} playlist
     */
    renderProviderBanner: function (playlist) {
      var banner = document.getElementById('home-provider-banner');
      if (!banner) return;

      var I18n = window.FreeIPTV.I18n;
      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      var typeLabel = playlist.type === 'xtream' ? 'Xtream Codes' : 'M3U Playlist';
      var liveCount = playlist.liveCount !== undefined ? playlist.liveCount : (playlist.channelCount !== undefined ? playlist.channelCount : 0);
      var movieCount = playlist.movieCount || 0;
      var seriesCount = playlist.seriesCount || 0;
      var formatCount = (PlaylistManager && PlaylistManager.formatChannelCount) ? PlaylistManager.formatChannelCount : function (n) { return n; };
      var playlistName = (PlaylistManager && PlaylistManager.getDisplayName) ? PlaylistManager.getDisplayName(playlist) : playlist.name;

      var html = '';
      html += '<div class="home-banner-card">';
      html += '  <div class="home-banner-info">';
      html += '    <div class="home-banner-type-badge">' + typeLabel + '</div>';
      html += '    <h2 class="home-banner-title">' + this.escapeHtml(playlistName) + '</h2>';
      html += '    <div class="home-banner-stats">';
      html += '      <span class="home-stat-pill"><strong id="home-stat-channels-val">' + formatCount(liveCount) + '</strong> ' + (I18n ? I18n.t('home.stat_channels') : 'Channels') + '</span>';
      if (movieCount > 0) {
        html += '      <span class="home-stat-pill"><strong>' + formatCount(movieCount) + '</strong> ' + (I18n ? I18n.t('home.stat_movies') : 'Movies') + '</span>';
      }
      if (seriesCount > 0) {
        html += '      <span class="home-stat-pill"><strong>' + formatCount(seriesCount) + '</strong> ' + (I18n ? I18n.t('home.stat_series') : 'Series') + '</span>';
      }
      html += '    </div>';
      html += '  </div>';
      html += '</div>';

      banner.innerHTML = html;

      // Authoritative count resolution
      if (PlaylistManager && PlaylistManager.getChannelCount) {
        PlaylistManager.getChannelCount(playlist.id).then(function (verifiedCount) {
          var valEl = document.getElementById('home-stat-channels-val');
          if (valEl) {
            valEl.textContent = formatCount(verifiedCount);
          }
        }).catch(function () {});
      }
    },

    /**
     * Render Quick Access primary navigation cards on the Home screen.
     * @param {Object} playlist
     */
    renderQuickAccess: function (playlist) {
      var container = document.getElementById('home-quick-access-section');
      if (!container) return;

      var I18n = window.FreeIPTV.I18n;
      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      var formatCount = (PlaylistManager && PlaylistManager.formatChannelCount) ? PlaylistManager.formatChannelCount : function (n) { return n; };

      var liveCount = playlist ? (playlist.liveCount !== undefined ? playlist.liveCount : (playlist.channelCount !== undefined ? playlist.channelCount : 0)) : 0;
      var movieCount = playlist ? (playlist.movieCount || 0) : 0;
      var seriesCount = playlist ? (playlist.seriesCount || 0) : 0;
      var favCount = PlaylistManager ? PlaylistManager.getFavorites().length : 0;
      var playlistCount = PlaylistManager ? PlaylistManager.getPlaylists().length : 0;

      var html = '';
      html += '<div class="home-section-header">';
      html += '  <h3 class="home-section-title">' + (I18n ? I18n.t('home.quick_access') : 'Quick Access') + '</h3>';
      html += '</div>';

      html += '<div class="home-quick-access-grid" role="region" aria-label="Quick Access Navigation">';

      // 1. Live TV
      html += '<button class="home-quick-card card-live focusable" data-nav-zone="home_quick_access" data-route-target="live_tv" data-initial-focus="true" aria-label="Live TV">';
      html += '  <div class="quick-card-icon-wrap icon-live">';
      html += '    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg>';
      html += '  </div>';
      html += '  <div class="quick-card-info">';
      html += '    <span class="quick-card-title">' + (I18n ? I18n.t('nav.live_tv') : 'Live TV') + '</span>';
      html += '    <span class="quick-card-badge" id="quick-badge-live">' + (liveCount > 0 ? formatCount(liveCount) + ' ' + (I18n ? I18n.t('home.stat_channels') : 'Channels') : 'Watch Live') + '</span>';
      html += '  </div>';
      html += '</button>';

      // 2. Movies
      html += '<button class="home-quick-card card-movies focusable" data-nav-zone="home_quick_access" data-route-target="movies" aria-label="Movies">';
      html += '  <div class="quick-card-icon-wrap icon-movies">';
      html += '    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>';
      html += '  </div>';
      html += '  <div class="quick-card-info">';
      html += '    <span class="quick-card-title">' + (I18n ? I18n.t('nav.movies') : 'Movies') + '</span>';
      html += '    <span class="quick-card-badge" id="quick-badge-movies">' + (movieCount > 0 ? formatCount(movieCount) + ' ' + (I18n ? I18n.t('home.stat_movies') : 'Movies') : 'VOD Films') + '</span>';
      html += '  </div>';
      html += '</button>';

      // 3. Series
      html += '<button class="home-quick-card card-series focusable" data-nav-zone="home_quick_access" data-route-target="series" aria-label="Series">';
      html += '  <div class="quick-card-icon-wrap icon-series">';
      html += '    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>';
      html += '  </div>';
      html += '  <div class="quick-card-info">';
      html += '    <span class="quick-card-title">' + (I18n ? I18n.t('nav.series') : 'Series') + '</span>';
      html += '    <span class="quick-card-badge" id="quick-badge-series">' + (seriesCount > 0 ? formatCount(seriesCount) + ' ' + (I18n ? I18n.t('home.stat_series') : 'Series') : 'TV Shows') + '</span>';
      html += '  </div>';
      html += '</button>';

      // 4. Favorites
      html += '<button class="home-quick-card card-favorites focusable" data-nav-zone="home_quick_access" data-route-target="favorites" aria-label="Favorites">';
      html += '  <div class="quick-card-icon-wrap icon-favorites">';
      html += '    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
      html += '  </div>';
      html += '  <div class="quick-card-info">';
      html += '    <span class="quick-card-title">' + (I18n ? I18n.t('nav.favorites') : 'Favorites') + '</span>';
      html += '    <span class="quick-card-badge">' + (favCount > 0 ? favCount + ' Saved' : 'Bookmarked') + '</span>';
      html += '  </div>';
      html += '</button>';

      // 5. Playlists
      html += '<button class="home-quick-card card-playlists focusable" data-nav-zone="home_quick_access" data-route-target="playlists" aria-label="Playlists">';
      html += '  <div class="quick-card-icon-wrap icon-playlists">';
      html += '    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12zm-7-2h2v-4h4V8h-4V4h-2v4H9v2h4v4z"/></svg>';
      html += '  </div>';
      html += '  <div class="quick-card-info">';
      html += '    <span class="quick-card-title">' + (I18n ? I18n.t('nav.playlists') : 'Playlists') + '</span>';
      html += '    <span class="quick-card-badge">' + (playlistCount > 0 ? playlistCount + ' Active' : 'Manage') + '</span>';
      html += '  </div>';
      html += '</button>';

      html += '</div>';

      container.innerHTML = html;

      // Bind clicks to switchView
      var self = this;
      var cards = container.querySelectorAll('.home-quick-card');
      for (var c = 0; c < cards.length; c++) {
        cards[c].addEventListener('click', function (e) {
          var targetRoute = e.currentTarget.getAttribute('data-route-target');
          self.switchView(targetRoute);
        });
      }
    },

    /**
     * Set focus to the first interactive element of a target view.
     * @param {string} route
     */
    focusFirstElementInView: function (route) {
      setTimeout(function () {
        var viewEl = document.getElementById('view-' + route) ||
                     document.getElementById('view-' + route.replace(/_/g, '-')) ||
                     document.getElementById('view-' + route.replace(/-/g, '_'));
        if (!viewEl) return;

        var firstFocusable = null;
        if (route === 'live_tv' || route === 'live-tv' || route === 'movies' || route === 'series') {
          var catPrefix = (route === 'live_tv' || route === 'live-tv') ? 'live' : route;
          firstFocusable = viewEl.querySelector('#' + catPrefix + '-categories-list .category-item.active') ||
                           viewEl.querySelector('#' + catPrefix + '-categories-list .category-item.focusable') ||
                           viewEl.querySelector('#' + catPrefix + '-categories-list .focusable');
        }

        if (route === 'movies' || route === 'series') {
          // If categories are already loaded, focus "Recently Added" then "All". Otherwise, focus the screen title as a neutral non-input resting anchor.
          firstFocusable = viewEl.querySelector('#' + route + '-categories-list .category-item[data-category="recently_added"]') ||
                           viewEl.querySelector('#' + route + '-categories-list .category-item[data-category="all"]') ||
                           viewEl.querySelector('#' + route + '-screen-title');
        }

        if (!firstFocusable) {
          firstFocusable = viewEl.querySelector('.focusable.active:not(input)') ||
                           viewEl.querySelector('.focusable:not([tabindex="-1"]):not(input)');
        }

        if (firstFocusable && window.FreeIPTV.Navigation) {
          window.FreeIPTV.Navigation.focus(firstFocusable);
        }
      }, 50);
    },

    /**
     * Render "Continue Watching" row (deprecated - combined into Recently Watched).
     */
    renderContinueWatching: function () {
      var container = document.getElementById('home-continue-watching-section');
      if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
      }
    },

    /**
     * Render unified "Recently Watched" row.
     */
    renderRecentlyWatched: function () {
      var container = document.getElementById('home-recent-section');
      if (!container) return;

      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      var historyItems = PlaylistManager ? PlaylistManager.getWatchHistory(10) : [];
      var continueItems = PlaylistManager ? PlaylistManager.getContinueWatching() : [];

      // Combine continue watching and recent history, prioritizing items with resume progress
      var map = {};
      var combined = [];

      (continueItems || []).forEach(function (item) {
        var id = item.contentId || item.id;
        if (id && !map[id]) {
          map[id] = true;
          combined.push(item);
        }
      });

      (historyItems || []).forEach(function (item) {
        var id = item.contentId || item.id;
        if (id && !map[id]) {
          map[id] = true;
          combined.push(item);
        }
      });

      if (combined.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
      }

      container.style.display = 'block';
      var I18n = window.FreeIPTV.I18n;

      var html = '<div class="home-section-header home-row-header">';
      html += '  <h3 class="home-section-title home-row-title">' + (I18n ? I18n.t('home.recently_watched') : 'Recently Watched') + '</h3>';
      html += '</div>';
      html += '<div class="home-row-grid" id="home-recent-grid"></div>';

      container.innerHTML = html;
      var grid = document.getElementById('home-recent-grid');

      for (var i = 0; i < Math.min(combined.length, 10); i++) {
        var card = this.createMediaCard(combined[i], true);
        grid.appendChild(card);
      }
    },

    /**
     * Create a media card DOM element for dashboard rows.
     * @param {Object} item
     * @param {boolean} showProgress
     * @returns {HTMLElement}
     */
    createMediaCard: function (item, showProgress) {
      var card = document.createElement('button');
      card.className = 'home-media-card focusable';
      card.setAttribute('data-nav-zone', 'home_recent');
      card.setAttribute('data-content-type', item.contentType);
      card.setAttribute('data-content-id', item.contentId);

      var mediaBox = document.createElement('div');
      mediaBox.className = 'home-card-media';

      var fallback = document.createElement('div');
      fallback.className = 'home-card-fallback';
      fallback.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';

      var posterUrl = item.posterUrl || item.poster || item.logoUrl || item.thumbnailUrl || item.cover || '';
      if (posterUrl) {
        var img = document.createElement('img');
        img.src = posterUrl;
        img.alt = '';
        img.onerror = function () {
          this.style.display = 'none';
          var fb = document.createElement('div');
          fb.className = 'home-card-fallback';
          fb.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
          mediaBox.appendChild(fb);
        };
        mediaBox.appendChild(img);
      } else {
        var fallback = document.createElement('div');
        fallback.className = 'home-card-fallback';
        fallback.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
        mediaBox.appendChild(fallback);
      }

      // Progress bar if requested
      if (showProgress && item.durationSec > 0 && item.positionSec > 0) {
        var pct = Math.min(100, Math.max(0, (item.positionSec / item.durationSec) * 100));
        var pWrap = document.createElement('div');
        pWrap.className = 'home-card-progress-wrap';
        var pBar = document.createElement('div');
        pBar.className = 'home-card-progress-bar';
        pBar.style.width = pct.toFixed(1) + '%';
        pWrap.appendChild(pBar);
        mediaBox.appendChild(pWrap);
      }

      var infoBox = document.createElement('div');
      infoBox.className = 'home-card-info';

      var title = document.createElement('div');
      title.className = 'home-card-title';
      title.textContent = item.title || 'Untitled';

      var sub = document.createElement('div');
      sub.className = 'home-card-sub';
      sub.textContent = item.subtitle || (item.contentType ? item.contentType.toUpperCase() : '');

      infoBox.appendChild(title);
      infoBox.appendChild(sub);

      card.appendChild(mediaBox);
      card.appendChild(infoBox);

      card.addEventListener('click', function () {
        if (item.contentType === 'live' && window.FreeIPTV.Player) {
          window.FreeIPTV.Player.playChannel({
            id: item.contentId,
            name: item.title,
            streamUrl: item.streamUrl,
            logoUrl: item.posterUrl || item.poster || item.logoUrl
          });
        } else if (item.contentType === 'movie' && window.FreeIPTV.Player) {
          var resumePos = (item.positionSec || 0) * 1000;
          window.FreeIPTV.Player.playMovie({
            streamId: item.contentId,
            id: item.contentId,
            name: item.title,
            posterUrl: item.posterUrl || item.poster || '',
            poster: item.posterUrl || item.poster || '',
            streamUrl: item.streamUrl
          }, resumePos);
        } else if (item.contentType === 'episode' && window.FreeIPTV.Player) {
          var epResume = (item.positionSec || 0) * 1000;
          window.FreeIPTV.Player.playEpisode({
            seriesId: item.seriesId,
            id: item.seriesId,
            name: item.title,
            posterUrl: item.posterUrl || item.poster || '',
            poster: item.posterUrl || item.poster || ''
          }, item.seasonNumber || 1, {
            id: item.contentId,
            title: item.subtitle,
            streamUrl: item.streamUrl
          }, epResume);
        }
      });

      return card;
    },

    /**
     * Render quick action navigation buttons.
     * @param {Object} playlist
     */
    renderQuickActions: function (playlist) {
      var container = document.getElementById('home-quick-actions-row');
      if (!container) return;

      var I18n = window.FreeIPTV.I18n;
      var html = '<div class="home-section-header home-row-header"><h3 class="home-section-title home-row-title">' +
        (I18n ? I18n.t('home.browse_content') : 'Browse Content') +
        '</h3></div><div class="home-actions-grid">';

      // 1. Live TV
      html += '<button class="home-action-btn focusable" data-nav-zone="main" data-route-target="live_tv">';
      html += '  <div class="home-action-icon"><svg viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg></div>';
      html += '  <div class="home-action-label">' + (I18n ? I18n.t('nav.live_tv') : 'Live TV') + '</div>';
      html += '</button>';

      // 2. Movies
      if (playlist.type === 'xtream') {
        html += '<button class="home-action-btn focusable" data-nav-zone="main" data-route-target="movies">';
        html += '  <div class="home-action-icon"><svg viewBox="0 0 24 24"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg></div>';
        html += '  <div class="home-action-label">' + (I18n ? I18n.t('nav.movies') : 'Movies') + '</div>';
        html += '</button>';

        // 3. Series
        html += '<button class="home-action-btn focusable" data-nav-zone="main" data-route-target="series">';
        html += '  <div class="home-action-icon"><svg viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg></div>';
        html += '  <div class="home-action-label">' + (I18n ? I18n.t('nav.series') : 'Series') + '</div>';
        html += '</button>';
      }

      // 4. Favorites
      html += '<button class="home-action-btn focusable" data-nav-zone="main" data-route-target="favorites">';
      html += '  <div class="home-action-icon"><svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></div>';
      html += '  <div class="home-action-label">' + (I18n ? I18n.t('nav.favorites') : 'Favorites') + '</div>';
      html += '</button>';

      // 5. Playlists (Phase 5.3)
      html += '<button class="home-action-btn focusable" data-nav-zone="main" data-route-target="playlists">';
      html += '  <div class="home-action-icon"><svg viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12zM12 5.5v9l6-4.5-6-4.5z"/></svg></div>';
      html += '  <div class="home-action-label">' + (I18n ? I18n.t('nav.playlists') : 'Playlists') + '</div>';
      html += '</button>';

      html += '</div>';

      container.innerHTML = html;

      // Bind buttons
      var self = this;
      var buttons = container.querySelectorAll('.home-action-btn');
      for (var b = 0; b < buttons.length; b++) {
        buttons[b].addEventListener('click', function (e) {
          var targetRoute = e.currentTarget.getAttribute('data-route-target');
          var navEl = document.querySelector('[data-route="' + targetRoute + '"]');
          if (navEl) {
            navEl.click();
          } else {
            self.switchView(targetRoute);
          }
        });
      }
    },

    /**
     * Bind sidebar menu items to routing / active state updates.
     */
    bindSidebarEvents: function () {
      var sidebarLinks = document.querySelectorAll('.app-sidebar .nav-link');
      var self = this;

      for (var i = 0; i < sidebarLinks.length; i++) {
        sidebarLinks[i].addEventListener('click', function (e) {
          var target = e.currentTarget;
          self.selectNavRoute(target);
        });
      }
    },

    /**
     * Update active navigation state and toggle views.
     * @param {HTMLElement} activeElement
     */
    selectNavRoute: function (activeElement) {
      var sidebarLinks = document.querySelectorAll('.app-sidebar .nav-link');
      for (var i = 0; i < sidebarLinks.length; i++) {
        sidebarLinks[i].classList.remove('active');
      }
      activeElement.classList.add('active');

      var route = activeElement.getAttribute('data-route');
      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('Navigated to route: ' + route);
      }

      this.switchView(route);

      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.VIEW_CHANGED, {
          route: route
        });
      }
    },

    /**
     * Switch visible screen view.
     * @param {string} route
     */
    switchView: function (route) {
      if (!route) return;

      // Clean up obsolete focus from previous view
      var oldFocused = document.querySelectorAll('.focused');
      for (var f = 0; f < oldFocused.length; f++) {
        oldFocused[f].classList.remove('focused');
      }
      if (document.activeElement && document.activeElement !== document.body) {
        try {
          document.activeElement.blur();
        } catch (e) {}
      }

      var views = document.querySelectorAll('.view-screen');
      for (var i = 0; i < views.length; i++) {
        views[i].classList.add('hidden');
        var inactives = views[i].querySelectorAll('.focusable');
        for (var idx = 0; idx < inactives.length; idx++) {
          inactives[idx].setAttribute('tabindex', '-1');
        }
      }

      var targetView = document.getElementById('view-' + route) ||
                       document.getElementById('view-' + route.replace(/_/g, '-')) ||
                       document.getElementById('view-' + route.replace(/-/g, '_'));

      var activeView = targetView;
      if (activeView) {
        activeView.classList.remove('hidden');
      } else {
        var homeView = document.getElementById('view-home');
        if (homeView) {
          homeView.classList.remove('hidden');
          activeView = homeView;
        }
      }

      if (activeView) {
        var actives = activeView.querySelectorAll('.focusable');
        for (var a = 0; a < actives.length; a++) {
          actives[a].setAttribute('tabindex', '0');
        }
      }

      if (window.FreeIPTV.Navigation && typeof window.FreeIPTV.Navigation.setCurrentRoute === 'function') {
        window.FreeIPTV.Navigation.setCurrentRoute(route);
      }

      if (window.FreeIPTV.Navigation && typeof window.FreeIPTV.Navigation.setInitialFocus === 'function') {
        window.FreeIPTV.Navigation.setInitialFocus(route);
      }

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('ROUTE SWITCH: ' + route);
      }

      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.VIEW_CHANGED, {
          route: route
        });
      }
    },

    /**
     * Bind CTA button events (Add Playlist, Search, Settings).
     */
    bindActionEvents: function () {
      var self = this;
      var addPlaylistBtn = document.getElementById('btn-add-playlist');
      if (addPlaylistBtn) {
        addPlaylistBtn.addEventListener('click', function () {
          if (window.FreeIPTV.Modal) {
            window.FreeIPTV.Modal.showAddPlaylist();
          }
        });
      }

      var learnMoreBtn = document.getElementById('btn-learn-more');
      if (learnMoreBtn) {
        learnMoreBtn.addEventListener('click', function () {
          self.switchView('settings');
        });
      }

      // Header Active Playlist pill -> Route to Playlists View
      var headerPlaylistBtn = document.getElementById('header-active-playlist');
      if (headerPlaylistBtn) {
        headerPlaylistBtn.addEventListener('click', function () {
          var playlistNav = document.querySelector('[data-route="playlists"]');
          if (playlistNav) {
            playlistNav.click();
          } else {
            self.switchView('playlists');
          }
        });
      }

      // Header Search button -> Route to Global Search
      var btnSearch = document.getElementById('btn-header-search');
      if (btnSearch) {
        btnSearch.addEventListener('click', function (e) {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          var navRoute = window.FreeIPTV.Navigation ? window.FreeIPTV.Navigation.getCurrentRoute() : null;
          if (self.currentRoute === 'search' || navRoute === 'search') {
            return;
          }
          self.switchView('search');
        });
      }

      // Header Settings button
      var btnSettings = document.getElementById('btn-header-settings');
      if (btnSettings) {
        btnSettings.addEventListener('click', function (e) {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          var navRoute = window.FreeIPTV.Navigation ? window.FreeIPTV.Navigation.getCurrentRoute() : null;
          if (self.currentRoute === 'settings' || navRoute === 'settings') {
            return;
          }
          self.switchView('settings');
        });
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

  window.FreeIPTV.Home = Home;
})(window);
