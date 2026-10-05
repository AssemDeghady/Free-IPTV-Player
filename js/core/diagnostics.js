/**
 * Free IPTV Player — TV Diagnostic & Metric Engine
 * Measures viewport, pixel ratio, focus state, and lifecycle metrics across Desktop, Emulator, and TV.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  // Enable focus debugging overlay by default for diagnostic phase (easy to toggle off)
  if (typeof window.FreeIPTV_DEBUG_FOCUS === 'undefined') {
    window.FreeIPTV_DEBUG_FOCUS = false; // toggleable via window.FreeIPTV_DEBUG_FOCUS = true or remote key
  }

  var lastKeyInfo = { key: 'None', keyCode: 0 };

  var Diagnostics = {
    /**
     * Measure and return current runtime metrics.
     */
    measure: function () {
      var docEl = document.documentElement;
      var body = document.body;
      var metaViewport = document.querySelector('meta[name="viewport"]');
      var rootComputed = window.getComputedStyle ? window.getComputedStyle(docEl) : {};
      var bodyComputed = window.getComputedStyle ? window.getComputedStyle(body) : {};

      var appRoot = document.querySelector('.app-root');
      var header = document.querySelector('.app-header');
      var main = document.querySelector('.app-main');
      var activeView = document.querySelector('.view-screen:not(.hidden)');
      var card = (activeView ? activeView.querySelector('.movie-card, .series-card, .home-quick-card, .channel-card') : null) || document.querySelector('.movie-card, .series-card, .home-quick-card');
      var posterWrap = (activeView ? activeView.querySelector('.movie-poster-wrap, .series-poster-wrap') : null) || document.querySelector('.movie-poster-wrap, .series-poster-wrap');
      var posterImg = (activeView ? activeView.querySelector('.movie-poster-img, .series-poster-img') : null) || document.querySelector('.movie-poster-img, .series-poster-img');
      var detailsPoster = document.getElementById('movie-details-poster');

      var toRect = function (el) {
        if (!el || !el.getBoundingClientRect) return null;
        var r = el.getBoundingClientRect();
        return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height), bottom: Math.round(r.bottom), right: Math.round(r.right) };
      };

      var posterImgComputed = null;
      if (posterImg && window.getComputedStyle) {
        var cs = window.getComputedStyle(posterImg);
        posterImgComputed = {
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
          position: cs.position,
          width: cs.width,
          height: cs.height,
          naturalWidth: posterImg.naturalWidth,
          naturalHeight: posterImg.naturalHeight,
          complete: posterImg.complete,
          src: posterImg.src ? posterImg.src.substring(0, 100) : 'none'
        };
      }

      var metrics = {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        clientWidth: docEl ? docEl.clientWidth : null,
        clientHeight: docEl ? docEl.clientHeight : null,
        bodyClientWidth: body ? body.clientWidth : null,
        bodyClientHeight: body ? body.clientHeight : null,
        devicePixelRatio: window.devicePixelRatio || 1,
        screenWidth: window.screen ? window.screen.width : null,
        screenHeight: window.screen ? window.screen.height : null,
        screenAvailWidth: window.screen ? window.screen.availWidth : null,
        screenAvailHeight: window.screen ? window.screen.availHeight : null,
        visualViewportWidth: window.visualViewport ? window.visualViewport.width : null,
        visualViewportHeight: window.visualViewport ? window.visualViewport.height : null,
        visualViewportScale: window.visualViewport ? window.visualViewport.scale : null,
        rootFontSize: rootComputed.fontSize || 'N/A',
        bodyFontSize: bodyComputed.fontSize || 'N/A',
        docBoundingRect: toRect(docEl),
        bodyBoundingRect: toRect(body),
        appRootBoundingRect: toRect(appRoot),
        headerBoundingRect: toRect(header),
        mainBoundingRect: toRect(main),
        cardBoundingRect: toRect(card),
        posterWrapBoundingRect: toRect(posterWrap),
        posterImgBoundingRect: toRect(posterImg),
        posterImgComputed: posterImgComputed,
        detailsPosterBoundingRect: toRect(detailsPoster),
        viewportMeta: metaViewport ? metaViewport.getAttribute('content') : 'N/A'
      };

      window.FreeIPTV_DIAGNOSTICS = metrics;
      try {
        if (window.localStorage) {
          localStorage.setItem('freeiptv_diagnostics', JSON.stringify(metrics));
        }
      } catch (e) {}

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('--- RUNTIME METRICS ---', JSON.stringify(metrics));
      }

      return metrics;
    },

    /**
     * Send telemetry to local diagnostics server if reachable.
     */
    sendTelemetry: function (label) {
      var metrics = this.measure();
      metrics.telemetryLabel = label || 'telemetry';
      var payload = JSON.stringify(metrics);

      // 1. Post to live webhook
      try {
        var xhrW = new XMLHttpRequest();
        xhrW.open('POST', 'https://webhook.site/da9a8e6a-16d7-4578-9b2d-4b1629f212c3', true);
        xhrW.setRequestHeader('Content-Type', 'application/json');
        xhrW.send(payload);
      } catch (e1) {}

      // 2. Post to local PC endpoint
      try {
        var xhrL = new XMLHttpRequest();
        xhrL.open('POST', 'http://192.168.100.4:8888/log', true);
        xhrL.setRequestHeader('Content-Type', 'application/json');
        xhrL.send(payload);
      } catch (e2) {}

      // 3. Image beacon fallback (bypasses CORS/CSP restrictions)
      try {
        var beacon = new Image();
        beacon.src = 'http://192.168.100.4:8888/ping?d=' + encodeURIComponent(payload);
      } catch (e3) {}
    },

    /**
     * Initialize diagnostic monitoring and overlay.
     */
    init: function () {
      var self = this;
      this.measure();

      // Track key presses for diagnostic overlay
      window.addEventListener('keydown', function (e) {
        lastKeyInfo = {
          key: e.key || 'key_' + e.keyCode,
          keyCode: e.keyCode || e.which
        };
        // Toggle overlay with ColorF3Blue key or Alt+D
        if (e.keyCode === 406 || (e.altKey && (e.key === 'd' || e.key === 'D'))) {
          window.FreeIPTV_DEBUG_FOCUS = !window.FreeIPTV_DEBUG_FOCUS;
          self.updateOverlay();
        }
        if (window.FreeIPTV_DEBUG_FOCUS) {
          self.updateOverlay();
        }
      }, true);

      // Track navigation focus changes
      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.NAV_FOCUS_CHANGED, function () {
          if (window.FreeIPTV_DEBUG_FOCUS) {
            self.updateOverlay();
          }
        });
      }

      // Initial overlay render if debug active
      if (window.FreeIPTV_DEBUG_FOCUS) {
        this.updateOverlay();
      }

      // Schedule automated diagnostic reports to local telemetry listener
      setTimeout(function () { self.sendTelemetry('startup_1s'); }, 1000);
      setTimeout(function () { self.sendTelemetry('startup_3s'); }, 3000);
      setTimeout(function () { self.sendTelemetry('startup_6s'); }, 6000);

      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.on(window.FreeIPTV.Constants.EVENTS.VIEW_CHANGED, function (data) {
          setTimeout(function () {
            self.sendTelemetry('view_' + (data ? data.route : 'unknown'));
          }, 800);
        });
      }
    },

    /**
     * Render or update on-screen diagnostic overlay.
     */
    updateOverlay: function () {
      var overlayId = 'freeiptv-diagnostic-overlay';
      var overlay = document.getElementById(overlayId);

      if (!window.FreeIPTV_DEBUG_FOCUS) {
        if (overlay) overlay.style.display = 'none';
        return;
      }

      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.style.position = 'fixed';
        overlay.style.bottom = '12px';
        overlay.style.right = '12px';
        overlay.style.zIndex = '99999';
        overlay.style.background = 'rgba(10, 15, 29, 0.92)';
        overlay.style.color = '#38bdf8';
        overlay.style.border = '1px solid #0284c7';
        overlay.style.borderRadius = '8px';
        overlay.style.padding = '10px 14px';
        overlay.style.fontFamily = 'monospace';
        overlay.style.fontSize = '12px';
        overlay.style.lineHeight = '1.4';
        overlay.style.pointerEvents = 'none';
        overlay.style.boxShadow = '0 8px 24px rgba(0,0,0,0.8)';
        document.body.appendChild(overlay);
      }

      overlay.style.display = 'block';

      var nav = window.FreeIPTV.Navigation;
      var curEl = nav ? nav.getCurrent() : null;
      var curZone = (nav && curEl) ? nav.getElementZone(curEl) : 'None';
      var activeEl = document.activeElement;
      var curRoute = nav ? nav.getCurrentRoute() : 'home';

      var curElDesc = curEl ? (curEl.tagName.toLowerCase() + (curEl.id ? '#' + curEl.id : '') + (curEl.className ? '.' + curEl.className.split(' ').slice(0, 2).join('.') : '')) : 'null';
      var actElDesc = activeEl ? (activeEl.tagName.toLowerCase() + (activeEl.id ? '#' + activeEl.id : '')) : 'null';

      overlay.innerHTML = 
        '<b>FreeIPTV Diagnostic</b><br>' +
        'VIEW: <span style="color:#fff">' + curRoute + '</span> | ZONE: <span style="color:#fbbf24">' + curZone + '</span><br>' +
        'NAV ELEMENT: <span style="color:#a7f3d0">' + curElDesc + '</span><br>' +
        'ACTIVE ELEMENT: <span style="color:#f472b6">' + actElDesc + '</span><br>' +
        'LAST KEY: <span style="color:#fff">' + lastKeyInfo.key + ' (' + lastKeyInfo.keyCode + ')</span><br>' +
        'VIEWPORT: <span style="color:#fff">' + window.innerWidth + 'x' + window.innerHeight + ' (DPR: ' + (window.devicePixelRatio || 1) + ')</span><br>' +
        'SCREEN: <span style="color:#fff">' + (window.screen ? window.screen.width + 'x' + window.screen.height : 'N/A') + '</span>';
    }
  };

  window.FreeIPTV.Diagnostics = Diagnostics;

})(window);
