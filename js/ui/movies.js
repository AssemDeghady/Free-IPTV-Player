/**
 * Free IPTV Player — Movies / VOD View Controller
 * TV-first poster grid, category filtering, lazy image loading, details modal, and playback resume.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  /**
   * Derive poster height (2:3) from the real card width and expose it as --poster-h.
   * Done with one layout read per render/resize; CSS stays aspect-ratio free for Tizen 5.5 (M69).
   */
  /** Pre-normalized, cached searchable text (computed once per item). */
  function searchText(item) {
    if (item._s === undefined) {
      item._s = ((item.name || '') + ' ' + (item.genre || '') + ' ' + (item.cast || '')).toLowerCase();
    }
    return item._s;
  }

  var searchTimer = null;
  var pendingEntryFocus = false;

  function applyPosterHeight(container) {
    if (!container) return;
    var cols = 5;
    var gap = 24;
    var w = container.clientWidth;
    if (!w) return;
    var cardW = (w - 24 - gap * (cols - 1)) / cols;
    if (cardW > 40) {
      container.style.setProperty('--poster-h', Math.round(cardW * 1.5) + 'px');
    }
  }

  function parseTimestamp(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    var n = parseInt(val, 10);
    if (!isNaN(n) && n > 0) return n;
    var d = Date.parse(val);
    return isNaN(d) ? 0 : d;
  }

  function loadNearbyImages(container, focusIdx) {
    if (!container) return;
    var minIdx = Math.max(0, focusIdx - 10);
    var maxIdx = focusIdx + 15;
    var cards = container.children;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var idx = parseInt(card.getAttribute('data-index'), 10);
      if (!isNaN(idx) && idx >= minIdx && idx <= maxIdx) {
        var img = card.querySelector('img[data-src]');
        if (img) {
          var src = img.getAttribute('data-src');
          if (src) {
            img.src = src;
            img.removeAttribute('data-src');
          }
        }
      }
    }
  }

  var activeCategory = 'recently_added';
  var allMovies = [];
  var filteredMovies = [];
  var precomputedRecentlyAdded = [];
  var categoryIndex = {};
  var currentSearchQuery = '';
  var categorySearchQuery = '';
  var rawCategories = [];
  var renderedCount = 0;
  var CHUNK_SIZE = 20; // 4 rows of 5 cards (visible + buffer)
  var MAX_DOM_CARDS = 50; // Max DOM cards on screen to prevent TV OOM
  var selectedMovie = null;
  var isDetailsOpen = false;
  var originRoute = 'movies';
  var previousFocusedElement = null;

  function buildCatalogIndexes(movies) {
    precomputedRecentlyAdded = [];
    categoryIndex = {};
    if (!movies || !movies.length) return;

    for (var i = 0; i < movies.length; i++) {
      var m = movies[i];
      if (m._s === undefined) {
        m._s = ((m.name || '') + ' ' + (m.genre || '') + ' ' + (m.cast || '')).toLowerCase();
      }
      if (m._ts === undefined) {
        var t = m.added || (m.metadata && m.metadata.added) || m.created_at || m.addedAt || 0;
        m._ts = parseTimestamp(t);
      }
      var cat = m.categoryName || 'Other';
      if (!categoryIndex[cat]) categoryIndex[cat] = [];
      categoryIndex[cat].push(m);
    }

    var sorted = movies.slice().sort(function (a, b) {
      return b._ts - a._ts;
    });
    precomputedRecentlyAdded = sorted.slice(0, 20);
  }

  var isRestoringBrowsingContext = false;
  var browsingSnapshot = null;

  var Movies = {
    /**
     * Initialize Movies view.
     */
    init: function () {
      this.bindEvents();
      this.bindDetailsModalEvents();

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('Movies View initialized.');
      }
    },

    /**
     * Bind view changes and search events.
     */
    bindEvents: function () {
      var self = this;
      if (typeof window.addEventListener === 'function') {
        window.addEventListener('resize', function () {
          applyPosterHeight(document.getElementById('movies-grid-container'));
        });
      }

      var searchInput = document.getElementById('movies-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', function (e) {
          self.setSearchQuery(e.target.value);
        });
      }

      var catSearchInput = document.getElementById('movies-category-search-input');
      if (catSearchInput) {
        catSearchInput.addEventListener('input', function (e) {
          self.setCategorySearchQuery(e.target.value);
        });
      }

      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.VIEW_CHANGED, function (data) {
          if (data && data.route === 'movies') {
            if (isRestoringBrowsingContext) {
              return;
            }
            self.onEnterView();
          }
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYLIST_ACTIVE_CHANGED, function () {
          var input = document.getElementById('movies-category-search-input');
          if (input) input.value = '';
          self.categorySearchQuery = '';
          self.loadActiveMovies();
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYLIST_UPDATED, function () {
          self.loadActiveMovies();
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.VOD_UPDATED, function () {
          self.loadActiveMovies();
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.FAVORITES_UPDATED, function () {
          self.updateFavoritesState();
        });
      }
    },

    /**
     * Called when user enters Movies screen.
     */
    onEnterView: function () {
      pendingEntryFocus = true;
      activeCategory = 'recently_added';
      var ci = document.getElementById('movies-category-search-input');
      if (ci) {
        ci.value = '';
        if (document.activeElement === ci) ci.blur();
      }
      var si = document.getElementById('movies-search-input');
      if (si) {
        si.value = '';
        if (document.activeElement === si) si.blur();
      }
      currentSearchQuery = '';

      // Park initial resting focus on screen title so keyboard never opens
      var titleEl = document.getElementById('movies-screen-title');
      if (titleEl && window.FreeIPTV.Navigation) {
        window.FreeIPTV.Navigation.focus(titleEl);
      }
      this.loadActiveMovies();
    },

    /**
     * Load VOD movies for active playlist.
     */
    loadActiveMovies: function () {
      var self = this;
      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      if (!PlaylistManager) return;

      var activePlaylist = PlaylistManager.getActivePlaylist();
      if (!activePlaylist) {
        self.renderEmptyState('No active playlist configured. Please add an IPTV playlist to begin.');
        return;
      }

      var container = document.getElementById('movies-grid-container');
      if (container && (!allMovies || allMovies.length === 0)) {
        container.innerHTML = '<div class="channels-empty-notice"><div class="loading-spinner"></div><p class="empty-title">Loading Movies...</p></div>';
      }

      PlaylistManager.loadMovies(activePlaylist.id).then(function (result) {
        allMovies = result.movies || [];
        rawCategories = result.categories || [];
        buildCatalogIndexes(allMovies);
        self.renderCategories(rawCategories);
        self.applyFilter();
      }).catch(function (err) {
        self.renderEmptyState('Unable to load movies: ' + (err.message || 'Error'));
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
      var container = document.getElementById('movies-categories-list');
      if (!container) return;

      if (categories && Array.isArray(categories)) {
        rawCategories = categories;
      }
      var cats = rawCategories || [];

      container.innerHTML = '';
      var self = this;
      var q = (this.categorySearchQuery || '').trim().toLowerCase();

      // 1. "Recently Added" Category (shown when no search query or matches 'recent')
      if (!q || 'recently added'.indexOf(q) !== -1 || 'recent'.indexOf(q) !== -1) {
        var recentItem = document.createElement('button');
        recentItem.className = 'category-item focusable' + (activeCategory === 'recently_added' ? ' active' : '');
        recentItem.setAttribute('data-nav-zone', 'movies_categories');
        recentItem.setAttribute('data-category', 'recently_added');

        var recentLabel = document.createElement('span');
        recentLabel.setAttribute('data-i18n', 'movies.recently_added');
        recentLabel.textContent = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('movies.recently_added') : 'Recently Added';
        var recentCount = document.createElement('span');
        recentCount.className = 'category-count';
        recentCount.textContent = String(Math.min(allMovies.length, 20));

        recentItem.appendChild(recentLabel);
        recentItem.appendChild(recentCount);

        recentItem.addEventListener('click', function () {
          self.selectCategory('recently_added', recentItem);
        });
        container.appendChild(recentItem);
      }

      // 1b. "All Movies" Category (shown when no search query or when 'all' matches)
      if (!q || 'all movies'.indexOf(q) !== -1 || 'all'.indexOf(q) !== -1) {
        var allItem = document.createElement('button');
        allItem.className = 'category-item focusable' + (activeCategory === 'all' ? ' active' : '');
        allItem.setAttribute('data-nav-zone', 'movies_categories');
        allItem.setAttribute('data-category', 'all');

        var allLabel = document.createElement('span');
        allLabel.setAttribute('data-i18n', 'movies.all_movies');
        allLabel.textContent = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('movies.all_movies') : 'All Movies';
        var allCount = document.createElement('span');
        allCount.className = 'category-count';
        allCount.textContent = String(allMovies.length);

        allItem.appendChild(allLabel);
        allItem.appendChild(allCount);

        allItem.addEventListener('click', function () {
          self.selectCategory('all', allItem);
        });
        container.appendChild(allItem);
      }

      // 1c. "Favorites" Category
      if (!q || 'favorites'.indexOf(q) !== -1) {
        var favItem = document.createElement('button');
        favItem.className = 'category-item focusable' + (activeCategory === 'favorites' ? ' active' : '');
        favItem.setAttribute('data-nav-zone', 'movies_categories');
        favItem.setAttribute('data-category', 'favorites');

        var favLabel = document.createElement('span');
        favLabel.setAttribute('data-i18n', 'movies.favorites');
        favLabel.textContent = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('movies.favorites') : 'Favorites';
        var favCount = document.createElement('span');
        favCount.className = 'category-count';
        var favCountNum = 0;
        if (window.FreeIPTV.PlaylistManager && typeof window.FreeIPTV.PlaylistManager.isFavoriteItem === 'function') {
          favCountNum = allMovies.filter(function (m) {
            return window.FreeIPTV.PlaylistManager.isFavoriteItem(m.id, 'movie');
          }).length;
        }
        favCount.textContent = String(favCountNum);

        favItem.appendChild(favLabel);
        favItem.appendChild(favCount);

        favItem.addEventListener('click', function () {
          self.selectCategory('favorites', favItem);
        });
        container.appendChild(favItem);
      }

      // 1d. "Continue Watching" Category
      if (!q || 'continue watching'.indexOf(q) !== -1 || 'continue'.indexOf(q) !== -1) {
        var cwItem = document.createElement('button');
        cwItem.className = 'category-item focusable' + (activeCategory === 'continue_watching' ? ' active' : '');
        cwItem.setAttribute('data-nav-zone', 'movies_categories');
        cwItem.setAttribute('data-category', 'continue_watching');

        var cwLabel = document.createElement('span');
        cwLabel.setAttribute('data-i18n', 'movies.continue_watching');
        cwLabel.textContent = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('movies.continue_watching') : 'Continue Watching';
        var cwCount = document.createElement('span');
        cwCount.className = 'category-count';
        var cwCountNum = 0;
        if (window.FreeIPTV.PlaylistManager && typeof window.FreeIPTV.PlaylistManager.getContinueWatching === 'function') {
          var activePlaylist = window.FreeIPTV.PlaylistManager.getActivePlaylist ? window.FreeIPTV.PlaylistManager.getActivePlaylist() : null;
          var cwList = window.FreeIPTV.PlaylistManager.getContinueWatching(null, activePlaylist ? activePlaylist.id : null).filter(function (item) {
            return item.contentType === 'movie';
          });
          cwCountNum = cwList.length;
        }
        cwCount.textContent = String(cwCountNum);

        cwItem.appendChild(cwLabel);
        cwItem.appendChild(cwCount);

        cwItem.addEventListener('click', function () {
          self.selectCategory('continue_watching', cwItem);
        });
        container.appendChild(cwItem);
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
        catItem.setAttribute('data-nav-zone', 'movies_categories');
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

      // If on Movies screen and entry focus is pending, focus Recently Added category
      if (window.FreeIPTV.Navigation && (window.FreeIPTV.Navigation.getCurrentRoute() === 'movies' || pendingEntryFocus)) {
        if (pendingEntryFocus) {
          pendingEntryFocus = false;
          var firstCat = container.querySelector('.category-item[data-category="recently_added"]') ||
                         container.querySelector('.category-item[data-category="all"]') ||
                         container.querySelector('.category-item');
          if (firstCat) {
            window.FreeIPTV.Navigation.focus(firstCat);
          }
        }
      }
    },

    /**
     * Update favorites state and refresh view if in favorites category.
     */
    updateFavoritesState: function () {
      this.renderCategories();
      if (activeCategory === 'favorites') {
        this.applyFilter();
      }
    },

    /**
     * Select a category.
     * @param {string} category
     * @param {HTMLElement} itemEl
     */
    selectCategory: function (category, itemEl) {
      activeCategory = category;

      // Clear search input on category change so user views all items in the new category
      var searchInput = document.getElementById('movies-search-input');
      if (searchInput && searchInput.value) {
        searchInput.value = '';
      }
      currentSearchQuery = '';

      var items = document.querySelectorAll('#movies-categories-list .category-item');
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
      var self = this;
      currentSearchQuery = query || '';
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        searchTimer = null;
        self.applyFilter();
      }, 200);
    },

    /**
     * Filter movies and render grid.
     */
    applyFilter: function () {
      var q = currentSearchQuery.trim().toLowerCase();
      var cat = activeCategory;

      if (cat === 'recently_added') {
        if (!q) {
          filteredMovies = precomputedRecentlyAdded;
        } else {
          filteredMovies = precomputedRecentlyAdded.filter(function (m) {
            return (m._s || searchText(m)).indexOf(q) !== -1;
          });
        }
      } else if (cat === 'favorites') {
        var PlaylistManager = window.FreeIPTV.PlaylistManager;
        var hasFavFn = PlaylistManager && typeof PlaylistManager.isFavoriteItem === 'function';
        filteredMovies = allMovies.filter(function (m) {
          if (!hasFavFn || !PlaylistManager.isFavoriteItem(m.id, 'movie')) {
            return false;
          }
          if (!q) return true;
          return (m._s || searchText(m)).indexOf(q) !== -1;
        });
      } else if (cat === 'continue_watching') {
        var PlaylistManager = window.FreeIPTV.PlaylistManager;
        var activePlaylist = (PlaylistManager && PlaylistManager.getActivePlaylist) ? PlaylistManager.getActivePlaylist() : null;
        var cwItems = (PlaylistManager && typeof PlaylistManager.getContinueWatching === 'function')
          ? PlaylistManager.getContinueWatching(null, activePlaylist ? activePlaylist.id : null).filter(function (item) {
            return item.contentType === 'movie';
          }) : [];

        var movieMap = {};
        for (var mi = 0; mi < allMovies.length; mi++) {
          movieMap[allMovies[mi].id] = allMovies[mi];
        }

        var cwMovies = [];
        for (var ci = 0; ci < cwItems.length; ci++) {
          var cw = cwItems[ci];
          var existing = movieMap[cw.contentId];
          if (existing) {
            cwMovies.push(existing);
          } else {
            cwMovies.push({
              id: cw.contentId,
              name: cw.title,
              posterUrl: cw.posterUrl,
              streamUrl: cw.streamUrl,
              categoryName: 'Continue Watching'
            });
          }
        }

        filteredMovies = cwMovies.filter(function (m) {
          if (!q) return true;
          return (m._s || searchText(m)).indexOf(q) !== -1;
        });
      } else if (cat === 'all') {
        if (!q) {
          filteredMovies = allMovies;
        } else {
          filteredMovies = allMovies.filter(function (m) {
            return (m._s || searchText(m)).indexOf(q) !== -1;
          });
        }
      } else {
        var pool = categoryIndex[cat] || [];
        if (!q) {
          filteredMovies = pool;
        } else {
          filteredMovies = pool.filter(function (m) {
            return (m._s || searchText(m)).indexOf(q) !== -1;
          });
        }
      }

      var countLabel = document.getElementById('movies-count-label');
      if (countLabel) {
        var tmpl = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('movies.movie_count') : '';
        if (!tmpl || tmpl === 'movies.movie_count' || tmpl.indexOf('{count}') === -1) {
          tmpl = '{count} Movies';
        }
        countLabel.textContent = tmpl.replace('{count}', filteredMovies.length);
      }

      this.renderGrid(true);
    },

    /**
     * Render chunk of movie cards into grid.
     * @param {boolean} reset
     */
    renderGrid: function (reset) {
      var container = document.getElementById('movies-grid-container');
      if (!container) return;
      applyPosterHeight(container);

      if (reset) {
        container.innerHTML = '';
        renderedCount = 0;
      }

      if (filteredMovies.length === 0) {
        var emptyMsg = document.createElement('div');
        emptyMsg.className = 'channels-empty-notice';
        emptyMsg.innerHTML = '<p class="empty-title">' + (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('movies.no_movies') : 'No movies found') + '</p>' +
                             '<p class="empty-sub">' + (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('movies.no_movies_sub') : 'Try selecting another category or changing your search query.') + '</p>';
        container.appendChild(emptyMsg);
        return;
      }

      var self = this;
      var targetEnd = Math.min(renderedCount + CHUNK_SIZE, filteredMovies.length);
      var endIndex = targetEnd;

      for (var i = renderedCount; i < endIndex; i++) {
        var movie = filteredMovies[i];
        var card = this.createMovieCard(movie, i);
        container.appendChild(card);
      }

      renderedCount = endIndex;

      if (window.FreeIPTV && window.FreeIPTV.Diagnostics) {
        setTimeout(function () {
          window.FreeIPTV.Diagnostics.sendTelemetry('movies_grid_rendered');
        }, 300);
      }
    },

    /**
     * Create a single movie poster card element.
     * @param {Object} movie
     * @param {number} index
     * @returns {HTMLElement}
     */
    createMovieCard: function (movie, index) {
      var self = this;
      var card = document.createElement('button');
      card.className = 'movie-card focusable';
      card.setAttribute('data-nav-zone', 'movies_grid');
      card.setAttribute('data-movie-id', movie.id);
      card.setAttribute('data-index', String(index));

      // Poster Container
      var posterBox = document.createElement('div');
      posterBox.className = 'movie-poster-wrap movie-poster-box';

      var posterUrl = movie.posterUrl || movie.poster || movie.streamIcon || movie.cover || '';
      if (posterUrl) {
        var img = document.createElement('img');
        img.className = 'movie-poster-img';
        img.alt = '';
        if (index < 25) {
          img.src = posterUrl;
        } else {
          img.setAttribute('data-src', posterUrl);
        }

        img.onerror = function () {
          this.style.display = 'none';
          var fallback = document.createElement('div');
          fallback.className = 'poster-fallback-icon';
          fallback.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>';
          posterBox.appendChild(fallback);
        };

        posterBox.appendChild(img);
      } else {
        var fallbackSvg = document.createElement('div');
        fallbackSvg.className = 'poster-fallback-icon';
        fallbackSvg.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>';
        posterBox.appendChild(fallbackSvg);
      }

      // Rating badge if available
      if (movie.rating && parseFloat(movie.rating) > 0) {
        var ratingBadge = document.createElement('div');
        ratingBadge.className = 'movie-rating-badge';
        ratingBadge.textContent = '★ ' + parseFloat(movie.rating).toFixed(1);
        posterBox.appendChild(ratingBadge);
      }

      // Title overlay on cover (clean name only)
      var title = document.createElement('div');
      title.className = 'poster-title-overlay';
      title.textContent = (window.FreeIPTV.cleanTitle ? window.FreeIPTV.cleanTitle(movie.name) : movie.name);
      posterBox.appendChild(title);

      card.appendChild(posterBox);

      card.addEventListener('click', function () {
        self.openMovieDetails(movie);
      });

      return card;
    },

    /**
     * Check if more movies should be loaded on scroll.
     * @param {HTMLElement} focusedElement
     */
    checkLoadMore: function (focusedElement) {
      if (!focusedElement) return;
      var index = parseInt(focusedElement.getAttribute('data-index'), 10);
      var container = document.getElementById('movies-grid-container');
      if (container && !isNaN(index)) {
        loadNearbyImages(container, index);
      }
      if (!isNaN(index) && index >= renderedCount - 8 && renderedCount < filteredMovies.length) {
        this.renderGrid(false);
      }
    },

    // ==========================================
    // MOVIE DETAILS MODAL
    // ==========================================

    /**
     * Bind click and key events for movie details page.
     */
    bindDetailsModalEvents: function () {
      var self = this;

      var btnPlay = document.getElementById('btn-movie-play') || document.getElementById('movie-btn-play');
      if (btnPlay) {
        btnPlay.addEventListener('click', function () {
          if (selectedMovie && window.FreeIPTV.Player) {
            window.FreeIPTV.Player.playMovie(selectedMovie, 0);
          }
        });
      }

      var btnResume = document.getElementById('btn-movie-resume') || document.getElementById('movie-btn-resume');
      if (btnResume) {
        btnResume.addEventListener('click', function () {
          if (selectedMovie && window.FreeIPTV.Player) {
            var progress = window.FreeIPTV.PlaylistManager ? window.FreeIPTV.PlaylistManager.getPlaybackProgress(selectedMovie.id) : null;
            var pos = progress ? progress.positionSeconds : 0;
            window.FreeIPTV.Player.playMovie(selectedMovie, pos);
          }
        });
      }

      var btnFav = document.getElementById('btn-movie-fav') || document.getElementById('movie-btn-fav');
      if (btnFav) {
        btnFav.addEventListener('click', function () {
          if (selectedMovie && window.FreeIPTV.PlaylistManager) {
            var posterUrl = selectedMovie.posterUrl || selectedMovie.poster || selectedMovie.streamIcon || selectedMovie.cover || '';
            var isFav = window.FreeIPTV.PlaylistManager.toggleFavoriteItem({
              providerId: selectedMovie.providerId,
              contentType: 'movie',
              contentId: selectedMovie.id,
              title: selectedMovie.name,
              posterUrl: posterUrl,
              poster: posterUrl,
              streamUrl: selectedMovie.streamUrl,
              categoryName: selectedMovie.categoryName
            });
            self.updateDetailsFavoriteButton(isFav);
          }
        });
      }

      var backBtns = [
        document.getElementById('btn-movie-page-back'),
        document.getElementById('btn-movie-back'),
        document.getElementById('movie-btn-back')
      ];
      for (var b = 0; b < backBtns.length; b++) {
        if (backBtns[b]) {
          backBtns[b].addEventListener('click', function () {
            self.closeMovieDetails();
          });
        }
      }
    },

    /**
     * Open detailed full-page view for a movie.
     * @param {Object} movie
     * @param {string} [fromRoute] Origin route (movies, favorites, search, home)
     */
    openMovieDetails: function (movie, fromRoute) {
      if (!movie) return;
      selectedMovie = movie;
      isDetailsOpen = true;
      originRoute = fromRoute || (window.FreeIPTV.Navigation && window.FreeIPTV.Navigation.getCurrentRoute ? window.FreeIPTV.Navigation.getCurrentRoute() : 'movies');
      if (originRoute === 'movie_details') originRoute = 'movies';
      previousFocusedElement = window.FreeIPTV.Navigation ? window.FreeIPTV.Navigation.getCurrent() : null;

      // Capture full browsing state snapshot for seamless return navigation
      var currentMovieId = String(movie.id || '');
      var currentCardIdx = previousFocusedElement ? previousFocusedElement.getAttribute('data-index') : null;
      var gridContainer = document.getElementById('movies-grid-container');
      browsingSnapshot = {
        route: originRoute,
        category: activeCategory,
        searchQuery: currentSearchQuery,
        focusedId: currentMovieId,
        focusedIndex: currentCardIdx,
        scrollY: gridContainer ? gridContainer.scrollTop : 0
      };

      var self = this;

      // Populate basic info immediately
      this.populateDetailsUI(movie);

      // Switch to full-page movie details view
      if (window.FreeIPTV.Home && window.FreeIPTV.Home.switchView) {
        window.FreeIPTV.Home.switchView('movie_details');
      } else {
        var view = document.getElementById('view-movie_details');
        if (view) view.classList.remove('hidden');
      }

      // Register Back key
      if (window.FreeIPTV.Remote) {
        window.FreeIPTV.Remote.pushBackHandler(function () {
          if (isDetailsOpen) {
            self.closeMovieDetails();
            return true;
          }
          return false;
        });
      }

      // Check resume state
      var progress = window.FreeIPTV.PlaylistManager ? window.FreeIPTV.PlaylistManager.getPlaybackProgress(movie.id) : null;
      var btnResume = document.getElementById('btn-movie-resume');
      var btnPlay = document.getElementById('btn-movie-play');
      var initialFocusEl = null;

      if (btnResume && progress && progress.positionSeconds >= 15 && (!progress.durationSeconds || progress.positionSeconds < progress.durationSeconds - 30)) {
        var mins = Math.floor(progress.positionSeconds / 60);
        var secs = progress.positionSeconds % 60;
        var timeStr = (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
        btnResume.textContent = (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('movies.resume_from') : 'Resume from {time}').replace('{time}', timeStr);
        btnResume.classList.remove('hidden');
        initialFocusEl = btnResume;
      } else {
        if (btnResume) btnResume.classList.add('hidden');
        initialFocusEl = btnPlay || document.getElementById('btn-movie-page-back');
      }

      if (window.FreeIPTV.Navigation && initialFocusEl) {
        window.FreeIPTV.Navigation.focus(initialFocusEl);
      }

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('ROUTE: ' + originRoute + ' -> movie_details');
        window.FreeIPTV.Logger.info('INITIAL FOCUS: ' + (initialFocusEl ? (initialFocusEl.id || initialFocusEl.tagName) : 'none'));
      }

      // Check favorite state
      var isFav = window.FreeIPTV.PlaylistManager ? window.FreeIPTV.PlaylistManager.isFavoriteItem(movie.id, 'movie') : false;
      this.updateDetailsFavoriteButton(isFav);

      // Asynchronously fetch extra details (cast, plot, director)
      var activePlaylistId = window.FreeIPTV.PlaylistManager ? window.FreeIPTV.PlaylistManager.getActivePlaylistId() : null;
      if (activePlaylistId && window.FreeIPTV.PlaylistManager) {
        window.FreeIPTV.PlaylistManager.getMovieDetails(activePlaylistId, movie).then(function (details) {
          if (isDetailsOpen && selectedMovie && selectedMovie.id === movie.id && details && details.info) {
            self.populateDetailsExtra(details.info);
          }
        });
      }
    },

    /**
     * Populate details modal fields.
     * @param {Object} movie
     */
    populateDetailsUI: function (movie) {
      var titleEl = document.getElementById('movie-details-title');
      if (titleEl) titleEl.textContent = movie.name || '';

      var descEl = document.getElementById('movie-details-desc');
      if (descEl) descEl.textContent = movie.description || (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('movies.no_description') : 'No overview available.');

      var metaRow = document.getElementById('movie-details-meta');
      if (metaRow) {
        metaRow.innerHTML = '';
        if (movie.rating && parseFloat(movie.rating) > 0) {
          metaRow.innerHTML += '<span class="detail-badge rating">★ ' + parseFloat(movie.rating).toFixed(1) + '</span>';
        }
        if (movie.releaseDate) {
          metaRow.innerHTML += '<span class="detail-badge">' + String(movie.releaseDate).slice(0, 4) + '</span>';
        }
        if (movie.duration) {
          metaRow.innerHTML += '<span class="detail-badge">' + movie.duration + '</span>';
        }
        if (movie.genre) {
          metaRow.innerHTML += '<span class="detail-badge">' + movie.genre + '</span>';
        }
      }

      var posterEl = document.getElementById('movie-details-poster');
      var moviePoster = movie.posterUrl || movie.poster || movie.streamIcon || movie.cover || '';
      if (posterEl) {
        if (moviePoster) {
          posterEl.src = moviePoster;
          posterEl.style.display = 'block';
        } else {
          posterEl.style.display = 'none';
        }
      }

      var backdropEl = document.getElementById('movie-details-backdrop');
      if (backdropEl) {
        var bgUrl = movie.backdropUrl || moviePoster || '';
        if (bgUrl) {
          backdropEl.style.backgroundImage = 'linear-gradient(to top, rgba(10,14,23,0.95) 20%, rgba(10,14,23,0.6) 80%), url("' + bgUrl + '")';
        } else {
          backdropEl.style.backgroundImage = 'none';
        }
      }

      var castEl = document.getElementById('movie-details-cast');
      if (castEl) {
        castEl.textContent = movie.cast ? (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('movies.cast_label') : 'Cast: ') + movie.cast : '';
      }
    },

    /**
     * Populate extra details from VOD info API response.
     * @param {Object} info
     */
    populateDetailsExtra: function (info) {
      if (!info) return;
      var descEl = document.getElementById('movie-details-desc');
      if (descEl && (info.plot || info.description)) {
        descEl.textContent = info.plot || info.description;
      }
      var castEl = document.getElementById('movie-details-cast');
      if (castEl && (info.cast || info.actors)) {
        var label = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('movies.cast_label') : 'Cast: ';
        castEl.textContent = label + (info.cast || info.actors);
      }
    },

    /**
     * Update favorite button state in details modal.
     * @param {boolean} isFav
     */
    updateDetailsFavoriteButton: function (isFav) {
      var btnFav = document.getElementById('btn-movie-fav');
      if (!btnFav) return;
      if (isFav) {
        btnFav.classList.add('is-favorite');
        btnFav.textContent = '★ ' + (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('movies.remove_favorite') : 'Remove Favorite');
      } else {
        btnFav.classList.remove('is-favorite');
        btnFav.textContent = '☆ ' + (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('movies.add_favorite') : 'Favorite');
      }
    },

    /**
     * Update favorites state on movie cards.
     */
    updateFavoritesState: function () {
      if (!isDetailsOpen && selectedMovie) {
        var isFav = window.FreeIPTV.PlaylistManager ? window.FreeIPTV.PlaylistManager.isFavoriteItem(selectedMovie.id, 'movie') : false;
        this.updateDetailsFavoriteButton(isFav);
      }
    },

    /**
     * Close movie details view and restore focus to previous screen.
     */
    closeMovieDetails: function () {
      if (!isDetailsOpen) return;
      isDetailsOpen = false;
      var targetRoute = originRoute || 'movies';
      selectedMovie = null;

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('ROUTE: movie_details -> ' + targetRoute);
        window.FreeIPTV.Logger.info('RESTORE FOCUS: ' + (previousFocusedElement ? (previousFocusedElement.id || previousFocusedElement.className) : 'fallback'));
      }

      if (window.FreeIPTV.Home && window.FreeIPTV.Home.switchView) {
        if (targetRoute === 'movies' && browsingSnapshot) {
          isRestoringBrowsingContext = true;
          window.FreeIPTV.Home.switchView(targetRoute);
          isRestoringBrowsingContext = false;
        } else {
          window.FreeIPTV.Home.switchView(targetRoute);
        }
      } else {
        var view = document.getElementById('view-movie_details');
        if (view) view.classList.add('hidden');
        var originView = document.getElementById('view-' + targetRoute);
        if (originView) originView.classList.remove('hidden');
      }

      if (window.FreeIPTV.Remote) {
        window.FreeIPTV.Remote.popBackHandler();
      }

      if (targetRoute === 'movies' && browsingSnapshot) {
        var snap = browsingSnapshot;
        browsingSnapshot = null;
        if (snap.category && snap.category !== activeCategory) {
          activeCategory = snap.category;
          this.renderCategories();
          this.applyFilter();
        }
        var gridContainer = document.getElementById('movies-grid-container');
        if (gridContainer && snap.scrollY) {
          gridContainer.scrollTop = snap.scrollY;
        }
        var targetCard = null;
        if (snap.focusedId) {
          targetCard = document.querySelector('#movies-grid-container .movie-card[data-movie-id="' + snap.focusedId + '"]');
        }
        if (!targetCard && snap.focusedIndex !== null) {
          targetCard = document.querySelector('#movies-grid-container .movie-card[data-index="' + snap.focusedIndex + '"]');
        }
        if (!targetCard && previousFocusedElement && document.body.contains(previousFocusedElement)) {
          targetCard = previousFocusedElement;
        }
        if (targetCard && window.FreeIPTV.Navigation) {
          window.FreeIPTV.Navigation.focus(targetCard);
          return;
        }
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
      var container = document.getElementById('movies-grid-container');
      if (container) {
        container.innerHTML = '<div class="channels-empty-notice"><p class="empty-title">' + msg + '</p></div>';
      }
      var catList = document.getElementById('movies-categories-list');
      if (catList) catList.innerHTML = '';
    }
  };

  window.FreeIPTV.Movies = Movies;
})(window);
