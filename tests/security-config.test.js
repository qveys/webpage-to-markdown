const fs = require('fs');
const path = require('path');
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');

describe('security configuration', () => {
  test('manifest uses optional origins and no tabs privilege', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    assert.equal(manifest.host_permissions, undefined);
    assert.deepEqual(manifest.optional_host_permissions, ['http://*/*', 'https://*/*']);
    assert.equal(manifest.permissions.includes('downloads.ui'), true);
    assert.equal(manifest.permissions.includes('tabs'), false);
  });

  test('GitHub Actions are pinned to immutable commit SHAs', () => {
    const workflowDir = path.join(root, '.github', 'workflows');
    const workflows = fs.readdirSync(workflowDir).filter((name) => name.endsWith('.yml'));
    for (const workflow of workflows) {
      const source = fs.readFileSync(path.join(workflowDir, workflow), 'utf8');
      const uses = source.matchAll(/uses:\s+[^\s@]+@([^\s#]+)/g);
      for (const match of uses) {
        assert.match(match[1], /^[0-9a-f]{40}$/, `${workflow} contains an unpinned action`);
      }
    }
  });

  test('crawl downloads never pass saveAs with a known filename', () => {
    const source = [
      fs.readFileSync(path.join(root, 'js', 'background.js'), 'utf8'),
      fs.readFileSync(path.join(root, 'js', 'crawl-engine.js'), 'utf8'),
    ].join('\n');
    assert.doesNotMatch(source, /\bsaveAs\s*:/);
  });
});
