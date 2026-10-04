/**
 * Free IPTV Player — M3U / M3U8 Playlist Parser
 * High-performance, robust, and fault-tolerant parser for IPTV playlists.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  /**
   * Parse key-value attributes from an #EXTINF line.
   * Handles quoted attributes (e.g. tvg-id="bbc") and unquoted attributes.
   * @param {string} attrString
   * @returns {Object}
   */
  function parseAttributes(attrString) {
    var attrs = {};
    if (!attrString) {
      return attrs;
    }

    // Regex matches: key="value" or key=value
    var regex = /([a-zA-Z0-9_\-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
    var match;

    while ((match = regex.exec(attrString)) !== null) {
      var key = match[1].toLowerCase();
      var value = match[2] !== undefined ? match[2] : (match[3] !== undefined ? match[3] : match[4]);
      attrs[key] = (value || '').trim();
    }

    return attrs;
  }

  /**
   * Extract channel name from #EXTINF line (text after the last comma).
   * @param {string} line
   * @param {Object} attrs
   * @returns {string}
   */
  function extractChannelName(line, attrs) {
    var commaIndex = line.lastIndexOf(',');
    if (commaIndex !== -1 && commaIndex < line.length - 1) {
      var name = line.substring(commaIndex + 1).trim();
      if (name.length > 0) {
        return name;
      }
    }
    // Fallback to tvg-name or tvg-id
    return attrs['tvg-name'] || attrs['tvg-id'] || 'Unnamed Channel';
  }

  var M3UParser = {
    /**
     * Parse raw M3U text content.
     * @param {string} content Raw M3U/M3U8 string
     * @param {string} [playlistId='default'] Optional playlist identifier
     * @returns {{ channels: Array, categories: Array, stats: Object }}
     */
    parse: function (content, playlistId) {
      var pId = playlistId || 'pl_' + Date.now();
      var channels = [];
      var categoriesSet = {};
      var seenUrls = {};
      var totalEntries = 0;
      var skippedEntries = 0;

      if (!content || typeof content !== 'string') {
        return {
          channels: [],
          categories: [],
          stats: {
            totalEntries: 0,
            validEntries: 0,
            skippedEntries: 0,
            categoriesCount: 0
          }
        };
      }

      // Remove BOM (Byte Order Mark) if present
      var cleanContent = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;

      // Split into lines normalizing CRLF, LF, and CR
      var lines = cleanContent.split(/\r\n|\r|\n/);
      var pendingChannel = null;

      for (var i = 0; i < lines.length; i++) {
        var rawLine = lines[i];
        var line = rawLine ? rawLine.trim() : '';

        // Skip empty lines
        if (!line) {
          continue;
        }

        // Process #EXTINF lines
        if (line.indexOf('#EXTINF:') === 0) {
          totalEntries++;

          // If there was a pending channel without a URL, count as skipped
          if (pendingChannel) {
            skippedEntries++;
            pendingChannel = null;
          }

          try {
            var extinfPayload = line.substring(8); // after '#EXTINF:'
            var commaIdx = extinfPayload.lastIndexOf(',');
            var attrPart = commaIdx !== -1 ? extinfPayload.substring(0, commaIdx) : extinfPayload;
            var attrs = parseAttributes(attrPart);
            var channelName = extractChannelName(line, attrs);

            // Group title normalization (default to "Other")
            var groupTitle = attrs['group-title'] || attrs['group'] || 'Other';
            groupTitle = groupTitle.trim();
            if (!groupTitle) {
              groupTitle = 'Other';
            }

            var logoUrl = attrs['tvg-logo'] || attrs['tvg-logo-small'] || attrs['logo'] || '';

            pendingChannel = {
              name: channelName,
              groupTitle: groupTitle,
              tvgId: attrs['tvg-id'] || '',
              tvgName: attrs['tvg-name'] || '',
              tvgLogo: logoUrl,
              logoUrl: logoUrl,
              tvgCountry: attrs['tvg-country'] || '',
              tvgLanguage: attrs['tvg-language'] || '',
              tvgChno: attrs['tvg-chno'] || attrs['chno'] || '',
              playlistId: pId
            };
          } catch (err) {
            // Malformed EXTINF line; skip gracefully
            skippedEntries++;
            pendingChannel = null;
          }
          continue;
        }

        // Skip other comment or directive lines that start with '#'
        if (line.charAt(0) === '#') {
          // If channel group directive occurs right after EXTINF (e.g. #EXTGRP:News)
          if (pendingChannel && line.indexOf('#EXTGRP:') === 0) {
            var extGrp = line.substring(8).trim();
            if (extGrp && pendingChannel.groupTitle === 'Other') {
              pendingChannel.groupTitle = extGrp;
            }
          }
          continue;
        }

        // This line is a URL candidate
        if (pendingChannel) {
          var streamUrl = line;

          // Basic URL validity check
          if (streamUrl.length > 4 && (
              streamUrl.indexOf('http://') === 0 ||
              streamUrl.indexOf('https://') === 0 ||
              streamUrl.indexOf('rtmp://') === 0 ||
              streamUrl.indexOf('rtsp://') === 0 ||
              streamUrl.indexOf('//') === 0
          )) {
            var channelIndex = channels.length + 1;
            var channelId = 'ch_' + pId + '_' + channelIndex;

            // Handle duplicate URLs: if URL seen, we still keep channel with unique ID
            var isDuplicateUrl = Boolean(seenUrls[streamUrl]);
            seenUrls[streamUrl] = true;

            var channel = {
              id: channelId,
              name: pendingChannel.name,
              streamUrl: streamUrl,
              logoUrl: pendingChannel.logoUrl,
              groupTitle: pendingChannel.groupTitle,
              tvgId: pendingChannel.tvgId,
              tvgName: pendingChannel.tvgName,
              tvgLogo: pendingChannel.tvgLogo,
              tvgCountry: pendingChannel.tvgCountry,
              tvgLanguage: pendingChannel.tvgLanguage,
              tvgChno: pendingChannel.tvgChno,
              isFavorite: false,
              playlistId: pId,
              isDuplicateUrl: isDuplicateUrl
            };

            channels.push(channel);
            categoriesSet[channel.groupTitle] = (categoriesSet[channel.groupTitle] || 0) + 1;
            pendingChannel = null;
          } else {
            // Invalid stream URL
            skippedEntries++;
            pendingChannel = null;
          }
        }
      }

      // Check if an orphan channel remained at EOF
      if (pendingChannel) {
        skippedEntries++;
      }

      // Collect categories sorted alphabetically, with 'Other' at the end
      var categories = Object.keys(categoriesSet).sort(function (a, b) {
        if (a === 'Other') return 1;
        if (b === 'Other') return -1;
        return a.localeCompare(b);
      });

      return {
        channels: channels,
        categories: categories,
        stats: {
          totalEntries: totalEntries,
          validEntries: channels.length,
          skippedEntries: skippedEntries,
          categoriesCount: categories.length
        }
      };
    }
  };

  window.FreeIPTV.M3UParser = M3UParser;
})(window);
