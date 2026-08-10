const store = { local: {}, session: {} };

function fn(implementation) {
  const mockFunction = function () {
    mockFunction.mock.calls.push(Array.prototype.slice.call(arguments));
    return implementation ? implementation.apply(this, arguments) : undefined;
  };
  mockFunction.mock = { calls: [] };
  mockFunction.mockClear = function () { mockFunction.mock.calls = []; };
  return mockFunction;
}

function makeStorage(ns) {
  return {
    get: fn((keys) => {
      if (typeof keys === 'string') return Promise.resolve({ [keys]: store[ns][keys] });
      const result = {};
      (Array.isArray(keys) ? keys : Object.keys(keys)).forEach((k) => { result[k] = store[ns][k]; });
      return Promise.resolve(result);
    }),
    set: fn((obj) => { Object.assign(store[ns], obj); return Promise.resolve(); }),
    remove: fn((keys) => {
      (Array.isArray(keys) ? keys : [keys]).forEach((k) => { delete store[ns][k]; });
      return Promise.resolve();
    }),
  };
}

global.chrome = {
  storage: { local: makeStorage('local'), session: makeStorage('session') },
  alarms: { create: fn(), clear: fn() },
  downloads: { download: fn(), setUiOptions: fn(() => Promise.resolve()) },
  permissions: { contains: fn(() => Promise.resolve(true)), request: fn(() => Promise.resolve(true)) },
  runtime: {
    sendMessage: fn(() => Promise.resolve()),
    lastError: null,
    connect: fn(() => ({
      onMessage: { addListener: fn() },
      onDisconnect: { addListener: fn() },
      postMessage: fn(),
      disconnect: fn(),
    })),
  },
  commands: {
    getAll: fn(() => Promise.resolve([{ name: 'convert-page', shortcut: 'Alt+Shift+M' }])),
    onCommand: { addListener: fn() },
  },
  tabs: { query: fn(() => Promise.resolve([])), create: fn() },
  action: { setBadgeText: fn(), setBadgeBackgroundColor: fn() },

};

global.window = global.window || global;
global.W2M = {};
global.self = global;
global.document = {
  createElement: fn(() => ({
    className: '', textContent: '', style: { cssText: '' },
    dataset: {}, setAttribute: fn(), appendChild: fn(),
    addEventListener: fn(), classList: { add: fn(), remove: fn() },
    firstChild: null, removeChild: fn(),
  })),
  createTextNode: fn((t) => ({ textContent: t })),
  documentElement: { setAttribute: fn() },
};
global.Node = function () {};
global.requestAnimationFrame = (cb) => cb();
global.navigator = { language: 'en-US' };
global.CustomEvent = class CustomEvent { constructor(type, opts) { this.type = type; this.detail = opts?.detail; } };

global.__resetChromeStore = () => {
  store.local = {};
  store.session = {};
};
global.__testFn = fn;
