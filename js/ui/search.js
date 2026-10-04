/**
 * Free IPTV Player — Global Search View Controller
 * Unified search across Live Channels, Movies (VOD), and TV Series.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var searchDebounceTimer = null;
  var currentResults = { live: [], movies: [], series: [] };

  var Search = {
    /**
     * Initialize Global Search controller.
     */
    init: function () {
      this.bindEvents();

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('Global Search Controller initialized.');
      }
    },

    /**
     * Bind UI and routing events.
     */
    bindEvents: function () {
      var self = this;
      var input = document.getElementById('global-search-input');
      var clearBtn = document.getElementById('global-search-clear');

      if (input) {
        input.addEventListener('input', function (e) {
          self.handleInput(e.target.value);
        });
      }

      if (clearBtn) {
        clearBtn.addEventListener('click', function () {
          if (input) {
            input.value = '';
            self.handleInput('');
            input.focus();
          }
        });
      }

      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.VIEW_CHANGED, function (data) {
          if (data && data.route === 'search') {
            self.onEnterView();
          }
        });
      }
    },

    /**
     * Called when user enters search view.
     */
    onEnterView: function () {
      var input = document.getElementById('global-search-input');
      if (input && window.FreeIPTV.Navigation) {
        window.FreeIPTV.Navigation.focus(input);
      }
    },

    /**
     * Handle search input changes with 250ms debounce.
     * @param {string} text
     */
    handleInput: function (text) {
      var self = this;
      var query = (text || '').trim();

      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
      }

      var clearBtn = document.getElementById('global-search-clear');
      if (clearBtn) {
        clearBtn.style.display = query.length > 0 ? 'flex' : 'none';
      }

      if (query.length < 2) {
        this.renderInitialState();
        return;
      }

      searchDebounceTimer = setTimeout(function () {
        self.executeSearch(query);
      }, 250);
    },

    /**
     * Execute search across all content types via PlaylistManager.
     * @param {string} query
     */
    executeSearch: function (query) {
      var self = this;
      var PlaylistManager = window.FreeIPTV.PlaylistManager;
      if (!PlaylistManager) return;

      var container = document.getElementById('global-search-results');
      if (container) {
        container.innerHTML = '<div class="search-loading">' +
          (window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('search.searching') : 'Searching across Live TV, Movies, and Series...') +
          '</div>';
      }

      PlaylistManager.globalSearch(query).then(function (results) {
        currentResults = results || { live: [], movies: [], series: [] };
        self.renderResults(query, currentResults);
      }).catch(function (err) {
        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.error('Global search failed:', err);
        }
        self.renderEmptyState(query);
      });
    },

    /**
     * Render results partitioned into Live TV, Movies, and Series.
     * @param {string} query
     * @param {Object} results
     */
    renderResults: function (query, results) {
      var container = document.getElementById('global-search-results');
      if (!container) return;

      var I18n = window.FreeIPTV.I18n;
      var totalFound = (results.live ? results.live.length : 0) +
                       (results.movies ? results.movies.length : 0) +
                       (results.series ? results.series.length : 0);

      if (totalFound === 0) {
        this.renderEmptyState(query);
        return;
      }

      container.innerHTML = '';
      var self = this;

      // 1. Live TV Channels Row
      if (results.live && results.live.length > 0) {
        var liveSection = this.createSection(
          (I18n ? I18n.t('search.section_live') : 'Live TV Channels') + ' (' + results.live.length + ')'
        );
        var liveGrid = document.createElement('div');
        liveGrid.className = 'search-row-grid';

        for (var i = 0; i < Math.min(results.live.length, 12); i++) {
          var ch = results.live[i];
          var card = this.createLiveChannelCard(ch);
          liveGrid.appendChild(card);
        }
        liveSection.appendChild(liveGrid);
        container.appendChild(liveSection);
      }

      // 2. Movies (VOD) Row
      if (results.movies && results.movies.length > 0) {
        var movieSection = this.createSection(
          (I18n ? I18n.t('search.section_movies') : 'Movies') + ' (' + results.movies.length + ')'
        );
        var movieGrid = document.createElement('div');
        movieGrid.className = 'search-row-grid';

        for (var m = 0; m < Math.min(results.movies.length, 12); m++) {
          var movie = results.movies[m];
          var mCard = this.createPosterCard(movie, 'movie');
          movieGrid.appendChild(mCard);
        }
        movieSection.appendChild(movieGrid);
        container.appendChild(movieSection);
      }

      // 3. TV Series Row
      if (results.series && results.series.length > 0) {
        var seriesSection = this.createSection(
          (I18n ? I18n.t('search.section_series') : 'Series') + ' (' + results.series.length + ')'
        );
        var seriesGrid = document.createElement('div');
        seriesGrid.className = 'search-row-grid';

        for (var s = 0; s < Math.min(results.series.length, 12); s++) {
          var ser = results.series[s];
          var sCard = this.createPosterCard(ser, 'series');
          seriesGrid.appendChild(sCard);
        }
        seriesSection.appendChild(seriesGrid);
        container.appendChild(seriesSection);
      }
    },

    /**
     * Create a titled results section container.
     * @param {string} titleText
     * @returns {HTMLElement}
     */
    createSection: function (titleText) {
      var section = document.createElement('div');
      section.className = 'search-section';

      var title = document.createElement('h3');
      title.className = 'search-section-title';
      title.textContent = titleText;

      section.appendChild(title);
      return section;
    },

    /**
     * Create Live TV channel card for search results.
     * @param {Object} ch
     * @returns {HTMLElement}
     */
    createLiveChannelCard: function (ch) {
      var card = document.createElement('button');
      card.className = 'search-card search-card-live focusable';
      card.setAttribute('data-nav-zone', 'search_results');

      var iconWrap = document.createElement('div');
      iconWrap.className = 'search-card-icon';

      if (ch.logoUrl) {
        var img = document.createElement('img');
        img.src = ch.logoUrl;
        img.alt = '';
        img.loading = 'lazy';
        img.onerror = function () {
          this.style.display = 'none';
        };
        iconWrap.appendChild(img);
      } else {
        iconWrap.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg>';
      }

      var infoWrap = document.createElement('div');
      infoWrap.className = 'search-card-info';

      var nameEl = document.createElement('div');
      nameEl.className = 'search-card-title';
      nameEl.textContent = ch.name;

      var metaEl = document.createElement('div');
      metaEl.className = 'search-card-sub';
      metaEl.textContent = ch.groupTitle || 'Live TV';

      infoWrap.appendChild(nameEl);
      infoWrap.appendChild(metaEl);

      card.appendChild(iconWrap);
      card.appendChild(infoWrap);

      card.addEventListener('click', function () {
        if (window.FreeIPTV.Player) {
          window.FreeIPTV.Player.playChannel(ch, [ch]);
        }
      });

      return card;
    },

    /**
     * Create poster card for movie or series.
     * @param {Object} item
     * @param {string} type 'movie'|'series'
     * @returns {HTMLElement}
     */
    createPosterCard: function (item, type) {
      var card = document.createElement('button');
      card.className = 'search-card search-card-poster focusable';
      card.setAttribute('data-nav-zone', 'search_results');

      var posterWrap = document.createElement('div');
      posterWrap.className = 'search-poster-wrap';

      if (item.poster) {
        var img = document.createElement('img');
        img.src = item.poster;
        img.alt = '';
        img.loading = 'lazy';
        img.onerror = function () {
          this.style.display = 'none';
        };
        posterWrap.appendChild(img);
      } else {
        var fallback = document.createElement('div');
        fallback.className = 'search-poster-fallback';
        fallback.innerHTML = type === 'movie' ?
          '<svg viewBox="0 0 24 24"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>' :
          '<svg viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>';
        posterWrap.appendChild(fallback);
      }

      var infoWrap = document.createElement('div');
      infoWrap.className = 'search-card-info';

      var titleEl = document.createElement('div');
      titleEl.className = 'search-card-title';
      titleEl.textContent = item.name || item.title;

      var subEl = document.createElement('div');
      subEl.className = 'search-card-sub';
      var year = item.year || item.releaseDate;
      var rating = item.rating ? '★ ' + item.rating : '';
      subEl.textContent = [year, rating].filter(Boolean).join(' • ') || (type === 'movie' ? 'Movie' : 'Series');

      infoWrap.appendChild(titleEl);
      infoWrap.appendChild(subEl);

      card.appendChild(posterWrap);
      card.appendChild(infoWrap);

      card.addEventListener('click', function () {
        if (type === 'movie' && window.FreeIPTV.Movies) {
          window.FreeIPTV.Movies.openMovieDetails(item);
        } else if (type === 'series' && window.FreeIPTV.Series) {
          window.FreeIPTV.Series.openSeriesDetails(item);
        }
      });

      return card;
    },

    /**
     * Initial prompt state.
     */
    renderInitialState: function () {
      var container = document.getElementById('global-search-results');
      if (!container) return;
      var I18n = window.FreeIPTV.I18n;
      container.innerHTML = '<div class="search-empty-prompt">' +
        '<div class="search-empty-icon"><svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></div>' +
        '<div class="search-empty-title">' + (I18n ? I18n.t('search.prompt_title') : 'Search IPTV Content') + '</div>' +
        '<div class="search-empty-sub">' + (I18n ? I18n.t('search.prompt_sub') : 'Type at least 2 characters to search across Live Channels, Movies, and Series.') + '</div>' +
        '</div>';
    },

    /**
     * No results found state.
     * @param {string} query
     */
    renderEmptyState: function (query) {
      var container = document.getElementById('global-search-results');
      if (!container) return;
      var I18n = window.FreeIPTV.I18n;
      container.innerHTML = '<div class="search-empty-prompt">' +
        '<div class="search-empty-title">' + (I18n ? I18n.t('search.no_results_title') : 'No results found') + '</div>' +
        '<div class="search-empty-sub">' + (I18n ? I18n.t('search.no_results_sub').replace('{query}', query) : 'No matches found for "' + query + '".') + '</div>' +
        '</div>';
    }
  };

  window.FreeIPTV.Search = Search;
})(window);
