/**
 * Free IPTV Player — M3U Parser Test Suite
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

console.log('\n--- Running M3U Parser Tests ---');

// Mock browser context
const mockWindow = { FreeIPTV: {} };
const context = vm.createContext({ window: mockWindow });

const parserCode = fs.readFileSync(path.resolve(__dirname, '../js/playlist/m3u-parser.js'), 'utf8');
vm.runInContext(parserCode, context);
const parser = mockWindow.FreeIPTV.M3UParser;

// 1. Basic Playlist Parsing
const basicContent = fs.readFileSync(path.resolve(__dirname, 'fixtures/basic.m3u'), 'utf8');
const basicResult = parser.parse(basicContent, 'pl_basic');

assert(basicResult.channels.length === 5, 'Parses all 5 channels in basic fixture');
assert(basicResult.stats.validEntries === 5, 'Stats reports 5 valid entries');
assert(basicResult.stats.skippedEntries === 0, 'Stats reports 0 skipped entries');
assert(basicResult.categories.includes('News'), 'Category list includes "News"');
assert(basicResult.categories.includes('Sports'), 'Category list includes "Sports"');
assert(basicResult.categories.includes('Documentary'), 'Category list includes "Documentary"');
assert(basicResult.categories.includes('Other'), 'Euronews with missing group is categorized as "Other"');

// Check Channel 1 Metadata extraction
const ch1 = basicResult.channels[0];
assert(ch1.name === 'BBC News', 'Channel 1 name extracted correctly');
assert(ch1.tvgId === 'bbc.news', 'tvg-id extracted: bbc.news');
assert(ch1.tvgName === 'BBC News', 'tvg-name extracted: BBC News');
assert(ch1.tvgLogo === 'https://example.com/logos/bbc.png', 'tvg-logo extracted');
assert(ch1.tvgCountry === 'UK', 'tvg-country extracted: UK');
assert(ch1.tvgLanguage === 'English', 'tvg-language extracted: English');
assert(ch1.tvgChno === '101', 'tvg-chno extracted: 101');
assert(ch1.groupTitle === 'News', 'groupTitle extracted: News');
assert(ch1.streamUrl === 'https://example.com/streams/bbc_news.m3u8', 'streamUrl correctly associated');

// Check Channel with query parameters
const ch3 = basicResult.channels[2];
assert(ch3.name === 'ESPN HD', 'Channel 3 name: ESPN HD');
assert(ch3.streamUrl === 'https://example.com/streams/espn.m3u8?token=xyz123&auth=true', 'Query parameters preserved');

// 2. Malformed & Edge Cases
const malformedContent = fs.readFileSync(path.resolve(__dirname, 'fixtures/malformed.m3u'), 'utf8');
const malformedResult = parser.parse(malformedContent, 'pl_malformed');

assert(malformedResult.channels.length === 6, 'Only valid entries are parsed (6 valid)');
assert(malformedResult.stats.skippedEntries >= 2, 'Malformed entries skipped and counted (' + malformedResult.stats.skippedEntries + ')');

// Check channel without metadata
const noMetaCh = malformedResult.channels.find(c => c.name === 'Channel Without Metadata');
assert(noMetaCh !== undefined, 'Parsed channel without metadata');
assert(noMetaCh && noMetaCh.groupTitle === 'Other', 'Defaults missing groupTitle to "Other"');

// Check duplicate handling
const dups = malformedResult.channels.filter(c => c.streamUrl === 'https://example.com/streams/valid1.m3u8');
assert(dups.length === 2, 'Duplicates are preserved with unique IDs');
assert(dups[0].id !== dups[1].id, 'Duplicate entries receive unique IDs');
assert(dups[1].isDuplicateUrl === true, 'Duplicate URL flagged');

// Check Arabic UTF-8 channel name & group
const arabicCh = malformedResult.channels.find(c => c.name === 'الجزيرة الإخبارية');
assert(arabicCh !== undefined, 'UTF-8 Arabic channel parsed: الجزيرة الإخبارية');
assert(arabicCh && arabicCh.groupTitle === 'أخبار', 'UTF-8 Arabic category parsed: أخبار');

// 3. Empty & CRLF/LF tests
const emptyResult = parser.parse('', 'pl_empty');
assert(emptyResult.channels.length === 0, 'Empty string returns 0 channels');
assert(emptyResult.stats.totalEntries === 0, 'Empty string stats totalEntries is 0');

const crlfContent = '#EXTM3U\r\n#EXTINF:-1 group-title="News",CRLF Channel\r\nhttps://example.com/crlf.m3u8\r\n';
const crlfResult = parser.parse(crlfContent);
assert(crlfResult.channels.length === 1, 'Windows CRLF parsed correctly');
assert(crlfResult.channels[0].name === 'CRLF Channel', 'Channel name from CRLF parsed correctly');

// 4. Large Playlist Sample (600 channels)
const largeContent = fs.readFileSync(path.resolve(__dirname, 'fixtures/large.m3u'), 'utf8');
const startTime = Date.now();
const largeResult = parser.parse(largeContent, 'pl_large');
const parseDuration = Date.now() - startTime;

assert(largeResult.channels.length === 600, 'Parsed all 600 channels from large fixture');
assert(largeResult.categories.length === 10, 'Identified all 10 categories in large fixture');
assert(parseDuration < 200, `Large playlist parsed rapidly in ${parseDuration}ms (< 200ms)`);

console.log(`M3U Parser Results: ${passed} passed, ${failed} failed.\n`);

if (failed > 0) process.exit(1);
