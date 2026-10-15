import { assetUrlsFromHtml } from './assetUrls.js';

const CACHE_NAME = 'team-queue-v5';
const SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(SHELL);
      const shell = await cache.match('./index.html');
      const html = shell ? await shell.text() : '';
      const assets = assetUrlsFromHtml(html);
      if (assets.length > 0) await cache.addAll(assets);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

function isWorkerScript(url) {
  return url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/assetUrls.js');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isWorkerScript(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(cacheFirstAsset(request));
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic') {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match('./index.html')) || offlineResponse();
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic') {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineResponse();
  }
}

function offlineResponse() {
  return new Response('Offline', { status: 503, statusText: 'Offline' });
}
