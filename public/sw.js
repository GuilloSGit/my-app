const CACHE_NAME = 'media-agua-v1';

console.log('[SW] Service Worker script loaded');

// Determine base path based on environment
const isDevelopment = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';
const basePath = isDevelopment ? '' : '/my-app';

const urlsToCache = [
  `${basePath}/`,
  `${basePath}/manifest.json`,
  `${basePath}/android-chrome-192x192.png`,
  `${basePath}/android-chrome-512x512.png`,
  `${basePath}/favicon-32x32.png`,
  `${basePath}/favicon-16x16.png`
];

self.addEventListener('install', (event) => {
  console.log('[SW] Install event triggered');
  console.log('[SW] Base path:', basePath);
  console.log('[SW] URLs to cache:', urlsToCache);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cache opened, attempting to add URLs');
        // Add URLs one by one to handle individual failures
        return Promise.all(
          urlsToCache.map(url => 
            cache.add(url).catch(err => {
              console.warn(`[SW] Failed to cache ${url}:`, err);
              return Promise.resolve(); // Don't fail the entire cache operation
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] Install completed, skipping waiting');
        self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Install failed:', error);
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event triggered');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      console.log('[SW] Existing caches:', cacheNames);
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
    .then(() => {
      console.log('[SW] Claiming clients');
      self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  console.log('[SW] Fetch event for:', event.request.url);
  
  // Only cache GET requests to avoid issues with POST, PUT, etc.
  if (event.request.method !== 'GET') {
    console.log('[SW] Skipping non-GET request:', event.request.method);
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          console.log('[SW] Serving from cache:', event.request.url);
          return response;
        }
        console.log('[SW] Fetching from network:', event.request.url);
        
        // For development, don't cache Next.js internal routes
        if (isDevelopment && event.request.url.includes('/_next/')) {
          return fetch(event.request);
        }
        
        return fetch(event.request)
          .then((response) => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone the response since it can only be consumed once
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then((cache) => {
                console.log('[SW] Caching new response:', event.request.url);
                cache.put(event.request, responseToCache);
              });
            
            return response;
          })
          .catch((error) => {
            console.error('[SW] Network fetch failed:', error);
            
            // Try to serve from cache as fallback
            return caches.match(event.request);
          });
      })
      .catch((error) => {
        console.error('[SW] Fetch handler failed:', error);
        throw error;
      })
  );
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] Service Worker event listeners registered');
