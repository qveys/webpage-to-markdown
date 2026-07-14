const vm = require('vm');
const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./setup/load-module');

// Jest sandboxes the global scope, so `global.window = global` only sets it
// on Jest's fake global. vm.runInThisContext runs in the real V8 global, so
// we must poke `window` there for the IIFE-based source files to find it,
// then pull the exports back into Jest's scope.
let STATES, TRANSITIONS, AppState;

before(() => {
  vm.runInThisContext('var window = globalThis; window.W2M = window.W2M || {};');
  loadModule('js/app-state.js');
  const W2M_real = vm.runInThisContext('window.W2M');
  STATES = W2M_real.STATES;
  TRANSITIONS = W2M_real.TRANSITIONS;
  AppState = W2M_real.AppState;
});

describe('AppState', () => {
  let state;
  beforeEach(() => { state = new AppState(); });

  test('starts in IDLE state', () => {
    assert.equal(state.getState(), STATES.IDLE);
  });

  test('valid transition IDLE -> CONVERTING succeeds', () => {
    state.navigate(STATES.CONVERTING, { url: 'http://test.com' });
    assert.equal(state.getState(), STATES.CONVERTING);
  });

  test('valid multi-step transition through crawl lifecycle', () => {
    state.navigate(STATES.PRECRAWL);
    assert.equal(state.getState(), STATES.PRECRAWL);
    state.navigate(STATES.RUNNING);
    assert.equal(state.getState(), STATES.RUNNING);
    state.navigate(STATES.PAUSED);
    assert.equal(state.getState(), STATES.PAUSED);
    state.navigate(STATES.RUNNING);
    assert.equal(state.getState(), STATES.RUNNING);
    state.navigate(STATES.CRAWL_SUCCESS);
    assert.equal(state.getState(), STATES.CRAWL_SUCCESS);
  });

  test('invalid transition IDLE -> SUCCESS is blocked', () => {
    // The IIFE code runs in the real V8 global (via vm.runInThisContext),
    // so we must spy on the real console, not Jest's sandboxed one.
    const realConsole = vm.runInThisContext('console');
    const origWarn = realConsole.warn;
    const calls = [];
    realConsole.warn = (...args) => calls.push(args);
    state.navigate(STATES.SUCCESS);
    realConsole.warn = origWarn;
    assert.equal(state.getState(), STATES.IDLE);
    assert.equal(calls.length, 1);
    assert.match(calls[0][0], /Invalid transition/);
  });

  test('navigate() stores data', () => {
    state.navigate(STATES.CONVERTING, { url: 'http://x.com' });
    assert.deepEqual(state.getData(), { url: 'http://x.com' });
  });

  test('updateData() merges partial data', () => {
    state.navigate(STATES.CONVERTING, { url: 'http://x.com', progress: 0 });
    state.updateData({ progress: 50 });
    assert.equal(state.getData().progress, 50);
    assert.equal(state.getData().url, 'http://x.com');
  });

  test('listeners are notified on navigate', () => {
    const listener = mock.fn();
    state.onStateChange(listener);
    state.navigate(STATES.CONVERTING);
    assert.equal(listener.mock.calls.length, 1);
    assert.equal(listener.mock.calls[0].arguments[0], STATES.CONVERTING);
    assert.equal(listener.mock.calls[0].arguments[1], STATES.IDLE);
    assert.equal(typeof listener.mock.calls[0].arguments[2], 'object');
  });

  test('same-state navigate is allowed (no transition check)', () => {
    state.navigate(STATES.CONVERTING);
    state.navigate(STATES.CONVERTING, { retry: true });
    assert.equal(state.getState(), STATES.CONVERTING);
    assert.deepEqual(state.getData(), { retry: true });
  });

  // Regression coverage for the popup-during-crawl fix: when the popup opens
  // mid-crawl, AppState starts in IDLE and must be able to jump directly to
  // any active or terminal crawl state to mirror the SW's authoritative state.
  test('valid transition IDLE -> RUNNING succeeds (popup opened mid-crawl)', () => {
    const realConsole = vm.runInThisContext('console');
    const origWarn = realConsole.warn;
    const calls = [];
    realConsole.warn = function () { calls.push(Array.prototype.slice.call(arguments)); };
    state.navigate(STATES.RUNNING);
    realConsole.warn = origWarn;
    assert.equal(state.getState(), STATES.RUNNING);
    assert.equal(calls.length, 0);
  });

  test('valid transition IDLE -> PAUSED succeeds (popup opened mid-crawl)', () => {
    const realConsole = vm.runInThisContext('console');
    const origWarn = realConsole.warn;
    const calls = [];
    realConsole.warn = function () { calls.push(Array.prototype.slice.call(arguments)); };
    state.navigate(STATES.PAUSED);
    realConsole.warn = origWarn;
    assert.equal(state.getState(), STATES.PAUSED);
    assert.equal(calls.length, 0);
  });

  test('valid transition IDLE -> CRAWL_SUCCESS succeeds (popup opened post-crawl)', () => {
    const realConsole = vm.runInThisContext('console');
    const origWarn = realConsole.warn;
    const calls = [];
    realConsole.warn = function () { calls.push(Array.prototype.slice.call(arguments)); };
    state.navigate(STATES.CRAWL_SUCCESS);
    realConsole.warn = origWarn;
    assert.equal(state.getState(), STATES.CRAWL_SUCCESS);
    assert.equal(calls.length, 0);
  });

  test('valid transition IDLE -> CRAWL_PARTIAL succeeds (popup opened post-crawl)', () => {
    const realConsole = vm.runInThisContext('console');
    const origWarn = realConsole.warn;
    const calls = [];
    realConsole.warn = function () { calls.push(Array.prototype.slice.call(arguments)); };
    state.navigate(STATES.CRAWL_PARTIAL);
    realConsole.warn = origWarn;
    assert.equal(state.getState(), STATES.CRAWL_PARTIAL);
    assert.equal(calls.length, 0);
  });
});
