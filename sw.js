// sw.js - Geoscope Service Worker (PWA)
const CACHE_NAME = 'geoscope-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/brands.html',
  '/alerts.html',
  '/settings.html',
  '/brand-detail.html',
  '/login.html',
  '/signup.html',
  '/gs-client.js',
  '/gs-design.css',
  '/themes.js',
  '/manifest.json',
  '/offline.html',
];

// インストール：静的アセットをキャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS.filter(url => !url.includes('offline.html')));
    }).catch(() => {})
  );
  self.skipWaiting();
});

// アクティベート：古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// フェッチ戦略
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // APIリクエストはキャッシュしない（常にネットワーク）
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'オフラインです。ネットワーク接続を確認してください。' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503,
        })
      )
    );
    return;
  }

  // 外部リソース（fonts, cdn）はそのまま
  if (!url.hostname.includes('geoscope') && url.hostname !== location.hostname) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  // HTMLページ：ネットワーク優先 → キャッシュフォールバック
  if (request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return resp;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // その他（JS/CSS）：キャッシュ優先 → ネットワークフォールバック
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(resp => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return resp;
      });
    })
  );
});

// バックグラウンド同期（将来用）
self.addEventListener('sync', event => {
  if (event.tag === 'sync-scans') {
    // オフライン中にキューされたスキャンを送信
    event.waitUntil(Promise.resolve());
  }
});
