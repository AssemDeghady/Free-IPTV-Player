/**
 * Free IPTV Player — Add Playlist Modal Controller
 * TV-remote friendly dialog with provider type tabs (M3U & Xtream Codes),
 * input validation, loading states, and error recovery.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var previousFocusedElement = null;
  var previousRoute = 'playlists';
  var isOpen = false;
  var isLoading = false;
  var activeTab = 'xtream'; // 'm3u' | 'xtream'

  var Modal = {
    /**
     * Initialize modal event listeners.
     */
    init: function () {
      this.bindEvents();

      var self = this;
      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.LANGUAGE_CHANGED, function () {
          if (isOpen) {
            var overlay = document.getElementById('modal-overlay');
            if (overlay && window.FreeIPTV.I18n) {
              window.FreeIPTV.I18n.updateDOM(overlay);
            }
          }
        });
      }

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('Modal Controller initialized.');
      }
    },

    /**
     * Bind form actions, tabs, and buttons.
     */
    bindEvents: function () {
      var self = this;

      // Provider Type Tabs
      var tabM3u = document.getElementById('modal-tab-m3u');
      if (tabM3u) {
        tabM3u.addEventListener('click', function () {
          self.switchTab('m3u');
        });
      }

      var tabXtream = document.getElementById('modal-tab-xtream');
      if (tabXtream) {
        tabXtream.addEventListener('click', function () {
          self.switchTab('xtream');
        });
      }

      // Top Back Button
      var btnPageBack = document.getElementById('btn-add-playlist-back');
      if (btnPageBack) {
        btnPageBack.addEventListener('click', function () {
          self.close();
        });
      }

      // M3U Buttons
      var btnCancel = document.getElementById('modal-btn-cancel');
      if (btnCancel) {
        btnCancel.addEventListener('click', function () {
          self.close();
        });
      }

      var btnSubmit = document.getElementById('modal-btn-submit');
      if (btnSubmit) {
        btnSubmit.addEventListener('click', function () {
          self.submit();
        });
      }

      // Xtream Buttons
      var btnXtreamCancel = document.getElementById('modal-btn-xtream-cancel');
      if (btnXtreamCancel) {
        btnXtreamCancel.addEventListener('click', function () {
          self.close();
        });
      }

      var btnXtreamLogin = document.getElementById('modal-btn-xtream-login');
      if (btnXtreamLogin) {
        btnXtreamLogin.addEventListener('click', function () {
          self.submitXtream();
        });
      }

      // Error Recovery Buttons
      var btnRetry = document.getElementById('modal-btn-retry');
      if (btnRetry) {
        btnRetry.addEventListener('click', function () {
          if (activeTab === 'xtream') {
            self.submitXtream();
          } else {
            self.submitM3U();
          }
        });
      }

      var btnErrorCancel = document.getElementById('modal-btn-error-cancel');
      if (btnErrorCancel) {
        btnErrorCancel.addEventListener('click', function () {
          self.showFormState();
          var targetInput = activeTab === 'xtream'
            ? document.getElementById('input-xtream-server')
            : document.getElementById('input-playlist-url');
          if (targetInput && window.FreeIPTV.Navigation) {
            window.FreeIPTV.Navigation.focus(targetInput);
          }
        });
      }

      // M3U Keyboard Navigation
      var inputName = document.getElementById('input-playlist-name');
      if (inputName) {
        inputName.addEventListener('keydown', function (e) {
          if (e.keyCode === 13) {
            e.preventDefault();
            var next = document.getElementById('input-playlist-url');
            if (next && window.FreeIPTV.Navigation) {
              window.FreeIPTV.Navigation.focus(next);
            }
          }
        });
      }

      var inputUrl = document.getElementById('input-playlist-url');
      if (inputUrl) {
        inputUrl.addEventListener('keydown', function (e) {
          if (e.keyCode === 13) {
            e.preventDefault();
            self.submitM3U();
          }
        });
      }

      // Xtream Keyboard Navigation
      var inputXtreamName = document.getElementById('input-xtream-name');
      if (inputXtreamName) {
        inputXtreamName.addEventListener('keydown', function (e) {
          if (e.keyCode === 13) {
            e.preventDefault();
            var nextS = document.getElementById('input-xtream-server');
            if (nextS && window.FreeIPTV.Navigation) {
              window.FreeIPTV.Navigation.focus(nextS);
            }
          }
        });
      }

      var inputServer = document.getElementById('input-xtream-server');
      if (inputServer) {
        inputServer.addEventListener('keydown', function (e) {
          if (e.keyCode === 13) {
            e.preventDefault();
            var nextU = document.getElementById('input-xtream-username');
            if (nextU && window.FreeIPTV.Navigation) {
              window.FreeIPTV.Navigation.focus(nextU);
            }
          }
        });
      }

      var inputUsername = document.getElementById('input-xtream-username');
      if (inputUsername) {
        inputUsername.addEventListener('keydown', function (e) {
          if (e.keyCode === 13) {
            e.preventDefault();
            var nextP = document.getElementById('input-xtream-password');
            if (nextP && window.FreeIPTV.Navigation) {
              window.FreeIPTV.Navigation.focus(nextP);
            }
          }
        });
      }

      var inputPassword = document.getElementById('input-xtream-password');
      if (inputPassword) {
        inputPassword.addEventListener('keydown', function (e) {
          if (e.keyCode === 13) {
            e.preventDefault();
            self.submitXtream();
          }
        });
      }
    },

    /**
     * Switch between M3U and Xtream Codes tabs.
     * @param {string} tab 'm3u' | 'xtream'
     */
    switchTab: function (tab) {
      if (isLoading) return;
      activeTab = tab;

      var tabM3u = document.getElementById('modal-tab-m3u');
      var tabXtream = document.getElementById('modal-tab-xtream');
      var panelM3u = document.getElementById('modal-panel-m3u');
      var panelXtream = document.getElementById('modal-panel-xtream');

      if (tab === 'xtream') {
        if (tabM3u) {
          tabM3u.classList.remove('active');
          tabM3u.setAttribute('aria-selected', 'false');
        }
        if (tabXtream) {
          tabXtream.classList.add('active');
          tabXtream.setAttribute('aria-selected', 'true');
        }
        if (panelM3u) panelM3u.classList.add('hidden');
        if (panelXtream) panelXtream.classList.remove('hidden');

        var nameInputXtream = document.getElementById('input-xtream-name');
        var serverInput = document.getElementById('input-xtream-server');
        var targetToFocus = nameInputXtream || serverInput;
        if (targetToFocus && window.FreeIPTV.Navigation) {
          window.FreeIPTV.Navigation.focus(targetToFocus);
        }
      } else {
        if (tabXtream) {
          tabXtream.classList.remove('active');
          tabXtream.setAttribute('aria-selected', 'false');
        }
        if (tabM3u) {
          tabM3u.classList.add('active');
          tabM3u.setAttribute('aria-selected', 'true');
        }
        if (panelXtream) panelXtream.classList.add('hidden');
        if (panelM3u) panelM3u.classList.remove('hidden');

        var nameInputM3u = document.getElementById('input-playlist-name');
        var urlInputM3u = document.getElementById('input-playlist-url');
        var targetM3u = nameInputM3u || urlInputM3u;
        if (targetM3u && window.FreeIPTV.Navigation) {
          window.FreeIPTV.Navigation.focus(targetM3u);
        }
      }
    },

    /**
     * Open the Add Playlist modal.
     */
    showAddPlaylist: function () {
      if (isOpen) return;

      var overlay = document.getElementById('modal-overlay');
      if (!overlay) return;

      previousFocusedElement = window.FreeIPTV.Navigation ? window.FreeIPTV.Navigation.getCurrent() : null;
      if (window.FreeIPTV.Navigation && window.FreeIPTV.Navigation.getCurrentRoute) {
        var cr = window.FreeIPTV.Navigation.getCurrentRoute();
        if (cr && cr !== 'add_playlist') {
          previousRoute = cr;
        }
      }
      isOpen = true;
      isLoading = false;

      this.showFormState();

      if (window.FreeIPTV.Home && window.FreeIPTV.Home.switchView) {
        window.FreeIPTV.Home.switchView('add_playlist');
      } else {
        var addView = document.getElementById('view-add_playlist');
        if (addView) addView.classList.remove('hidden');
      }

      var overlay = document.getElementById('modal-overlay');
      if (overlay) {
        overlay.classList.remove('hidden');
      }

      var addPlScreen = document.getElementById('view-add_playlist');
      if (addPlScreen && window.FreeIPTV.I18n) {
        window.FreeIPTV.I18n.updateDOM(addPlScreen);
      }

      // Clear input fields
      var nameInput = document.getElementById('input-playlist-name');
      var urlInput = document.getElementById('input-playlist-url');
      if (nameInput) nameInput.value = '';
      if (urlInput) urlInput.value = '';

      var xtreamNameInput = document.getElementById('input-xtream-name');
      var serverInput = document.getElementById('input-xtream-server');
      var usernameInput = document.getElementById('input-xtream-username');
      var passwordInput = document.getElementById('input-xtream-password');
      if (xtreamNameInput) xtreamNameInput.value = '';
      if (serverInput) serverInput.value = '';
      if (usernameInput) usernameInput.value = '';
      if (passwordInput) passwordInput.value = '';

      // Reset to Xtream tab (default)
      this.switchTab('xtream');

      // Register Back handler to close modal on TV Return key
      var self = this;
      if (window.FreeIPTV.Remote) {
        window.FreeIPTV.Remote.pushBackHandler(function () {
          if (isOpen) {
            self.close();
            return true; // back handled
          }
          return false;
        });
      }
    },

    /**
     * Close the modal and restore previous focus.
     */
    close: function () {
      if (!isOpen) return;

      var addView = document.getElementById('view-add_playlist');
      if (addView) {
        addView.classList.add('hidden');
      }

      var overlay = document.getElementById('modal-overlay');
      if (overlay) {
        overlay.classList.add('hidden');
      }

      isOpen = false;
      isLoading = false;

      if (window.FreeIPTV.Remote) {
        window.FreeIPTV.Remote.popBackHandler();
      }

      var returnRoute = (previousRoute && previousRoute !== 'add_playlist') ? previousRoute : 'playlists';
      if (window.FreeIPTV.Home && window.FreeIPTV.Home.switchView) {
        window.FreeIPTV.Home.switchView(returnRoute);
      }

      if (window.FreeIPTV.Navigation && previousFocusedElement && document.body.contains(previousFocusedElement)) {
        window.FreeIPTV.Navigation.focus(previousFocusedElement);
      }
    },

    /**
     * Check if modal is currently open.
     * @returns {boolean}
     */
    isOpen: function () {
      return isOpen;
    },

    /**
     * Switch view state to form input.
     */
    showFormState: function () {
      var formState = document.getElementById('modal-state-form');
      var loadingState = document.getElementById('modal-state-loading');
      var errorState = document.getElementById('modal-state-error');

      if (formState) formState.classList.remove('hidden');
      if (loadingState) loadingState.classList.add('hidden');
      if (errorState) errorState.classList.add('hidden');
      isLoading = false;
    },

    /**
     * Switch view state to loading spinner.
     * @param {string} [title]
     * @param {string} [sub]
     */
    showLoadingState: function (title, sub) {
      isLoading = true;
      var formState = document.getElementById('modal-state-form');
      var loadingState = document.getElementById('modal-state-loading');
      var errorState = document.getElementById('modal-state-error');

      if (title) {
        var tEl = loadingState ? loadingState.querySelector('.status-title') : null;
        if (tEl) tEl.textContent = title;
      }
      if (sub) {
        var sEl = loadingState ? loadingState.querySelector('.status-desc') : null;
        if (sEl) sEl.textContent = sub;
      }

      if (formState) formState.classList.add('hidden');
      if (loadingState) loadingState.classList.remove('hidden');
      if (errorState) errorState.classList.add('hidden');
    },

    /**
     * Switch view state to error display with retry button.
     * @param {string} errorMessage
     */
    showErrorState: function (errorMessage) {
      isLoading = false;
      var formState = document.getElementById('modal-state-form');
      var loadingState = document.getElementById('modal-state-loading');
      var errorState = document.getElementById('modal-state-error');
      var msgEl = document.getElementById('modal-error-message');

      if (msgEl) {
        msgEl.textContent = errorMessage || 'Unable to load playlist. Please verify the URL and network connection.';
      }

      if (formState) formState.classList.add('hidden');
      if (loadingState) loadingState.classList.add('hidden');
      if (errorState) errorState.classList.remove('hidden');

      var retryBtn = document.getElementById('modal-btn-retry');
      if (retryBtn && window.FreeIPTV.Navigation) {
        window.FreeIPTV.Navigation.focus(retryBtn);
      }
    },

    /**
     * Submit M3U playlist form.
     */
    submitM3U: function () {
      if (isLoading) return;

      var nameInput = document.getElementById('input-playlist-name');
      var urlInput = document.getElementById('input-playlist-url');

      var name = nameInput ? nameInput.value.trim() : '';
      var url = urlInput ? urlInput.value.trim() : '';

      if (!url) {
        this.showErrorState('Please enter a valid playlist URL.');
        return;
      }

      var title = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('modal.loading') : 'Downloading & Parsing Playlist...';
      var sub = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('modal.loading_sub') : 'Please wait while channels are loaded';
      this.showLoadingState(title, sub);

      var self = this;
      var PlaylistManager = window.FreeIPTV.PlaylistManager;

      if (!PlaylistManager) {
        this.showErrorState('Playlist Manager service is unavailable.');
        return;
      }

      PlaylistManager.addPlaylist(name, url)
        .then(function (result) {
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.info('Playlist successfully added:', result.playlist.name, '(' + result.channels.length + ' channels)');
          }

          self.close();

          var liveTvNav = document.querySelector('[data-route="live_tv"]');
          if (liveTvNav) {
            liveTvNav.click();
          }
        })
        .catch(function (error) {
          var message = (error && error.message) ? error.message : 'Unable to load playlist.';
          self.showErrorState(message);
        });
    },

    /**
     * Submit Xtream Codes login form.
     */
    submitXtream: function () {
      if (isLoading) return;

      var xtreamNameInput = document.getElementById('input-xtream-name');
      var serverInput = document.getElementById('input-xtream-server');
      var usernameInput = document.getElementById('input-xtream-username');
      var passwordInput = document.getElementById('input-xtream-password');

      var customName = xtreamNameInput ? xtreamNameInput.value.trim() : '';
      var server = serverInput ? serverInput.value.trim() : '';
      var username = usernameInput ? usernameInput.value.trim() : '';
      var password = passwordInput ? passwordInput.value.trim() : '';

      if (!server) {
        var errServer = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('modal.error.invalid_server') : 'Invalid server URL';
        this.showErrorState(errServer);
        return;
      }
      if (!username) {
        var errUser = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('modal.error.username_required') : 'Username is required';
        this.showErrorState(errUser);
        return;
      }
      if (!password) {
        var errPass = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('modal.error.password_required') : 'Password is required';
        this.showErrorState(errPass);
        return;
      }

      var title = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('modal.loading_xtream') : 'Connecting to Xtream Server...';
      var sub = window.FreeIPTV.I18n ? window.FreeIPTV.I18n.t('modal.loading_xtream_sub') : 'Authenticating and fetching live channels';
      this.showLoadingState(title, sub);

      var self = this;
      var PlaylistManager = window.FreeIPTV.PlaylistManager;

      if (!PlaylistManager) {
        this.showErrorState('Playlist Manager service is unavailable.');
        return;
      }

      var providerName = customName || 'Xtream IPTV';

      PlaylistManager.addXtreamPlaylist(providerName, server, username, password)
        .then(function (result) {
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.info('Xtream provider successfully added:', result.playlist.name, '(' + result.channels.length + ' channels)');
          }

          self.close();

          var liveTvNav = document.querySelector('[data-route="live_tv"]');
          if (liveTvNav) {
            liveTvNav.click();
          } else if (window.FreeIPTV.Home && window.FreeIPTV.Home.switchView) {
            window.FreeIPTV.Home.switchView('live_tv');
          } else if (window.FreeIPTV.Navigation && window.FreeIPTV.Navigation.switchView) {
            window.FreeIPTV.Navigation.switchView('live_tv');
          }
        })
        .catch(function (error) {
          var rawMsg = (error && error.message) ? error.message : '';
          var message = '';
          if (window.FreeIPTV.I18n) {
            if (rawMsg.indexOf('Invalid Xtream server URL') !== -1) {
              message = window.FreeIPTV.I18n.t('modal.error.invalid_server');
            } else if (rawMsg.indexOf('authentication failed') !== -1 || rawMsg.indexOf('401') !== -1 || rawMsg.indexOf('403') !== -1) {
              message = window.FreeIPTV.I18n.t('modal.error.auth_failed');
            } else if (rawMsg.indexOf('network') !== -1 || rawMsg.indexOf('timed out') !== -1 || rawMsg.indexOf('connect') !== -1) {
              message = window.FreeIPTV.I18n.t('modal.error.server_connect');
            } else if (rawMsg) {
              message = rawMsg;
            } else {
              message = window.FreeIPTV.I18n.t('modal.error.login_failed');
            }
          } else {
            message = rawMsg || 'Unable to connect to Xtream provider.';
          }
          self.showErrorState(message);
        });
    },

    /**
     * Generic submit routed to active tab.
     */
    submit: function () {
      if (activeTab === 'xtream') {
        this.submitXtream();
      } else {
        this.submitM3U();
      }
    }
  };

  window.FreeIPTV.Modal = Modal;
})(window);
