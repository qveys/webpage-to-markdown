const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const backgroundCode = fs.readFileSync(path.join(__dirname, '../js/background.js'), 'utf8');
const safeAssetsCode = fs.readFileSync(path.join(__dirname, '../js/safe-assets.js'), 'utf8');
const MB = 1024 * 1024;
const IMAGE = '![image](https://example.com/image.png)';

function createStore(assetBytesUsed = 0) {
  return {
    session: {
      active: true,
      folder: 'capture',
      saveAssets: true,
      maxAssetSizeMb: 1,
      maxSessionAssetSizeMb: 1,
      capturedUrls: [],
      assetBytesUsed,
    },
  };
}

// A new VM is a new worker; only the storage object survives its termination.
function startWorker(store, { assetBytes = 8, failFetch = false, failDownload = false, beforeFetch, beforeDownload, beforeRead, afterRead, beforeWrite } = {}) {
  const writes = [];
  const downloads = [];
  const listeners = [];
  const event = () => ({ addListener() {} });
  const runtime = {
    onMessage: { addListener(listener) { listeners.push(listener); } },
    onConnect: event(),
    sendMessage: async () => {},
    lastError: null,
  };
  const storage = {
    async get(key, callback) {
      if (beforeRead) await beforeRead();
      const result = { [key]: structuredClone(store[key]) };
      if (afterRead) await afterRead();
      if (callback) callback(result);
      return result;
    },
    async set(patch) {
      if (beforeWrite) await beforeWrite(patch);
      Object.assign(store, structuredClone(patch));
      if (patch.session) writes.push(structuredClone(patch.session));
    },
  };
  const context = vm.createContext({
    URL, Uint8Array, TextDecoder, Buffer, setTimeout, clearTimeout,
    console: { ...console, warn() {} },
    chrome: {
      storage: { local: storage, session: { get: async () => ({}), set: async () => {} } },
      runtime,
      downloads: {
        setUiOptions: async () => {},
        download(options, callback) {
          downloads.push(options);
          if (options.url.startsWith('data:image/')) {
            if (beforeDownload) beforeDownload();
            if (failDownload) runtime.lastError = { message: 'Download failed' };
          }
          callback(1);
          runtime.lastError = null;
        },
      },
      permissions: { contains: async () => true },
      action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
      tabs: { query: async () => [], onRemoved: event() },
      webNavigation: {
        onCompleted: event(), onHistoryStateUpdated: event(), onReferenceFragmentUpdated: event(),
      },
      alarms: { onAlarm: event() },
      commands: { onCommand: event() },
    },
    CrawlEngine: class { async restoreState() {} },
    async fetch() {
      if (beforeFetch) await beforeFetch();
      if (failFetch) throw new Error('Fetch failed');
      const bytes = new Uint8Array(assetBytes);
      bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      return {
        ok: true,
        headers: { get: (name) => name === 'content-type' ? 'image/png' : String(assetBytes) },
        arrayBuffer: async () => bytes.buffer,
      };
    },
  });
  context.self = context;
  context.importScripts = (file) => {
    if (file === '/js/safe-assets.js') vm.runInContext(safeAssetsCode, context);
  };
  vm.runInContext(backgroundCode, context);
  return {
    writes,
    downloads,
    budgetUsed: () => vm.runInContext('sessionAssetBudget.used', context),
    capture: (folder = 'capture') => context.downloadInSession(IMAGE, 'page', folder, 'https://example.com/page'),
    setSession: (patch) => context.setSession(patch),
    message: (message) => new Promise((resolve) => listeners[0](message, {}, resolve)),
  };
}

describe('auto-capture asset budget persistence', () => {
  test('restores committed bytes in a new worker and enforces the combined limit', async () => {
    const store = createStore();
    const first = startWorker(store, { assetBytes: MB });
    await first.capture();
    assert.equal(first.budgetUsed(), MB);

    const restarted = startWorker(store);
    await restarted.capture();
    assert.equal(restarted.downloads.filter((d) => d.url.startsWith('data:image/')).length, 0);
    assert.equal(restarted.budgetUsed(), MB);
    assert.equal(store.session.assetBytesUsed, MB);
  });

  test('persists reservation before fetch, actual bytes before download, and the successful commit', async () => {
    const store = createStore(20);
    const worker = startWorker(store, {
      beforeFetch: () => assert.equal(store.session.assetBytesUsed, MB),
      beforeDownload: () => assert.equal(store.session.assetBytesUsed, 28),
    });
    await worker.capture();
    assert.deepEqual(worker.writes.map((s) => s.assetBytesUsed), [MB, 28, 28]);
    assert.equal(worker.budgetUsed(), 28);
    assert.equal(store.session.folder, 'capture');
    assert.equal(store.session.active, true);
    assert.match(decodeURIComponent(worker.downloads.at(-1).url), /\.\/assets\//);
  });

  for (const failure of ['failFetch', 'failDownload']) {
    test(`${failure} refunds the memory and stored counters, including after restart`, async () => {
      const store = createStore(20);
      const worker = startWorker(store, { [failure]: true });
      await worker.capture();
      assert.equal(worker.budgetUsed(), 20);
      assert.equal(store.session.assetBytesUsed, 20);
      const restarted = startWorker(store);
      await restarted.capture();
      assert.equal(store.session.assetBytesUsed, 28);
      assert.equal(restarted.budgetUsed(), 28);
    });
  }

  test('legacy sessions without a counter begin at zero', async () => {
    const store = createStore();
    delete store.session.assetBytesUsed;
    const worker = startWorker(store);
    await worker.capture();
    assert.equal(store.session.assetBytesUsed, 8);
  });

  test('resuming the same folder preserves usage; a new session resets it', async () => {
    const store = createStore(20);
    const worker = startWorker(store);
    let response = await worker.message({ type: 'W2M_START_SESSION', folder: 'capture' });
    assert.equal(response.ok, true);
    assert.equal(store.session.assetBytesUsed, 20);
    assert.equal(worker.budgetUsed(), 20);
    response = await worker.message({ type: 'W2M_START_SESSION', folder: 'new-capture' });
    assert.equal(response.ok, true);
    assert.equal(store.session.assetBytesUsed, 0);
    assert.equal(worker.budgetUsed(), 0);
  });

  test('waits for asynchronous storage hydration before reserving bytes', async () => {
    const store = createStore(MB);
    let releaseRead;
    const readBlocked = new Promise((resolve) => { releaseRead = resolve; });
    const worker = startWorker(store, { beforeRead: () => readBlocked });
    const capture = worker.capture();
    await Promise.resolve();
    assert.equal(worker.downloads.length, 0);
    releaseRead();
    await capture;
    assert.equal(worker.budgetUsed(), MB);
    assert.equal(worker.downloads.filter((d) => d.url.startsWith('data:image/')).length, 0);
  });

  test('a restart during a reservation cannot spend its bytes again', async () => {
    const store = createStore();
    let releaseFetch;
    let fetchStarted;
    const fetching = new Promise((resolve) => { fetchStarted = resolve; });
    const fetchBlocked = new Promise((resolve) => { releaseFetch = resolve; });
    const first = startWorker(store, {
      beforeFetch: async () => { fetchStarted(); await fetchBlocked; },
    });
    const capture = first.capture();
    await fetching;
    assert.equal(store.session.assetBytesUsed, MB);
    const restarted = startWorker(store);
    await restarted.capture();
    assert.equal(restarted.downloads.filter((d) => d.url.startsWith('data:image/')).length, 0);
    releaseFetch();
    await capture;
  });

  test('concurrent pages share the same reservation and cannot exceed the limit', async () => {
    const store = createStore();
    const worker = startWorker(store, { assetBytes: MB });
    await Promise.all([worker.capture(), worker.capture()]);
    assert.equal(worker.downloads.filter((d) => d.url.startsWith('data:image/')).length, 1);
    assert.equal(store.session.assetBytesUsed, MB);
    assert.equal(worker.budgetUsed(), MB);
  });

  test('concurrent session patches preserve the persisted budget and session metadata', async () => {
    const store = createStore(20);
    const worker = startWorker(store, {
      beforeWrite: async () => { await Promise.resolve(); },
    });
    await Promise.all([worker.capture(), worker.setSession({ delay: 500, capturedUrls: ['https://example.com/page'] })]);
    assert.equal(store.session.assetBytesUsed, 28);
    assert.equal(store.session.delay, 500);
    assert.deepEqual(store.session.capturedUrls, ['https://example.com/page']);
  });

  test('an old download refund cannot overwrite a new session budget', async () => {
    const store = createStore(20);
    let releaseFetch;
    let fetchStarted;
    const fetching = new Promise((resolve) => { fetchStarted = resolve; });
    const fetchBlocked = new Promise((resolve) => { releaseFetch = resolve; });
    const worker = startWorker(store, {
      failFetch: true,
      beforeFetch: async () => { fetchStarted(); await fetchBlocked; },
    });
    const capture = worker.capture();
    await fetching;
    await worker.message({ type: 'W2M_START_SESSION', folder: 'new-capture' });
    releaseFetch();
    await capture;
    assert.equal(store.session.folder, 'new-capture');
    assert.equal(store.session.assetBytesUsed, 0);
    assert.equal(worker.budgetUsed(), 0);
  });

  test('a delayed capture for an old folder cannot charge the new session budget', async () => {
    const store = createStore(20);
    const worker = startWorker(store, { assetBytes: MB });
    await worker.message({
      type: 'W2M_START_SESSION', folder: 'new-capture',
      maxAssetSizeMb: 1, maxSessionAssetSizeMb: 1,
    });

    // Extraction from the previous session finishes after the folder changed.
    await assert.rejects(worker.capture('capture'), /Capture session is no longer current/);
    assert.equal(worker.downloads.length, 0);
    assert.equal(worker.budgetUsed(), 0);
    assert.equal(store.session.assetBytesUsed, 0);

    await worker.capture('new-capture');
    assert.equal(worker.budgetUsed(), MB);
    assert.equal(store.session.assetBytesUsed, MB);
    const restarted = startWorker(store);
    await restarted.capture('new-capture');
    assert.equal(restarted.budgetUsed(), MB);
    assert.equal(restarted.downloads.filter((d) => d.url.startsWith('data:image/')).length, 0);
  });

  test('a session switch during a capture storage read rejects its stale snapshot', async () => {
    const store = createStore(20);
    let pauseNextRead = false;
    let releaseRead;
    let readStarted;
    const reading = new Promise((resolve) => { readStarted = resolve; });
    const readBlocked = new Promise((resolve) => { releaseRead = resolve; });
    const worker = startWorker(store, {
      afterRead: async () => {
        if (!pauseNextRead) return;
        pauseNextRead = false;
        readStarted();
        await readBlocked;
      },
    });
    await worker.setSession({ delay: 500 });
    pauseNextRead = true;
    const capture = worker.capture('capture');
    await reading;
    await worker.message({ type: 'W2M_START_SESSION', folder: 'new-capture' });
    releaseRead();
    await assert.rejects(capture, /Capture session is no longer current/);
    assert.equal(worker.downloads.length, 0);
    assert.equal(worker.budgetUsed(), 0);
    assert.equal(store.session.assetBytesUsed, 0);
  });

  test('an old-folder capture is refused while the new session storage write is pending', async () => {
    const store = createStore(20);
    let releaseWrite;
    let writeStarted;
    const writing = new Promise((resolve) => { writeStarted = resolve; });
    const writeBlocked = new Promise((resolve) => { releaseWrite = resolve; });
    const worker = startWorker(store, {
      beforeWrite: async (patch) => {
        if (patch.session?.folder !== 'new-capture') return;
        writeStarted();
        await writeBlocked;
      },
    });
    const starting = worker.message({ type: 'W2M_START_SESSION', folder: 'new-capture' });
    await writing;
    assert.equal(store.session.folder, 'capture');
    await assert.rejects(worker.capture('capture'), /Capture session is no longer current/);
    assert.equal(worker.downloads.length, 0);
    assert.equal(worker.budgetUsed(), 0);
    assert.equal(store.session.assetBytesUsed, 20);
    releaseWrite();
    await starting;
    assert.equal(store.session.assetBytesUsed, 0);
  });

  test('an oversized asset still fails validation and refunds the persisted reservation', async () => {
    const store = createStore(20);
    const worker = startWorker(store, { assetBytes: MB + 1 });
    await worker.capture();
    assert.equal(worker.downloads.filter((d) => d.url.startsWith('data:image/')).length, 0);
    assert.equal(store.session.assetBytesUsed, 20);
    assert.equal(worker.budgetUsed(), 20);
  });

  test('a failed reservation write prevents fetch and refunds the counter', async () => {
    const store = createStore(20);
    let failWrite = true;
    let fetched = false;
    const worker = startWorker(store, {
      beforeFetch: () => { fetched = true; },
      beforeWrite: () => {
        if (failWrite) { failWrite = false; throw new Error('Storage failed'); }
      },
    });
    await worker.capture();
    assert.equal(fetched, false);
    assert.equal(store.session.assetBytesUsed, 20);
    assert.equal(worker.budgetUsed(), 20);
  });
});
