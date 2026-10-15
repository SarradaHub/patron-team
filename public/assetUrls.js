export function assetUrlsFromHtml(html) {
  const urls = new Set();
  const pattern = /<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/gi;
  for (const match of html.matchAll(pattern)) {
    const url = match[1];
    if (/\.(?:js|css)(?:\?|$)/.test(url)) urls.add(url);
  }
  return [...urls];
}
