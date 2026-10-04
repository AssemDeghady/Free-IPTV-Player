/**
 * Free IPTV Player — Unified Favorites View Controller
 * Manages favorites across Live Channels, Movies (VOD), and TV Series with type tabs.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var activeTab = 'all'; // 'all' | 'live' | 'movie' | 'series'
  var allFavorites = [];

  var Favorites = {
    /**
     * Initialize Favorites view controller.
     */
    init: function () {
      this.bindEvents();

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('Favorites View Controller initialized.');
      }
    },

    /**
     * Bind UI and routing events.
     */
    bindEvents: function () {
      var self = this;
      var tabs = document.querySelectorAll('.favorites-tab-btn');

      for (var i = 0; i < tabs.length; i++) {
        tabs[i].addEventListener('click', function (e) {
          var targetTab = e.currentTarget.getAttribute('data-tab');
          self.selectTab(targetTab, e.currentTarget);
        });
      }

      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.VIEW_CHANGED, function (data) {
          if (data && data.route === 'favorites') {
            self.onEnterView();
          }
        });

        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.FAVORITES_UPDATED, function () {
          self.loadFavorites();
        });
      }
    },

    /**
     * Called when user enters Favorites view.
     */
    onEnterView: function () {
      this.loadFavorites();
    },

    /**
     * Switch active favorites tab.
     * @param {string} tab
     * @param {HTMLElement} tabEl
     */
    selectTab: function (tab, tabEl) {
      activeTab = tab || 'all';

      var tabs = document.querySelectorAll('.favorites-tab-btn');
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
      }

      if (tabEl) {
        tabEl.classList.add('active');
      }

      this.renderGrid();
    },

    /**
     * Load favorites from PlaylistManager.
     */
    loadFavorites: function () {
      var self = this;
      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      if (!PlaylistManager) return;

      allFavorites = PlaylistManager.getFavorites('all') || [];
      self.renderGrid();
    },

    /**
     * Filter and render items into the favorites grid.
     */
    renderGrid: function () {
      var container = document.getElementById('favorites-grid-container');
      if (!container) return;

      var I18n = window.FreeIPTV.I18n;
      var items = allFavorites;

      if (activeTab !== 'all') {
        items = allFavorites.filter(function (item) {
          return item.contentType === activeTab;
        });
      }

      container.innerHTML = '';

      if (!items || items.length === 0) {
        this.renderEmptyState();
        return;
      }

      var self = this;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var card = this.createCard(item, i);
        container.appendChild(card);
      }
    },

    /**
     * Create a card element for a favorite item.
     * @param {Object} item
     * @param {number} index
     * @returns {HTMLElement}
     */
    createCard: function (item, index) {
      var self = this;
      var card = document.createElement('button');
      card.className = 'favorite-card focusable';
      card.setAttribute('data-nav-zone', 'favorites_grid');
      card.setAttribute('data-content-type', item.contentType);
      card.setAttribute('data-content-id', item.contentId);
      card.setAttribute('data-index', String(index));

      // Media / Poster container
      var mediaWrap = document.createElement('div');
      mediaWrap.className = 'favorite-card-media';

      var fallback = document.createElement('div');
      fallback.className = 'favorite-card-fallback';
      var svgIcon = '<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
      fallback.innerHTML = svgIcon;

      var posterUrl = item.posterUrl || item.poster || item.cover || item.logoUrl || item.streamIcon || '';
      if (posterUrl) {
        var img = document.createElement('img');
        img.src = posterUrl;
        img.alt = '';
        img.loading = 'lazy';
        img.onerror = function () {
          this.style.display = 'none';
          fallback.style.display = 'flex';
        };
        mediaWrap.appendChild(img);
        fallback.style.display = 'none';
      }
      mediaWrap.appendChild(fallback);

      // Type Badge (LIVE, MOVIE, SERIES)
      var badge = document.createElement('div');
      badge.className = 'favorite-type-badge badge-' + item.contentType;
      badge.textContent = item.contentType.toUpperCase();
      mediaWrap.appendChild(badge);

      // Info container
      var infoWrap = document.createElement('div');
      infoWrap.className = 'favorite-card-info';

      var title = document.createElement('div');
      title.className = 'favorite-card-title';
      title.textContent = item.title || item.name || 'Untitled';

      var sub = document.createElement('div');
      sub.className = 'favorite-card-sub';
      sub.textContent = item.groupTitle || (item.year ? String(item.year) : '');

      infoWrap.appendChild(title);
      infoWrap.appendChild(sub);

      card.appendChild(mediaWrap);
      card.appendChild(infoWrap);

      card.addEventListener('click', function () {
        self.handleItemAction(item);
      });

      return card;
    },

    /**
     * Handle click on favorite item.
     * @param {Object} item
     */
    handleItemAction: function (item) {
      if (item.contentType === 'live') {
        if (window.FreeIPTV.Player) {
          // Find full channel if possible
          var channel = {
            id: item.contentId,
            name: item.title || item.name,
            streamUrl: item.streamUrl,
            logoUrl: item.posterUrl || item.poster || item.logoUrl,
            groupTitle: item.groupTitle
          };
          window.FreeIPTV.Player.playChannel(channel, [channel]);
        }
      } else if (item.contentType === 'movie') {
        if (window.FreeIPTV.Movies) {
          var movieObj = {
            id: item.contentId,
            streamId: item.contentId,
            name: item.title || item.name,
            posterUrl: item.posterUrl || item.poster || item.cover || '',
            poster: item.posterUrl || item.poster || item.cover || '',
            streamUrl: item.streamUrl,
            categoryName: item.categoryName,
            rating: item.rating,
            year: item.year,
            containerExtension: item.containerExtension || 'mp4'
          };
          window.FreeIPTV.Movies.openMovieDetails(movieObj, 'favorites');
        }
      } else if (item.contentType === 'series') {
        if (window.FreeIPTV.Series) {
          var seriesObj = {
            id: item.contentId,
            seriesId: item.contentId,
            name: item.title || item.name,
            posterUrl: item.posterUrl || item.poster || item.cover || '',
            poster: item.posterUrl || item.poster || item.cover || '',
            cover: item.posterUrl || item.poster || item.cover || '',
            rating: item.rating,
            releaseDate: item.releaseDate
          };
          window.FreeIPTV.Series.openSeriesDetails(seriesObj, 'favorites');
        }
      }
    },

    /**
     * Render empty favorites state.
     */
    renderEmptyState: function () {
      var container = document.getElementById('favorites-grid-container');
      if (!container) return;
      var I18n = window.FreeIPTV.I18n;

      container.innerHTML = '<div class="favorites-empty-prompt">' +
        '<div class="favorites-empty-icon">' +
        '<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>' +
        '</div>' +
        '<div class="favorites-empty-title">' + (I18n ? I18n.t('favorites.empty_title') : 'No favorites yet') + '</div>' +
        '<div class="favorites-empty-sub">' + (I18n ? I18n.t('favorites.empty_sub') : 'Mark channels, movies, and series as favorites to quickly access them here.') + '</div>' +
        '</div>';
    }
  };

  window.FreeIPTV.Favorites = Favorites;
})(window);
