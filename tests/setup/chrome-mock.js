const store = { local: {}, session: {} };

function makeStorage(ns) {
  return {
    get: jest.fn((keys) => {
      if (typeof keys === 'string') return Promise.resolve({ [keys]: store[ns][keys] });
      const result = {};
      (Array.isArray(keys) ? keys : Object.keys(keys)).forEach((k) => { result[k] = store[ns][k]; });
      return Promise.resolve(result);
    }),
    set: jest.fn((obj) => { Object.assign(store[ns], obj); return Promise.resolve(); }),
    remove: jest.fn((keys) => {
      (Array.isArray(keys) ? keys : [keys]).forEach((k) => { delete store[ns][k]; });
      return Promise.resolve();
    }),
  };
}

global.chrome = {
  storage: { local: makeStorage('local'), session: makeStorage('session') },
  alarms: { create: jest.fn(), clear: jest.fn() },
  downloads: { download: jest.fn(), setUiOptions: jest.fn(() => Promise.resolve()) },
  runtime: { sendMessage: jest.fn(() => Promise.resolve()), lastError: null },
  action: { setBadgeText: jest.fn(), setBadgeBackgroundColor: jest.fn() },
};

global.window = global.window || global;
global.W2M = {};
global.self = global;
global.document = {
  createElement: jest.fn(() => ({
    className: '', textContent: '', style: { cssText: '' },
    dataset: {}, setAttribute: jest.fn(), appendChild: jest.fn(),
    addEventListener: jest.fn(), classList: { add: jest.fn(), remove: jest.fn() },
    firstChild: null, removeChild: jest.fn(),
  })),
  createTextNode: jest.fn((t) => ({ textContent: t })),
  documentElement: { setAttribute: jest.fn() },
};
global.Node = function () {};
global.requestAnimationFrame = (cb) => cb();
global.navigator = { language: 'en-US' };
global.CustomEvent = class CustomEvent { constructor(type, opts) { this.type = type; this.detail = opts?.detail; } };

if (typeof beforeEach === 'function') {
  beforeEach(() => {
    store.local = {};
    store.session = {};
    jest.clearAllMocks();
  });
}

global.__resetChromeStore = () => {
  store.local = {};
  store.session = {};
};
