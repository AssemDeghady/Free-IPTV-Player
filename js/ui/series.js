/**
 * Free IPTV Player — Series View Controller
 * TV-first series poster grid, category filtering, seasons navigation, and episode playback.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var activeCategory = 'all';
  var allSeries = [];
  var filteredSeries = [];
  var currentSearchQuery = '';
  var categorySearchQuery = '';
  var rawCategories = [];
  var renderedCount = 0;
  var CHUNK_SIZE = 30; // Batch size for TV performance
  var selectedSeries = null;
  var activeSeasonNumber = 1;
  var currentSeriesDetails = null;
  var availableSeasons = [];
  var isDetailsOpen = false;
  var isDropdownOpen = false;
  var originRoute = 'series';
  var previousFocusedElement = null;

  var Series = {
    /**
     * Initialize Series view.
     */
    init: function () {
      this.bindEvents();
      this.bindDetailsModalEvents();

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('Series View initialized.');
      }
    },

    /**
     * Bind view changes and search events.
     */
    bindEvents: function () {
      var self = this;

      var searchInput = document.getElementById('series-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', function (e) {
          self.setSearchQuery(e.target.value);
        });
      }

      var catSearchInput = document.getElementById('series-category-search-input');
      if (catSearchInput) {
        catSearchInput.addEventListener('input', function (e) {
          self.setCategorySearchQuery(e.target.value);
        });
      }

      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.VIEW_CHANGED, function (data) {
          if (data && data.route === 'series') {
            self.onEnterView();
          }
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYLIST_ACTIVE_CHANGED, function () {
          var input = document.getElementById('series-category-search-input');
          if (input) input.value = '';
          self.categorySearchQuery = '';
          self.loadActiveSeries();
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYLIST_UPDATED, function () {
          self.loadActiveSeries();
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.SERIES_UPDATED, function () {
          self.loadActiveSeries();
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.FAVORITES_UPDATED, function () {
          self.updateFavoritesState();
        });
      }
    },

    /**
     * Called when user enters Series screen.
     */
    onEnterView: function () {
      this.loadActiveSeries();
    },

    /**
     * Load Series for active playlist.
     */
    loadActiveSeries: function () {
      var self = this;
      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      if (!PlaylistManager) return;

      var activePlaylist = PlaylistManager.getActivePlaylist();
      if (!activePlaylist) {
        self.renderEmptyState('No active playlist configured. Please add an IPTV playlist to begin.');
        return;
      }

      var container = document.getElementById('series-grid-container');
      if (container && (!allSeries || allSeries.length === 0)) {
        container.innerHTML = '<div class="channels-empty-notice"><div class="loading-spinner"></div><p class="empty-title">Loading Series...</p></div>';
      }

      PlaylistManager.loadSeries(activePlaylist.id).then(function (result) {
        allSeries = result.series || [];
        rawCategories = result.categories || [];
        self.renderCategories(rawCategories);
        self.applyFilter();
      }).catch(function (err) {
        self.renderEmptyState('Unable to load series: ' + (err.message || 'Error'));
      });
    },

    categorySearchQuery: '',

    /**
     * Update category search query and filter categories.
     * @param {string} query
     */
    setCategorySearchQuery: function (query) {
      this.categorySearchQuery = (query || '').trim().toLowerCase();
      this.renderCategories();
    },

    /**
     * Render the categories column.
     * @param {Array<string>} [categories]
     */
    renderCategories: function (categories) {
      var container = document.getElementById('series-categories-list');
      if (!container) return;

      if (categories && Array.isArray(categories)) {
        rawCategories = categories;
      }
      var cats = rawCategories || [];

      container.innerHTML = '';
      var self = this;
      var q = (this.categorySearchQuery || '').trim().toLowerCase();

      // 1. "All Series" Category (shown when no search query or when 'all' matches)
      if (!q || 'all series'.indexOf(q) !== -1 || 'all'.indexOf(q) !== -1) {
        var allItem = document.createElement('button');
        allItem.className = 'category-item focusable' + (activeCategory === 'all' ? ' active' : '');
        allItem.setAttribute('data-nav-zone', 'series_categories');
        allItem.setAttribute('data-category', 'all');

        var allLabel = document.createElement('span');
        allLabel.textContent = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('series.all_series') : 'All Series';
        var allCount = document.createElement('span');
        allCount.className = 'category-count';
        allCount.textContent = String(allSeries.length);

        allItem.appendChild(allLabel);
        allItem.appendChild(allCount);

        allItem.addEventListener('click', function () {
          self.selectCategory('all', allItem);
        });
        container.appendChild(allItem);
      }

      // 2. Provider categories filtered by category quick filter
      var filteredCats = cats;
      if (q) {
        filteredCats = cats.filter(function (cat) {
          var name = typeof cat === 'object' ? (cat.category_name || cat.name || '') : String(cat || '');
          return name.toLowerCase().indexOf(q) !== -1;
        });
      }

      for (var i = 0; i < filteredCats.length; i++) {
        var cat = filteredCats[i];
        var catName = typeof cat === 'object' ? (cat.category_name || cat.name || '') : String(cat || '');
        var catItem = document.createElement('button');
        catItem.className = 'category-item focusable' + (activeCategory === catName ? ' active' : '');
        catItem.setAttribute('data-nav-zone', 'series_categories');
        catItem.setAttribute('data-category', catName);

        var label = document.createElement('span');
        label.textContent = catName;

        catItem.appendChild(label);

        (function (name, itemEl) {
          itemEl.addEventListener('click', function () {
            self.selectCategory(name, itemEl);
          });
        })(catName, catItem);

        container.appendChild(catItem);
      }
    },

    /**
     * Select a category.
     * @param {string} category
     * @param {HTMLElement} itemEl
     */
    selectCategory: function (category, itemEl) {
      activeCategory = category;

      var items = document.querySelectorAll('#series-categories-list .category-item');
      for (var i = 0; i < items.length; i++) {
        items[i].classList.remove('active');
      }
      if (itemEl) {
        itemEl.classList.add('active');
      }

      this.applyFilter();
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
     * Filter series and render grid.
     */
    applyFilter: function () {
      var q = currentSearchQuery.trim().toLowerCase();
      var cat = activeCategory;

      filteredSeries = allSeries.filter(function (s) {
        if (cat !== 'all' && s.categoryName !== cat) {
          return false;
        }
        if (!q) return true;
        var nameMatch = s.name && s.name.toLowerCase().indexOf(q) !== -1;
        var genreMatch = s.genre && s.genre.toLowerCase().indexOf(q) !== -1;
        var castMatch = s.cast && s.cast.toLowerCase().indexOf(q) !== -1;
        return nameMatch || genreMatch || castMatch;
      });

      var countLabel = document.getElementById('series-count-label');
      if (countLabel) {
        var tmpl = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('series.series_count') : '';
        if (!tmpl || tmpl === 'series.series_count' || tmpl.indexOf('{count}') === -1) {
          tmpl = '{count} Series';
        }
        countLabel.textContent = tmpl.replace('{count}', filteredSeries.length);
      }

      this.renderGrid(true);
    },

    /**
     * Render chunk of series cards into grid.
     * @param {boolean} reset
     */
    renderGrid: function (reset) {
      var container = document.getElementById('series-grid-container');
      if (!container) return;

      if (reset) {
        container.innerHTML = '';
        renderedCount = 0;
      }

      if (filteredSeries.length === 0) {
        var emptyMsg = document.createElement('div');
        emptyMsg.className = 'channels-empty-notice';
        emptyMsg.innerHTML = '<p class="empty-title">' + (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('series.no_series') : 'No series found') + '</p>' +
                             '<p class="empty-sub">' + (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('series.no_series_sub') : 'Try selecting another category or changing your search query.') + '</p>';
        container.appendChild(emptyMsg);
        return;
      }

      var self = this;
      var endIndex = Math.min(renderedCount + CHUNK_SIZE, filteredSeries.length);

      for (var i = renderedCount; i < endIndex; i++) {
        var series = filteredSeries[i];
        var card = this.createSeriesCard(series, i);
        container.appendChild(card);
      }

      renderedCount = endIndex;
    },

    /**
     * Create a single series poster card element.
     * @param {Object} series
     * @param {number} index
     * @returns {HTMLElement}
     */
    createSeriesCard: function (series, index) {
      var self = this;
      var card = document.createElement('button');
      card.className = 'movie-card series-card focusable';
      card.setAttribute('data-nav-zone', 'series_grid');
      card.setAttribute('data-series-id', series.id);
      card.setAttribute('data-index', String(index));

      // Poster Container
      var posterBox = document.createElement('div');
      posterBox.className = 'series-poster-wrap series-poster-box';

      var fallbackSvg = document.createElement('div');
      fallbackSvg.className = 'poster-fallback-icon';
      fallbackSvg.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>';

      var posterUrl = series.posterUrl || series.poster || series.cover || series.streamIcon || '';
      if (posterUrl) {
        var img = document.createElement('img');
        img.className = 'movie-poster-img';
        img.alt = '';
        img.loading = 'lazy';
        img.src = posterUrl;

        img.onerror = function () {
          this.style.display = 'none';
          fallbackSvg.style.display = 'flex';
        };

        posterBox.appendChild(img);
        fallbackSvg.style.display = 'none';
      }

      posterBox.appendChild(fallbackSvg);

      // Rating badge if available
      if (series.rating && parseFloat(series.rating) > 0) {
        var ratingBadge = document.createElement('div');
        ratingBadge.className = 'movie-rating-badge';
        ratingBadge.textContent = '★ ' + parseFloat(series.rating).toFixed(1);
        posterBox.appendChild(ratingBadge);
      }

      // Title overlay on cover (clean name only)
      var title = document.createElement('div');
      title.className = 'poster-title-overlay';
      title.textContent = (window.FreeIPTV.cleanTitle ? window.FreeIPTV.cleanTitle(series.name) : series.name);
      posterBox.appendChild(title);

      card.appendChild(posterBox);

      card.addEventListener('click', function () {
        self.openSeriesDetails(series);
      });

      return card;
    },

    /**
     * Check if more series should be loaded on scroll.
     * @param {HTMLElement} focusedElement
     */
    checkLoadMore: function (focusedElement) {
      if (!focusedElement) return;
      var index = parseInt(focusedElement.getAttribute('data-index'), 10);
      if (!isNaN(index) && index >= renderedCount - 8 && renderedCount < filteredSeries.length) {
        this.renderGrid(false);
      }
    },

    // ==========================================
    // SERIES DETAILS MODAL (Seasons & Episodes)
    // ==========================================

    /**
     * Bind click and key events for series details page.
     */
    bindDetailsModalEvents: function () {
      var self = this;

      var btnFav = document.getElementById('btn-series-fav') || document.getElementById('series-btn-fav');
      if (btnFav) {
        btnFav.addEventListener('click', function () {
          if (selectedSeries && window.FreeIPTV.PlaylistManager) {
            var posterUrl = selectedSeries.posterUrl || selectedSeries.poster || selectedSeries.cover || selectedSeries.streamIcon || '';
            var isFav = window.FreeIPTV.PlaylistManager.toggleFavoriteItem({
              providerId: selectedSeries.providerId,
              contentType: 'series',
              contentId: selectedSeries.id,
              title: selectedSeries.name,
              posterUrl: posterUrl,
              poster: posterUrl,
              categoryName: selectedSeries.categoryName
            });
            self.updateDetailsFavoriteButton(isFav);
          }
        });
      }

      var btnSeasonSelector = document.getElementById('btn-season-selector');
      if (btnSeasonSelector) {
        btnSeasonSelector.addEventListener('click', function () {
          self.toggleSeasonDropdown();
        });
      }

      var backBtns = [
        document.getElementById('btn-series-page-back'),
        document.getElementById('btn-series-back'),
        document.getElementById('series-btn-back')
      ];
      for (var b = 0; b < backBtns.length; b++) {
        if (backBtns[b]) {
          backBtns[b].addEventListener('click', function () {
            self.closeSeriesDetails();
          });
        }
      }
    },

    /**
     * Open series details full-page view.
     * @param {Object} series
     * @param {string} [fromRoute] Origin route (series, favorites, search, home)
     */
    openSeriesDetails: function (series, fromRoute) {
      if (!series) return;
      selectedSeries = series;
      isDetailsOpen = true;
      originRoute = fromRoute || (window.FreeIPTV.Navigation && window.FreeIPTV.Navigation.getCurrentRoute ? window.FreeIPTV.Navigation.getCurrentRoute() : 'series');
      if (originRoute === 'series_details') originRoute = 'series';
      previousFocusedElement = window.FreeIPTV.Navigation ? window.FreeIPTV.Navigation.getCurrent() : null;

      var self = this;

      // Close dropdown if open
      this.closeSeasonDropdown(false);

      // Populate header & metadata
      this.populateDetailsUI(series);

      // Switch to full-page series details view
      if (window.FreeIPTV.Home && window.FreeIPTV.Home.switchView) {
        window.FreeIPTV.Home.switchView('series_details');
      } else {
        var view = document.getElementById('view-series_details');
        if (view) view.classList.remove('hidden');
      }

      // Register Back key
      if (window.FreeIPTV.Remote) {
        window.FreeIPTV.Remote.pushBackHandler(function () {
          if (isDropdownOpen) {
            self.closeSeasonDropdown(true);
            return true;
          }
          if (isDetailsOpen) {
            self.closeSeriesDetails();
            return true;
          }
          return false;
        });
      }

      // Check favorite state
      var isFav = window.FreeIPTV.PlaylistManager ? window.FreeIPTV.PlaylistManager.isFavoriteItem(series.id, 'series') : false;
      this.updateDetailsFavoriteButton(isFav);

      // Initial loading state for season dropdown and episodes list
      var seasonLabel = document.getElementById('season-selector-label');
      if (seasonLabel) {
        seasonLabel.textContent = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('series.loading_seasons') : 'Loading seasons...';
      }

      var episodesContainer = document.getElementById('series-episodes-list') || document.getElementById('series-episodes-container');
      if (episodesContainer) {
        episodesContainer.innerHTML = '<div class="channels-empty-notice"><p class="empty-title">' + (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('series.loading_episodes') : 'Loading seasons and episodes...') + '</p></div>';
      }

      var activePlaylistId = window.FreeIPTV.PlaylistManager ? window.FreeIPTV.PlaylistManager.getActivePlaylistId() : null;
      if (activePlaylistId && window.FreeIPTV.PlaylistManager) {
        window.FreeIPTV.PlaylistManager.getSeriesDetails(activePlaylistId, series).then(function (details) {
          if (isDetailsOpen && selectedSeries && selectedSeries.id === series.id) {
            currentSeriesDetails = details || {};
            var seasons = details && details.seasons ? details.seasons : [];
            if (seasons.length === 0) {
              if (seasonLabel) {
                seasonLabel.textContent = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('series.no_seasons') : 'No seasons available.';
              }
              self.renderEpisodes([]);
            } else {
              activeSeasonNumber = seasons[0].seasonNumber;
              self.renderSeasonDropdown(seasons);
              var epMap = currentSeriesDetails.episodesBySeason || {};
              var initialEps = epMap[activeSeasonNumber] || [];
              self.renderEpisodes(initialEps);
            }
          }
        }).catch(function () {
          if (seasonLabel) {
            seasonLabel.textContent = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('series.no_seasons') : 'No seasons available.';
          }
          self.renderEpisodes([]);
        });
      }
    },

    /**
     * Populate series details modal headers.
     * @param {Object} series
     */
    populateDetailsUI: function (series) {
      var titleEl = document.getElementById('series-details-title');
      if (titleEl) titleEl.textContent = series.name || '';

      var descEl = document.getElementById('series-details-desc');
      if (descEl) descEl.textContent = series.description || (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('series.no_description') : 'No overview available.');

      var metaRow = document.getElementById('series-details-meta');
      if (metaRow) {
        metaRow.innerHTML = '';
        if (series.rating && parseFloat(series.rating) > 0) {
          metaRow.innerHTML += '<span class="detail-badge rating">★ ' + parseFloat(series.rating).toFixed(1) + '</span>';
        }
        if (series.releaseDate) {
          metaRow.innerHTML += '<span class="detail-badge">' + String(series.releaseDate).slice(0, 4) + '</span>';
        }
        if (series.genre) {
          metaRow.innerHTML += '<span class="detail-badge">' + series.genre + '</span>';
        }
      }

      var posterEl = document.getElementById('series-details-poster');
      var seriesPoster = series.posterUrl || series.poster || series.cover || series.streamIcon || '';
      if (posterEl) {
        if (seriesPoster) {
          posterEl.src = seriesPoster;
          posterEl.style.display = 'block';
        } else {
          posterEl.style.display = 'none';
        }
      }

      var backdropEl = document.getElementById('series-details-backdrop');
      if (backdropEl) {
        var bgUrl = series.backdropUrl || seriesPoster || '';
        if (bgUrl) {
          backdropEl.style.backgroundImage = 'linear-gradient(to top, rgba(10,14,23,0.95) 20%, rgba(10,14,23,0.6) 80%), url("' + bgUrl + '")';
        } else {
          backdropEl.style.backgroundImage = 'none';
        }
      }

      var castEl = document.getElementById('series-details-cast');
      if (castEl) {
        castEl.textContent = series.cast ? (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('movies.cast_label') : 'Cast: ') + series.cast : '';
      }
    },

    /**
     * Check if season dropdown is currently open.
     * @returns {boolean}
     */
    isSeasonDropdownOpen: function () {
      return isDropdownOpen;
    },

    /**
     * Open season dropdown menu.
     */
    openSeasonDropdown: function () {
      if (isDropdownOpen) return;
      var menu = document.getElementById('season-dropdown-list');
      var btn = document.getElementById('btn-season-selector');
      if (!menu || !btn) return;

      isDropdownOpen = true;
      menu.classList.remove('hidden');
      btn.setAttribute('aria-expanded', 'true');

      // Focus currently selected season item or first season item
      var targetItem = menu.querySelector('.season-dropdown-item.active') ||
                       menu.querySelector('.season-dropdown-item');
      if (targetItem && window.FreeIPTV.Navigation) {
        window.FreeIPTV.Navigation.focus(targetItem);
      }
    },

    /**
     * Close season dropdown menu.
     * @param {boolean} [restoreFocusToBtn=true]
     */
    closeSeasonDropdown: function (restoreFocusToBtn) {
      if (!isDropdownOpen) return;
      var menu = document.getElementById('season-dropdown-list');
      var btn = document.getElementById('btn-season-selector');
      if (menu) menu.classList.add('hidden');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      isDropdownOpen = false;

      if (restoreFocusToBtn !== false && btn && window.FreeIPTV.Navigation) {
        window.FreeIPTV.Navigation.focus(btn);
      }
    },

    /**
     * Toggle season dropdown menu.
     */
    toggleSeasonDropdown: function () {
      if (isDropdownOpen) {
        this.closeSeasonDropdown(true);
      } else {
        this.openSeasonDropdown();
      }
    },

    /**
     * Render the season dropdown options.
     * @param {Array} seasons
     */
    renderSeasonDropdown: function (seasons) {
      var menu = document.getElementById('season-dropdown-list');
      var label = document.getElementById('season-selector-label');
      if (!menu) return;

      menu.innerHTML = '';
      availableSeasons = (seasons || []).slice();

      // Sort ascending numerically by seasonNumber
      availableSeasons.sort(function (a, b) {
        return a.seasonNumber - b.seasonNumber;
      });

      var self = this;

      if (availableSeasons.length === 0) {
        if (label) {
          label.textContent = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('series.no_seasons') : 'No seasons available.';
        }
        return;
      }

      // Default to activeSeasonNumber or first available season
      var currentSeasonObj = availableSeasons.find(function (s) {
        return s.seasonNumber === activeSeasonNumber;
      });
      if (!currentSeasonObj) {
        currentSeasonObj = availableSeasons[0];
        activeSeasonNumber = currentSeasonObj.seasonNumber;
      }

      if (label) {
        label.textContent = currentSeasonObj.name || ('Season ' + currentSeasonObj.seasonNumber);
      }

      for (var i = 0; i < availableSeasons.length; i++) {
        var s = availableSeasons[i];
        var item = document.createElement('button');
        item.className = 'season-dropdown-item focusable' + (s.seasonNumber === activeSeasonNumber ? ' active' : '');
        item.setAttribute('data-nav-zone', 'series_season_dropdown');
        item.setAttribute('data-season-number', String(s.seasonNumber));
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', s.seasonNumber === activeSeasonNumber ? 'true' : 'false');
        item.textContent = s.name || ('Season ' + s.seasonNumber);

        (function (seasonNum) {
          item.addEventListener('click', function () {
            self.selectSeason(seasonNum, true);
          });
        })(s.seasonNumber);

        menu.appendChild(item);
      }
    },

    /**
     * Backwards-compatibility alias for older tests.
     */
    renderSeasons: function (seasons) {
      this.renderSeasonDropdown(seasons);
    },

    /**
     * Select active season.
     * @param {number} seasonNum
     * @param {boolean} [shouldFocusFirstEp=true]
     */
    selectSeason: function (seasonNum, shouldFocusFirstEp) {
      activeSeasonNumber = seasonNum;

      var currentSeasonObj = (availableSeasons || []).find(function (s) {
        return s.seasonNumber === seasonNum;
      });
      var sName = currentSeasonObj ? (currentSeasonObj.name || ('Season ' + currentSeasonObj.seasonNumber)) : ('Season ' + seasonNum);

      var label = document.getElementById('season-selector-label');
      if (label) {
        label.textContent = sName;
      }

      var items = document.querySelectorAll('#season-dropdown-list .season-dropdown-item');
      for (var i = 0; i < items.length; i++) {
        var itemNum = parseInt(items[i].getAttribute('data-season-number'), 10);
        if (itemNum === seasonNum) {
          items[i].classList.add('active');
          items[i].setAttribute('aria-selected', 'true');
        } else {
          items[i].classList.remove('active');
          items[i].setAttribute('aria-selected', 'false');
        }
      }

      // Close dropdown without restoring focus to the button (we will focus first episode)
      this.closeSeasonDropdown(false);

      // Render episodes strictly for this season
      var epMap = currentSeriesDetails && currentSeriesDetails.episodesBySeason ? currentSeriesDetails.episodesBySeason : {};
      var eps = epMap[seasonNum] || [];
      this.renderEpisodes(eps);

      if (shouldFocusFirstEp !== false && window.FreeIPTV.Navigation) {
        var firstEp = document.querySelector('#series-episodes-list .episode-card.focusable');
        if (firstEp) {
          window.FreeIPTV.Navigation.focus(firstEp);
        } else {
          var btn = document.getElementById('btn-season-selector');
          if (btn) window.FreeIPTV.Navigation.focus(btn);
        }
      }
    },

    /**
     * Render episodes list for the active season.
     * @param {Array} episodes
     */
    renderEpisodes: function (episodes) {
      var container = document.getElementById('series-episodes-list') || document.getElementById('series-episodes-container');
      if (!container) return;

      container.innerHTML = '';
      var self = this;

      if (!episodes || episodes.length === 0) {
        container.innerHTML = '<div class="channels-empty-notice"><p class="empty-title">' + (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('series.no_episodes') : 'No episodes found for this season.') + '</p></div>';
        return;
      }

      for (var i = 0; i < episodes.length; i++) {
        var ep = episodes[i];
        var item = this.createEpisodeItem(ep, i);
        container.appendChild(item);
      }
    },

    /**
     * Create DOM element for an episode row.
     * @param {Object} ep
     * @param {number} index
     * @returns {HTMLElement}
     */
    createEpisodeItem: function (ep, index) {
      var self = this;
      var btn = document.createElement('button');
      btn.className = 'episode-card series-episode-card focusable';
      btn.setAttribute('data-nav-zone', 'series_details');
      btn.setAttribute('data-episode-id', ep.id);
      btn.setAttribute('data-index', String(index));

      // Episode number badge
      var numSpan = document.createElement('div');
      numSpan.className = 'episode-number';
      numSpan.textContent = (ep.episodeNumber < 10 ? '0' : '') + ep.episodeNumber;

      // Thumbnail
      var thumbBox = document.createElement('div');
      thumbBox.className = 'episode-thumb-box';

      var fallbackIcon = document.createElement('div');
      fallbackIcon.className = 'episode-fallback-icon';
      fallbackIcon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';

      if (ep.thumbnailUrl) {
        var img = document.createElement('img');
        img.className = 'episode-thumb-img';
        img.alt = '';
        img.loading = 'lazy';
        img.src = ep.thumbnailUrl;
        img.onerror = function () {
          this.style.display = 'none';
          fallbackIcon.style.display = 'flex';
        };
        thumbBox.appendChild(img);
        fallbackIcon.style.display = 'none';
      }

      thumbBox.appendChild(fallbackIcon);

      // Info
      var infoCol = document.createElement('div');
      infoCol.className = 'episode-info-col';

      var title = document.createElement('div');
      title.className = 'episode-title';
      title.textContent = ep.name;

      var desc = document.createElement('div');
      desc.className = 'episode-desc';
      desc.textContent = ep.description || (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('series.no_description') : 'No episode description.');

      var meta = document.createElement('div');
      meta.className = 'episode-meta';
      if (ep.duration) {
        meta.textContent = ep.duration;
      }

      infoCol.appendChild(title);
      infoCol.appendChild(desc);
      infoCol.appendChild(meta);

      // Play button indicator
      var playAction = document.createElement('div');
      playAction.className = 'episode-play-badge';
      playAction.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';

      // Check progress
      var progress = window.FreeIPTV.PlaylistManager ? window.FreeIPTV.PlaylistManager.getPlaybackProgress(ep.id) : null;
      if (progress && progress.positionSeconds >= 15) {
        var progressTrack = document.createElement('div');
        progressTrack.className = 'episode-progress-track';
        var progressFill = document.createElement('div');
        progressFill.className = 'episode-progress-fill';
        progressFill.style.width = (progress.progressPercent || 0) + '%';
        progressTrack.appendChild(progressFill);
        thumbBox.appendChild(progressTrack);
      }

      btn.appendChild(numSpan);
      btn.appendChild(thumbBox);
      btn.appendChild(infoCol);
      btn.appendChild(playAction);

      btn.addEventListener('click', function () {
        if (selectedSeries && window.FreeIPTV.Player) {
          var resumePos = progress ? progress.positionSeconds : 0;
          // Launch playback without closing/destroying series details view state
          var seasonEps = (currentSeriesDetails && currentSeriesDetails.episodesBySeason && currentSeriesDetails.episodesBySeason[activeSeasonNumber]) || [ep];
          window.FreeIPTV.Player.playEpisode(selectedSeries, activeSeasonNumber, ep, resumePos * 1000, seasonEps);
        }
      });

      return btn;
    },

    /**
     * Update favorite button state in details modal.
     * @param {boolean} isFav
     */
    updateDetailsFavoriteButton: function (isFav) {
      var btnFav = document.getElementById('btn-series-fav');
      if (!btnFav) return;
      if (isFav) {
        btnFav.classList.add('is-favorite');
        btnFav.textContent = '★ ' + (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('series.remove_favorite') : 'Remove Favorite');
      } else {
        btnFav.classList.remove('is-favorite');
        btnFav.textContent = '☆ ' + (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('series.add_favorite') : 'Favorite');
      }
    },

    /**
     * Update favorites state.
     */
    updateFavoritesState: function () {
      if (!isDetailsOpen && selectedSeries) {
        var isFav = window.FreeIPTV.PlaylistManager ? window.FreeIPTV.PlaylistManager.isFavoriteItem(selectedSeries.id, 'series') : false;
        this.updateDetailsFavoriteButton(isFav);
      }
    },

    /**
     * Get active season number.
     * @returns {number}
     */
    getActiveSeasonNumber: function () {
      return activeSeasonNumber;
    },

    /**
     * Get currently available seasons.
     * @returns {Array}
     */
    getAvailableSeasons: function () {
      return availableSeasons;
    },

    /**
     * Close series details view and restore focus to previous screen.
     */
    closeSeriesDetails: function () {
      if (!isDetailsOpen) return;
      if (isDropdownOpen) {
        this.closeSeasonDropdown(false);
      }
      isDetailsOpen = false;
      var targetRoute = originRoute || 'series';
      selectedSeries = null;
      currentSeriesDetails = null;
      availableSeasons = [];
      activeSeasonNumber = 1;

      if (window.FreeIPTV.Home && window.FreeIPTV.Home.switchView) {
        window.FreeIPTV.Home.switchView(targetRoute);
      } else {
        var view = document.getElementById('view-series_details');
        if (view) view.classList.add('hidden');
        var originView = document.getElementById('view-' + targetRoute);
        if (originView) originView.classList.remove('hidden');
      }

      if (window.FreeIPTV.Remote) {
        window.FreeIPTV.Remote.popBackHandler();
      }

      if (window.FreeIPTV.Navigation && previousFocusedElement && document.body.contains(previousFocusedElement)) {
        window.FreeIPTV.Navigation.focus(previousFocusedElement);
      } else if (window.FreeIPTV.Navigation) {
        var fallback = document.querySelector('#view-' + targetRoute + ' .focusable.active') ||
                       document.querySelector('#view-' + targetRoute + ' .focusable');
        if (fallback) window.FreeIPTV.Navigation.focus(fallback);
      }
    },

    /**
     * Check if details modal is open.
     * @returns {boolean}
     */
    isDetailsOpen: function () {
      return isDetailsOpen;
    },

    /**
     * Render empty state message.
     * @param {string} msg
     */
    renderEmptyState: function (msg) {
      var container = document.getElementById('series-grid-container');
      if (container) {
        container.innerHTML = '<div class="channels-empty-notice"><p class="empty-title">' + msg + '</p></div>';
      }
      var catList = document.getElementById('series-categories-list');
      if (catList) catList.innerHTML = '';
    }
  };

  window.FreeIPTV.Series = Series;
})(window);
