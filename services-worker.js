const CACHE_NAME = 'bgn-core-v2';

// Hanya cache kerangka UI utama (Irit RAM HP)
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/theme.css',
    './css/map.css'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)));
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then((keys) => {
        return Promise.all(keys.map((key) => {
            if (key !== CACHE_NAME) return caches.delete(key);
        }));
    }));
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    // BYPASS MUTLAK: Jangan pernah cache API Peta, OSRM, Firebase, atau JSON dinamis
    const url = e.request.url;
    const urlObj = new URL(url);
    
    if (url.includes('firebasedatabase.app') || 
        url.includes('firestore.googleapis.com') || 
        url.includes('photon.komoot.io') || 
        url.includes('project-osrm.org') ||
        urlObj.pathname.endsWith('.json')) {
        return; 
    }

    // Strategi Ringan: Ambil dari internet, jika sinyal putus ambil dari Cache
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});
