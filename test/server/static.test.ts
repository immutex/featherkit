import { describe, expect, it } from 'vitest';

import { resolveStaticFilePath } from '../../src/server/static.js';

describe('resolveStaticFilePath', () => {
  it('maps the root request to index.html inside the dist directory', () => {
    expect(resolveStaticFilePath('/tmp/dashboard-dist', '/')).toBe('/tmp/dashboard-dist/index.html');
  });

  it('keeps normal asset requests inside the dist directory', () => {
    expect(resolveStaticFilePath('/tmp/dashboard-dist', '/assets/app-12345678.js')).toBe(
      '/tmp/dashboard-dist/assets/app-12345678.js',
    );
  });

  it('rejects path traversal attempts', () => {
    expect(resolveStaticFilePath('/tmp/dashboard-dist', '../../package.json')).toBeNull();
    expect(resolveStaticFilePath('/tmp/dashboard-dist', '/%2e%2e/%2e%2e/package.json')).toBeNull();
  });
});
