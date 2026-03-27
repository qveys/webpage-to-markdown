test('chrome mock is available', () => {
  expect(global.chrome).toBeDefined();
  expect(global.chrome.storage.local.get).toBeDefined();
});
