/**
 * Free IPTV Player — HTTP Network Layer
 * Resilient, timeout-aware HTTP client optimized for Samsung Tizen TV Web Apps.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var DEFAULT_TIMEOUT = 25000; // 25 seconds for TV network environments

  function sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    return url
      .replace(/([?&]password=)[^&]*/gi, '$1***')
      .replace(/(https?:\/\/[^:]+:)[^@]+(@)/gi, '$1***$2')
      .replace(/(\/live\/[^\/]+\/)[^\/]+(\/?)/gi, '$1***$2');
  }

  var Http = {
    sanitizeUrl: sanitizeUrl,

    /**
     * Perform an HTTP GET request.
     * @param {string} url Request URL
     * @param {Object} [options]
     * @param {number} [options.timeout=25000] Timeout in milliseconds
     * @param {Object} [options.headers] Request headers
     * @returns {Promise<{ status: number, statusText: string, data: string, url: string }>}
     */
    get: function (url, options) {
      options = options || {};
      var timeout = options.timeout || DEFAULT_TIMEOUT;
      var headers = options.headers || {};

      return new Promise(function (resolve, reject) {
        if (!url || typeof url !== 'string' || url.trim().length === 0) {
          return reject({
            code: 'INVALID_URL',
            message: 'Playlist URL cannot be empty.',
            status: 0
          });
        }

        var trimmedUrl = url.trim();

        // Basic URL protocol validation
        if (
          trimmedUrl.indexOf('http://') !== 0 &&
          trimmedUrl.indexOf('https://') !== 0 &&
          trimmedUrl.indexOf('file://') !== 0
        ) {
          return reject({
            code: 'UNSUPPORTED_PROTOCOL',
            message: 'Only HTTP and HTTPS playlist URLs are supported.',
            status: 0
          });
        }

        if (window.FreeIPTV.Logger) {
          window.FreeIPTV.Logger.info('HTTP GET request initiated:', sanitizeUrl(trimmedUrl));
        }

        var xhr = new XMLHttpRequest();
        xhr.open('GET', trimmedUrl, true);
        xhr.timeout = timeout;

        // Apply headers
        for (var h in headers) {
          if (headers.hasOwnProperty(h)) {
            try {
              xhr.setRequestHeader(h, headers[h]);
            } catch (e) {
              // Ignore invalid headers
            }
          }
        }

        // On Load
        xhr.onload = function () {
          // Status 200-299 or 0 for local file:// testing
          var isSuccess = (xhr.status >= 200 && xhr.status < 300) || (xhr.status === 0 && xhr.responseText);

          if (isSuccess) {
            if (window.FreeIPTV.Logger) {
              window.FreeIPTV.Logger.info('HTTP GET success (' + (xhr.responseText ? xhr.responseText.length : 0) + ' bytes) for:', sanitizeUrl(trimmedUrl));
            }
            resolve({
              status: xhr.status,
              statusText: xhr.statusText || 'OK',
              data: xhr.responseText || '',
              url: trimmedUrl
            });
          } else {
            var errorInfo = {
              code: 'HTTP_' + xhr.status,
              status: xhr.status,
              statusText: xhr.statusText,
              message: 'Server returned HTTP ' + xhr.status + ' (' + (xhr.statusText || 'Error') + ').'
            };

            if (xhr.status === 404) {
              errorInfo.message = 'The playlist was not found at the provided URL (HTTP 404).';
            } else if (xhr.status === 403 || xhr.status === 401) {
              errorInfo.message = 'Access to this playlist was denied by the provider (HTTP ' + xhr.status + ').';
            } else if (xhr.status >= 500) {
              errorInfo.message = 'The playlist server encountered an error (HTTP ' + xhr.status + ').';
            }

            if (window.FreeIPTV.Logger) {
              window.FreeIPTV.Logger.warn('HTTP error:', errorInfo);
            }
            reject(errorInfo);
          }
        };

        // Network error
        xhr.onerror = function () {
          var error = {
            code: 'NETWORK_ERROR',
            status: 0,
            message: 'Network connection failed. Please check your internet connection or the playlist URL.'
          };
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.error('Network error during HTTP GET:', sanitizeUrl(trimmedUrl));
          }
          reject(error);
        };

        // Timeout
        xhr.ontimeout = function () {
          var error = {
            code: 'TIMEOUT',
            status: 0,
            message: 'Request timed out after ' + Math.round(timeout / 1000) + ' seconds. The server took too long to respond.'
          };
          if (window.FreeIPTV.Logger) {
            window.FreeIPTV.Logger.warn('HTTP request timed out:', trimmedUrl);
          }
          reject(error);
        };

        // Abort
        xhr.onabort = function () {
          var error = {
            code: 'ABORTED',
            status: 0,
            message: 'The request was aborted.'
          };
          reject(error);
        };

        try {
          xhr.send();
        } catch (e) {
          reject({
            code: 'SEND_FAILED',
            status: 0,
            message: 'Failed to send request: ' + (e.message || 'Unknown error')
          });
        }
      });
    }
  };

  window.FreeIPTV.Http = Http;
})(window);
