/**
 * Free IPTV Player — Movies / VOD View Controller
 * TV-first poster grid, category filtering, lazy image loading, details modal, and playback resume.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var activeCategory = 'all';
  var allMovies = [];
  var filteredMovies = [];
  var currentSearchQuery = '';
  var renderedCount = 0;
  var CHUNK_SIZE = 30; // Batch size for TV performance
  var selectedMovie = null;
  var isDetailsOpen = false;
  var previousFocusedElement = null;

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

      var searchInput = document.getElementById('movies-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', function (e) {
          self.setSearchQuery(e.target.value);
        });
      }

      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.VIEW_CHANGED, function (data) {
          if (data && data.route === 'movies') {
            self.onEnterView();
          }
        });
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.PLAYLIST_ACTIVE_CHANGED, function () {
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
        self.renderCategories(result.categories || []);
        self.applyFilter();
      }).catch(function (err) {
        self.renderEmptyState('Unable to load movies: ' + (err.message || 'Error'));
      });
    },

    /**
     * Render the categories column.
     * @param {Array<string>} categories
     */
    renderCategories: function (categories) {
      var container = document.getElementById('movies-categories-list');
      if (!container) return;

      container.innerHTML = '';
      var self = this;

      // 1. "All Movies" Category
      var allItem = document.createElement('button');
      allItem.className = 'category-item focusable' + (activeCategory === 'all' ? ' active' : '');
      allItem.setAttribute('data-nav-zone', 'movies_categories');
      allItem.setAttribute('data-category', 'all');

      var allLabel = document.createElement('span');
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

      // 2. Provider categories
      for (var i = 0; i < categories.length; i++) {
        var catName = categories[i];
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
    },

    /**
     * Select a category.
     * @param {string} category
     * @param {HTMLElement} itemEl
     */
    selectCategory: function (category, itemEl) {
      activeCategory = category;

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
      currentSearchQuery = query || '';
      this.applyFilter();
    },

    /**
     * Filter movies and render grid.
     */
    applyFilter: function () {
      var q = currentSearchQuery.trim().toLowerCase();
      var cat = activeCategory;

      filteredMovies = allMovies.filter(function (m) {
        if (cat !== 'all' && m.categoryName !== cat) {
          return false;
        }
        if (!q) return true;
        var nameMatch = m.name && m.name.toLowerCase().indexOf(q) !== -1;
        var genreMatch = m.genre && m.genre.toLowerCase().indexOf(q) !== -1;
        var castMatch = m.cast && m.cast.toLowerCase().indexOf(q) !== -1;
        return nameMatch || genreMatch || castMatch;
      });

      var countLabel = document.getElementById('movies-count-label');
      if (countLabel) {
        var tmpl = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('movies.movie_count') : '{count} Movies';
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
      var endIndex = Math.min(renderedCount + CHUNK_SIZE, filteredMovies.length);

      for (var i = renderedCount; i < endIndex; i++) {
        var movie = filteredMovies[i];
        var card = this.createMovieCard(movie, i);
        container.appendChild(card);
      }

      renderedCount = endIndex;
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
      posterBox.className = 'movie-poster-box';

      var fallbackSvg = document.createElement('div');
      fallbackSvg.className = 'poster-fallback-icon';
      fallbackSvg.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>';

      if (movie.posterUrl) {
        var img = document.createElement('img');
        img.className = 'movie-poster-img';
        img.alt = '';
        img.loading = 'lazy';
        img.src = movie.posterUrl;

        img.onerror = function () {
          this.style.display = 'none';
          fallbackSvg.style.display = 'flex';
        };

        posterBox.appendChild(img);
        fallbackSvg.style.display = 'none';
      }

      posterBox.appendChild(fallbackSvg);

      // Rating badge if available
      if (movie.rating && parseFloat(movie.rating) > 0) {
        var ratingBadge = document.createElement('div');
        ratingBadge.className = 'movie-rating-badge';
        ratingBadge.textContent = '★ ' + parseFloat(movie.rating).toFixed(1);
        posterBox.appendChild(ratingBadge);
      }

      // Title & Year info
      var titleBox = document.createElement('div');
      titleBox.className = 'movie-info-box';

      var title = document.createElement('div');
      title.className = 'movie-title';
      title.textContent = movie.name;
      titleBox.appendChild(title);

      var subRow = document.createElement('div');
      subRow.className = 'movie-sub-row';

      if (movie.releaseDate) {
        var yearSpan = document.createElement('span');
        yearSpan.className = 'movie-year';
        yearSpan.textContent = String(movie.releaseDate).slice(0, 4);
        subRow.appendChild(yearSpan);
      }

      if (movie.categoryName) {
        var catSpan = document.createElement('span');
        catSpan.className = 'movie-cat';
        catSpan.textContent = movie.categoryName;
        subRow.appendChild(catSpan);
      }

      titleBox.appendChild(subRow);

      card.appendChild(posterBox);
      card.appendChild(titleBox);

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
      if (!isNaN(index) && index >= renderedCount - 8 && renderedCount < filteredMovies.length) {
        this.renderGrid(false);
      }
    },

    // ==========================================
    // MOVIE DETAILS MODAL
    // ==========================================

    /**
     * Bind click and key events for movie details modal.
     */
    bindDetailsModalEvents: function () {
      var self = this;

      var btnPlay = document.getElementById('btn-movie-play');
      if (btnPlay) {
        btnPlay.addEventListener('click', function () {
          if (selectedMovie && window.FreeIPTV.Player) {
            self.closeMovieDetails();
            window.FreeIPTV.Player.playMovie(selectedMovie, 0);
          }
        });
      }

      var btnResume = document.getElementById('btn-movie-resume');
      if (btnResume) {
        btnResume.addEventListener('click', function () {
          if (selectedMovie && window.FreeIPTV.Player) {
            var progress = window.FreeIPTV.PlaylistManager ? window.FreeIPTV.PlaylistManager.getPlaybackProgress(selectedMovie.id) : null;
            var pos = progress ? progress.positionSeconds : 0;
            self.closeMovieDetails();
            window.FreeIPTV.Player.playMovie(selectedMovie, pos);
          }
        });
      }

      var btnFav = document.getElementById('btn-movie-fav');
      if (btnFav) {
        btnFav.addEventListener('click', function () {
          if (selectedMovie && window.FreeIPTV.PlaylistManager) {
            var isFav = window.FreeIPTV.PlaylistManager.toggleFavoriteItem({
              providerId: selectedMovie.providerId,
              contentType: 'movie',
              contentId: selectedMovie.id,
              title: selectedMovie.name,
              posterUrl: selectedMovie.posterUrl,
              streamUrl: selectedMovie.streamUrl,
              categoryName: selectedMovie.categoryName
            });
            self.updateDetailsFavoriteButton(isFav);
          }
        });
      }

      var btnBack = document.getElementById('btn-movie-back');
      if (btnBack) {
        btnBack.addEventListener('click', function () {
          self.closeMovieDetails();
        });
      }
    },

    /**
     * Open detailed view for a movie.
     * @param {Object} movie
     */
    openMovieDetails: function (movie) {
      if (!movie) return;
      selectedMovie = movie;
      isDetailsOpen = true;
      previousFocusedElement = window.FreeIPTV.Navigation ? window.FreeIPTV.Navigation.getCurrent() : null;

      var modal = document.getElementById('movie-details-modal');
      if (!modal) return;

      var self = this;

      // Populate basic info immediately
      this.populateDetailsUI(movie);

      modal.classList.remove('hidden');

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

      if (btnResume) {
        if (progress && progress.positionSeconds >= 15 && (!progress.durationSeconds || progress.positionSeconds < progress.durationSeconds - 30)) {
          var mins = Math.floor(progress.positionSeconds / 60);
          var secs = progress.positionSeconds % 60;
          var timeStr = (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
          btnResume.textContent = (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('movies.resume_from') : 'Resume from {time}').replace('{time}', timeStr);
          btnResume.classList.remove('hidden');
          if (window.FreeIPTV.Navigation) {
            window.FreeIPTV.Navigation.focus(btnResume);
          }
        } else {
          btnResume.classList.add('hidden');
          if (window.FreeIPTV.Navigation && btnPlay) {
            window.FreeIPTV.Navigation.focus(btnPlay);
          }
        }
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
      if (posterEl) {
        if (movie.posterUrl) {
          posterEl.src = movie.posterUrl;
          posterEl.style.display = 'block';
        } else {
          posterEl.style.display = 'none';
        }
      }

      var backdropEl = document.getElementById('movie-details-backdrop');
      if (backdropEl) {
        var bgUrl = movie.backdropUrl || movie.posterUrl || '';
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
     * Close movie details dialog and restore focus.
     */
    closeMovieDetails: function () {
      if (!isDetailsOpen) return;
      isDetailsOpen = false;
      selectedMovie = null;

      var modal = document.getElementById('movie-details-modal');
      if (modal) {
        modal.classList.add('hidden');
      }

      if (window.FreeIPTV.Remote) {
        window.FreeIPTV.Remote.popBackHandler();
      }

      if (window.FreeIPTV.Navigation && previousFocusedElement && document.body.contains(previousFocusedElement)) {
        window.FreeIPTV.Navigation.focus(previousFocusedElement);
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
