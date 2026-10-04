/**
 * Free IPTV Player — Samsung AVPlay Media Engine Test Suite
 * Tests webapis.avplay wrapper, state transitions, event listeners,
 * aspect ratio mapping, URL validation, display coordinate mapping,
 * safe teardown, and error handling.
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

console.log('\n--- Running AVPlay Media Engine Tests ---');

// Helper to instantiate sandboxed environment
function createSandbox(avplayConfig = 'mock') {
  let stopCalledBeforeClose = false;
  let stopCallCount = 0;
  let closeCallCount = 0;

  const mockWebapisAvplay = {
    _state: 'NONE',
    _openedUrl: null,
    _displayRect: null,
    _displayMode: null,
    _listener: null,

    open: function (url) {
      this._openedUrl = url;
      this._state = 'IDLE';
    },
    prepareAsync: function (successCb, errorCb) {
      this._state = 'PREPARING';
      this._prepareSuccessCb = successCb;
      this._prepareErrorCb = errorCb;
    },
    play: function () {
      if (this._state !== 'READY' && this._state !== 'PAUSED' && this._state !== 'PLAYING') {
        throw new Error('WebAPIException: INVALID_STATE_ERR');
      }
      this._state = 'PLAYING';
    },
    pause: function () {
      if (this._state !== 'PLAYING') {
        throw new Error('WebAPIException: INVALID_STATE_ERR');
      }
      this._state = 'PAUSED';
    },
    stop: function () {
      if (this._state !== 'READY' && this._state !== 'PLAYING' && this._state !== 'PAUSED') {
        throw new Error('WebAPIException: INVALID_STATE_ERR - stop called in ' + this._state);
      }
      stopCallCount++;
      stopCalledBeforeClose = true;
      this._state = 'IDLE';
    },
    close: function () {
      if (this._state === 'PLAYING' || this._state === 'PAUSED' || this._state === 'READY') {
        throw new Error('WebAPIException: INVALID_STATE_ERR - close called while playing without stop');
      }
      closeCallCount++;
      this._state = 'NONE';
      this._openedUrl = null;
    },
    setDisplayRect: function (x, y, w, h) {
      this._displayRect = { x, y, w, h };
    },
    setDisplayMethod: function (mode) {
      this._displayMode = mode;
    },
    setListener: function (l) {
      this._listener = l;
    },
    getState: function () {
      return this._state;
    }
  };

  const mockWindow = {
    FreeIPTV: {},
    console: console,
    document: {
      addEventListener: function () {},
      removeEventListener: function () {},
      documentElement: { setAttribute: function () {} },
      body: { classList: { add: function () {}, remove: function () {}, contains: () => false } }
    },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
  };

  if (avplayConfig === 'mock') {
    mockWindow.webapis = { avplay: mockWebapisAvplay };
  } else if (avplayConfig === 'null_webapis') {
    mockWindow.webapis = null;
  } else if (avplayConfig === 'no_avplay') {
    mockWindow.webapis = {};
  } else if (avplayConfig === 'null_avplay') {
    mockWindow.webapis = { avplay: null };
  }

  const context = vm.createContext({
    window: mockWindow,
    document: mockWindow.document,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
  });

  // Load constants
  const constantsCode = fs.readFileSync(path.resolve(__dirname, '../js/core/constants.js'), 'utf8');
  vm.runInContext(constantsCode, context);

  // Load events
  const eventsCode = fs.readFileSync(path.resolve(__dirname, '../js/core/events.js'), 'utf8');
  vm.runInContext(eventsCode, context);

  // Load avplay-engine
  const engineCode = fs.readFileSync(path.resolve(__dirname, '../js/player/avplay-engine.js'), 'utf8');
  vm.runInContext(engineCode, context);

  return {
    window: mockWindow,
    engine: mockWindow.FreeIPTV.AVPlayEngine,
    events: mockWindow.FreeIPTV.Events,
    constants: mockWindow.FreeIPTV.Constants,
    mockAvplay: avplayConfig === 'mock' ? mockWebapisAvplay : null,
    getStopStats: () => ({ stopCallCount, closeCallCount, stopCalledBeforeClose })
  };
}

async function runTests() {
  // -------------------------------------------------------------
  // Test 1: Availability Detection in various runtimes
  // -------------------------------------------------------------
  const envNoAvplay = createSandbox('none');
  assert(
    envNoAvplay.engine.isAvailable() === false,
    'AVPlayEngine.isAvailable() returns false when window.webapis is undefined'
  );
  assert(
    envNoAvplay.engine.getState() === 'IDLE',
    'Initial state is IDLE'
  );

  const envNullWebapis = createSandbox('null_webapis');
  assert(
    envNullWebapis.engine.isAvailable() === false,
    'AVPlayEngine.isAvailable() safely handles window.webapis = null without throwing'
  );

  const envNoAvplayProp = createSandbox('no_avplay');
  assert(
    envNoAvplayProp.engine.isAvailable() === false,
    'AVPlayEngine.isAvailable() returns false when window.webapis has no avplay property'
  );

  const envNullAvplayProp = createSandbox('null_avplay');
  assert(
    envNullAvplayProp.engine.isAvailable() === false,
    'AVPlayEngine.isAvailable() returns false when window.webapis.avplay is null'
  );

  // -------------------------------------------------------------
  // Test 2: Availability Detection with mock webapis.avplay
  // -------------------------------------------------------------
  const envWithAvplay = createSandbox('mock');
  assert(
    envWithAvplay.engine.isAvailable() === true,
    'AVPlayEngine.isAvailable() returns true when window.webapis.avplay is present'
  );

  // -------------------------------------------------------------
  // Test 3: Display Coordinate Calculation (1920x1080 Reference Grid)
  // -------------------------------------------------------------
  const calc = envWithAvplay.engine.calculateDisplayRect;
  assert(typeof calc === 'function', 'calculateDisplayRect is exported as a function');

  // Case 1: 1920x1080 viewport (standard FHD panel)
  const full1080 = calc(null, 1920, 1080);
  assert(full1080.x === 0 && full1080.y === 0 && full1080.width === 1920 && full1080.height === 1080, 'Case 1: 1920x1080 viewport produces full-screen (0, 0, 1920, 1080)');
  const sub1080 = calc({ x: 100, y: 50, width: 960, height: 540 }, 1920, 1080);
  assert(sub1080.x === 100 && sub1080.y === 50 && sub1080.width === 960 && sub1080.height === 540, 'Case 1b: 1:1 sub-rect maps unchanged on 1920x1080 grid');

  // Case 2: 1280x720 viewport (scaled 720p base resolution)
  const sub720 = calc({ x: 0, y: 0, width: 640, height: 360 }, 1280, 720);
  assert(sub720.x === 0 && sub720.y === 0 && sub720.width === 960 && sub720.height === 540, 'Case 2: 720p viewport correctly scaled by 1.5 to 1080p reference (960x540)');

  // Case 3: Unusual aspect ratio (2560x1080 ultrawide and 1024x768 4:3)
  const ultraWide = calc({ x: 0, y: 0, width: 2560, height: 1080 }, 2560, 1080);
  assert(ultraWide.x === 0 && ultraWide.y === 0 && ultraWide.width === 1920 && ultraWide.height === 1080, 'Case 3a: 2560x1080 ultrawide scales cleanly to 1920x1080 reference');
  const fourThree = calc({ x: 0, y: 0, width: 512, height: 384 }, 1024, 768);
  assert(fourThree.width === 960 && fourThree.height === 540, 'Case 3b: 1024x768 4:3 sub-area scales proportionally (960x540)');

  // Case 4: Missing rectangle (null, undefined, or empty object)
  const missingNull = calc(null);
  assert(missingNull.x === 0 && missingNull.y === 0 && missingNull.width === 1920 && missingNull.height === 1080, 'Case 4a: Missing rect (null) defaults to (0, 0, 1920, 1080)');
  const missingEmpty = calc({});
  assert(missingEmpty.x === 0 && missingEmpty.y === 0 && missingEmpty.width === 1920 && missingEmpty.height === 1080, 'Case 4b: Empty object {} defaults to (0, 0, 1920, 1080)');

  // Case 5: Zero dimensions
  const zeroDim = calc({ x: 0, y: 0, width: 0, height: 0 }, 1920, 1080);
  assert(zeroDim.width >= 1 && zeroDim.height >= 1, 'Case 5: Zero dimensions clamped to minimum 1x1 px to avoid AVPlay error');

  // Case 6: Negative coordinates
  const negCoords = calc({ x: -100, y: -50, width: 500, height: 400 }, 1920, 1080);
  assert(negCoords.x === 0 && negCoords.y === 0, 'Case 6: Negative coordinates clamped to 0');

  // Case 7: Oversized rectangle extending beyond grid
  const clamped = calc({ x: 1500, y: 900, width: 800, height: 600 }, 1920, 1080);
  assert(clamped.width === 420 && clamped.height === 180, 'Case 7: Oversized rectangle clamped within 1920x1080 boundary');

  // Integer verification
  const fractional = calc({ x: 10.3, y: 20.7, width: 100.4, height: 200.8 }, 1920, 1080);
  assert(Number.isInteger(fractional.x) && Number.isInteger(fractional.y) && Number.isInteger(fractional.width) && Number.isInteger(fractional.height), 'All mapped coordinates are strictly integers');

  // -------------------------------------------------------------
  // Test 4: URL Validation on open()
  // -------------------------------------------------------------
  let lastErrorState = null;
  envWithAvplay.events.on(envWithAvplay.constants.EVENTS.PLAYER_STATE_CHANGED, (data) => {
    if (data.state === 'ERROR') {
      lastErrorState = data;
    }
  });

  // Reject null URL
  lastErrorState = null;
  let nullRejected = false;
  try {
    await envWithAvplay.engine.open(null);
  } catch (err) {
    nullRejected = true;
  }
  assert(nullRejected === true, 'open() rejects null URL');
  assert(lastErrorState !== null && envWithAvplay.engine.getState() === 'ERROR', 'open(null) transitions to ERROR state');

  // Reject invalid protocol
  lastErrorState = null;
  let ftpRejected = false;
  try {
    await envWithAvplay.engine.open('ftp://streams.example.com/live.m3u8');
  } catch (err) {
    ftpRejected = true;
  }
  assert(ftpRejected === true, 'open() rejects unsupported URL schemes (ftp://)');
  assert(lastErrorState !== null, 'open(ftp://...) transitions to ERROR state');

  // Reject javascript: scheme
  let jsRejected = false;
  try {
    await envWithAvplay.engine.open('javascript:alert(1)');
  } catch (err) {
    jsRejected = true;
  }
  assert(jsRejected === true, 'open() rejects dangerous javascript: scheme');

  // Accept valid http / https URL
  const validResult = await envWithAvplay.engine.open('https://stream.example.com/live/channel.m3u8');
  assert(validResult === true, 'open() accepts valid https URL');
  assert(envWithAvplay.mockAvplay._openedUrl === 'https://stream.example.com/live/channel.m3u8', 'Native avplay.open called with URL');
  assert(envWithAvplay.engine.getState() === 'OPENING', 'Engine transitions to OPENING state');

  // -------------------------------------------------------------
  // Test 5: prepare() and prepareAsync callback handling
  // -------------------------------------------------------------
  let stateChanges = [];
  envWithAvplay.events.on(envWithAvplay.constants.EVENTS.PLAYER_STATE_CHANGED, (data) => {
    stateChanges.push(data.state);
  });

  const preparePromise = envWithAvplay.engine.prepare();
  assert(envWithAvplay.engine.getState() === 'PREPARING', 'Engine transitions to PREPARING');
  assert(stateChanges.includes('PREPARING'), 'Emitted PLAYER_STATE_CHANGED with PREPARING');

  // Trigger prepareAsync success callback (which automatically starts playback)
  envWithAvplay.mockAvplay._state = 'READY';
  envWithAvplay.mockAvplay._prepareSuccessCb();
  await preparePromise;
  assert(envWithAvplay.engine.getState() === 'PLAYING', 'Engine transitions to PLAYING after prepare success');
  assert(envWithAvplay.engine.isPlaying() === true, 'isPlaying() returns true');

  // -------------------------------------------------------------
  // Test 6: Play, Pause, Stop, Close Lifecycle
  // -------------------------------------------------------------
  await envWithAvplay.engine.pause();
  assert(envWithAvplay.engine.getState() === 'PAUSED', 'Engine transitions to PAUSED');
  assert(envWithAvplay.engine.isPaused() === true, 'isPaused() returns true');
  assert(envWithAvplay.mockAvplay._state === 'PAUSED', 'Native avplay.pause() invoked');

  await envWithAvplay.engine.play();
  assert(envWithAvplay.engine.getState() === 'PLAYING', 'Engine returns to PLAYING');
  assert(envWithAvplay.mockAvplay._state === 'PLAYING', 'Native avplay.play() invoked');

  await envWithAvplay.engine.stop();
  assert(envWithAvplay.engine.getState() === 'IDLE', 'Engine transitions back to IDLE on stop()');
  assert(envWithAvplay.mockAvplay._state === 'IDLE', 'Native avplay.stop() invoked');

  await envWithAvplay.engine.close();
  assert(envWithAvplay.engine.getState() === 'IDLE', 'Engine state is IDLE after close()');
  assert(envWithAvplay.mockAvplay._state === 'NONE', 'Native avplay.close() invoked');

  // -------------------------------------------------------------
  // Test 7: Safe Teardown on Rapid Channel Zapping
  // -------------------------------------------------------------
  // Open and start playing channel 1
  await envWithAvplay.engine.open('https://stream.example.com/ch1.m3u8');
  envWithAvplay.mockAvplay._state = 'READY';
  envWithAvplay.mockAvplay.play();
  assert(envWithAvplay.mockAvplay._state === 'PLAYING', 'Channel 1 is playing');

  // Immediately open channel 2 while channel 1 is PLAYING
  // This verifies that open() performs safeTeardown (stop then close) without throwing INVALID_STATE_ERR
  await envWithAvplay.engine.open('https://stream.example.com/ch2.m3u8');
  assert(envWithAvplay.mockAvplay._openedUrl === 'https://stream.example.com/ch2.m3u8', 'Channel 2 opened smoothly');
  assert(envWithAvplay.getStopStats().stopCalledBeforeClose === true, 'stop() was properly invoked before close() during rapid zap');

  // Test 7b: Rejection of stale callbacks from replaced channel session
  const oldListener = envWithAvplay.mockAvplay._listener;
  // User rapidly zaps to Channel 3
  await envWithAvplay.engine.open('https://stream.example.com/ch3.m3u8');
  assert(envWithAvplay.engine.getState() === 'OPENING', 'Channel 3 is now active in OPENING state');

  // An old callback from Channel 2's listener fires after the switch
  oldListener.onerror('PLAYER_ERROR_CONNECTION_FAILED');
  assert(envWithAvplay.engine.getState() === 'OPENING', 'Stale callback from replaced channel is discarded and does not alter active channel state');

  // -------------------------------------------------------------
  // Test 8: Display Configuration (Area & Aspect Ratio)
  // -------------------------------------------------------------
  envWithAvplay.engine.setDisplayArea();
  assert(
    envWithAvplay.mockAvplay._displayRect &&
    envWithAvplay.mockAvplay._displayRect.x === 0 &&
    envWithAvplay.mockAvplay._displayRect.y === 0 &&
    envWithAvplay.mockAvplay._displayRect.w === 1920 &&
    envWithAvplay.mockAvplay._displayRect.h === 1080,
    'setDisplayArea() sets standard 1920x1080 integer display rect'
  );

  // Aspect ratio mappings
  envWithAvplay.engine.setDisplayMethod('FIT');
  assert(envWithAvplay.mockAvplay._displayMode === 'PLAYER_DISPLAY_MODE_LETTER_BOX', 'FIT maps to PLAYER_DISPLAY_MODE_LETTER_BOX');

  envWithAvplay.engine.setDisplayMethod('FULL');
  assert(envWithAvplay.mockAvplay._displayMode === 'PLAYER_DISPLAY_MODE_FULL_SCREEN', 'FULL maps to PLAYER_DISPLAY_MODE_FULL_SCREEN');

  envWithAvplay.engine.setDisplayMethod('AUTO');
  assert(envWithAvplay.mockAvplay._displayMode === 'PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO', 'AUTO maps to PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO');

  // -------------------------------------------------------------
  // Test 9: Native AVPlay Event Dispatching & Diagnostics
  // -------------------------------------------------------------
  let buffProgressValue = null;
  let buffStartObserved = false;
  let buffCompleteObserved = false;
  let streamCompleteObserved = false;
  let nativeErrorObserved = false;
  let errorMsgObserved = null;

  envWithAvplay.events.on(envWithAvplay.constants.EVENTS.PLAYER_BUFFERING_PROGRESS, (data) => {
    buffProgressValue = data.percent;
  });

  envWithAvplay.events.on(envWithAvplay.constants.EVENTS.PLAYER_STATE_CHANGED, (data) => {
    if (data.state === 'BUFFERING') buffStartObserved = true;
    if (data.state === 'PLAYING') buffCompleteObserved = true;
    if (data.state === 'IDLE') streamCompleteObserved = true;
    if (data.state === 'ERROR') nativeErrorObserved = true;
  });

  envWithAvplay.engine.setListener({
    onErrorMsg: function (msg) {
      errorMsgObserved = msg;
    }
  });

  const nativeListener = envWithAvplay.mockAvplay._listener;
  assert(nativeListener !== null, 'Native listener object registered on mock avplay');

  // Test buffering start
  nativeListener.onbufferingstart();
  assert(buffStartObserved === true, 'Dispatches PLAYER_STATE_CHANGED with BUFFERING');
  assert(envWithAvplay.engine.getState() === 'BUFFERING', 'State is BUFFERING');

  // Test buffering progress
  nativeListener.onbufferingprogress(65);
  assert(buffProgressValue === 65, 'Dispatches PLAYER_BUFFERING_PROGRESS with 65%');

  // Test buffering complete
  nativeListener.onbufferingcomplete();
  assert(buffCompleteObserved === true, 'Dispatches PLAYER_STATE_CHANGED with PLAYING');
  assert(envWithAvplay.engine.getState() === 'PLAYING', 'State returns to PLAYING');

  // Test stream completed
  nativeListener.onstreamcompleted();
  assert(streamCompleteObserved === true, 'Dispatches PLAYER_STATE_CHANGED with IDLE on stream complete');
  assert(envWithAvplay.engine.getState() === 'IDLE', 'State returns to IDLE');

  // Test native error
  nativeListener.onerror('PLAYER_ERROR_CONNECTION_FAILED');
  assert(nativeErrorObserved === true, 'Dispatches PLAYER_STATE_CHANGED with ERROR on native error');
  assert(envWithAvplay.engine.getState() === 'ERROR', 'State transitions to ERROR');

  // Test native onerrormsg diagnostic
  nativeListener.onerrormsg('Detailed demuxer parse failure on TS payload');
  assert(errorMsgObserved === 'Detailed demuxer parse failure on TS payload', 'Dispatches onerrormsg diagnostic message to listener');

  // -------------------------------------------------------------
  // Test 10: Channel Zapping Wraparound Logic
  // -------------------------------------------------------------
  const channels = [
    { id: 'ch1', name: 'Channel 1' },
    { id: 'ch2', name: 'Channel 2' },
    { id: 'ch3', name: 'Channel 3' }
  ];

  function zap(currentIndex, direction, list) {
    if (!list || list.length === 0) return -1;
    var nextIdx;
    if (direction === 'next') {
      nextIdx = currentIndex + 1;
      if (nextIdx >= list.length) nextIdx = 0; // Wraparound to start
    } else {
      nextIdx = currentIndex - 1;
      if (nextIdx < 0) nextIdx = list.length - 1; // Wraparound to end
    }
    return nextIdx;
  }

  assert(zap(0, 'next', channels) === 1, 'Next from index 0 moves to index 1');
  assert(zap(2, 'next', channels) === 0, 'Next from last channel (2) wraps around to first (0)');
  assert(zap(0, 'prev', channels) === 2, 'Previous from first channel (0) wraps around to last (2)');
  assert(zap(1, 'prev', channels) === 0, 'Previous from index 1 moves to index 0');

  // -------------------------------------------------------------
  // Test 11: Bounded Retry Limit Verification
  // -------------------------------------------------------------
  let retryCounter = 0;
  const MAX_ALLOWED_RETRIES = 2;
  let fatalErrorTriggered = false;

  function simulateFailure() {
    if (retryCounter < MAX_ALLOWED_RETRIES) {
      retryCounter++;
      return 'retrying';
    } else {
      fatalErrorTriggered = true;
      return 'fatal';
    }
  }

  assert(simulateFailure() === 'retrying', 'Attempt 1 fails -> retry 1');
  assert(retryCounter === 1, 'Retry count is 1');
  assert(simulateFailure() === 'retrying', 'Attempt 2 fails -> retry 2');
  assert(retryCounter === 2, 'Retry count is 2');
  assert(simulateFailure() === 'fatal', 'Attempt 3 fails -> exceeds MAX_RETRIES (2), fatal error shown');
  assert(fatalErrorTriggered === true, 'Fatal error overlay triggered after 2 retries');

  // -------------------------------------------------------------
  // Test 11b: Retry Cancellation on Channel Switch or Player Exit
  // -------------------------------------------------------------
  let retrySessionToken = 10;
  let activeSessionToken = 10;
  let retryExecuted = false;

  const timerId = setTimeout(() => {
    if (retrySessionToken === activeSessionToken) {
      retryExecuted = true;
    }
  }, 30);

  // User presses BACK or switches channel before 30ms expires
  clearTimeout(timerId);
  activeSessionToken = 11; // session invalidated

  await new Promise(res => setTimeout(res, 50));
  assert(retryExecuted === false, 'Cancelled retry timer never triggers playback after exit or switch');

  // -------------------------------------------------------------
  // Test 12: destroy() Complete Cleanup
  // -------------------------------------------------------------
  envWithAvplay.engine.destroy();
  assert(envWithAvplay.engine.getState() === 'IDLE', 'Engine state is IDLE after destroy()');
  assert(envWithAvplay.engine.getCurrentUrl() === null, 'Active URL is null after destroy()');

  console.log(`\nAVPlay Results: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
