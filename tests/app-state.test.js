const vm = require('vm');
const { loadModule } = require('./setup/load-module');

// Jest sandboxes the global scope, so `global.window = global` only sets it
// on Jest's fake global. vm.runInThisContext runs in the real V8 global, so
// we must poke `window` there for the IIFE-based source files to find it,
// then pull the exports back into Jest's scope.
let STATES, TRANSITIONS, AppState;

beforeAll(() => {
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
    expect(state.getState()).toBe(STATES.IDLE);
  });

  test('valid transition IDLE -> CONVERTING succeeds', () => {
    state.navigate(STATES.CONVERTING, { url: 'http://test.com' });
    expect(state.getState()).toBe(STATES.CONVERTING);
  });

  test('valid multi-step transition through crawl lifecycle', () => {
    state.navigate(STATES.PRECRAWL);
    expect(state.getState()).toBe(STATES.PRECRAWL);
    state.navigate(STATES.RUNNING);
    expect(state.getState()).toBe(STATES.RUNNING);
    state.navigate(STATES.PAUSED);
    expect(state.getState()).toBe(STATES.PAUSED);
    state.navigate(STATES.RUNNING);
    expect(state.getState()).toBe(STATES.RUNNING);
    state.navigate(STATES.CRAWL_SUCCESS);
    expect(state.getState()).toBe(STATES.CRAWL_SUCCESS);
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
    expect(state.getState()).toBe(STATES.IDLE);
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toEqual(expect.stringContaining('Invalid transition'));
  });

  test('navigate() stores data', () => {
    state.navigate(STATES.CONVERTING, { url: 'http://x.com' });
    expect(state.getData()).toEqual({ url: 'http://x.com' });
  });

  test('updateData() merges partial data', () => {
    state.navigate(STATES.CONVERTING, { url: 'http://x.com', progress: 0 });
    state.updateData({ progress: 50 });
    expect(state.getData().progress).toBe(50);
    expect(state.getData().url).toBe('http://x.com');
  });

  test('listeners are notified on navigate', () => {
    const listener = jest.fn();
    state.onStateChange(listener);
    state.navigate(STATES.CONVERTING);
    expect(listener).toHaveBeenCalledWith(STATES.CONVERTING, STATES.IDLE, expect.any(Object));
  });

  test('same-state navigate is allowed (no transition check)', () => {
    state.navigate(STATES.CONVERTING);
    state.navigate(STATES.CONVERTING, { retry: true });
    expect(state.getState()).toBe(STATES.CONVERTING);
    expect(state.getData()).toEqual({ retry: true });
  });
});
