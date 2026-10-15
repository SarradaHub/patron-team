import { describe, it, expect } from 'vitest';
import { assetUrlsFromHtml } from '../public/assetUrls.js';

describe('assetUrlsFromHtml', () => {
  it('returns the built script and stylesheet, not the manifest', () => {
    const html = `
      <script type="module" src="/patron-team/assets/index-abc.js"></script>
      <link rel="stylesheet" href="/patron-team/assets/index-abc.css">
      <link rel="manifest" href="manifest.json">
    `;
    expect(assetUrlsFromHtml(html)).toEqual([
      '/patron-team/assets/index-abc.js',
      '/patron-team/assets/index-abc.css',
    ]);
  });
});
