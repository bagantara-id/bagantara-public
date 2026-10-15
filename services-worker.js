const CACHE_NAME = 'bgn-core-v7';
const TILE_CACHE_NAME = 'bgn-map-tiles-v1';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/theme.css',
    './css/map.css',
    './css/theme-chat-publik.css'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)));
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then((keys) => {
        return Promise.all(keys.map((key) => {
            if (key !== CACHE_NAME && key !== TILE_CACHE_NAME) return caches.delete(key);
        }));
    }));
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    const url = e.request.url;
    const urlObj = new URL(url);

    if (url.includes('basemaps.cartocdn.com') || url.includes('tile.openstreetmap.org') || url.includes('api.maptiler.com/maps/')) {
        e.respondWith(
            caches.open(TILE_CACHE_NAME).then((cache) => {
                return cache.match(e.request).then((cachedResponse) => {
                    if (cachedResponse) return cachedResponse;
                    return fetch(e.request).then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            cache.put(e.request, networkResponse.clone());
                        }
                        return networkResponse;
                    });
                });
            })
        );
        return;
    }

    if (url.includes('firebasedatabase.app') || 
        url.includes('firestore.googleapis.com') || 
        url.includes('photon.komoot.io') || 
        url.includes('api.maptiler.com/geocoding/') ||
        url.includes('project-osrm.org') ||
        url.includes('script.google.com') ||
        urlObj.pathname.endsWith('.json')) {
        return; 
    }

    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request, { ignoreSearch: true }))
    );
});