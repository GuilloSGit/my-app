const CACHE_NAME = 'media-agua-v1';

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
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Add URLs one by one to handle individual failures
        return Promise.all(
          urlsToCache.map(url => 
            cache.add(url).catch(err => {
              return Promise.resolve(); // Don't fail the entire cache operation
            })
          )
        );
      })
      .then(() => {
        self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Install failed:', error);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            return caches.delete(name);
          })
      );
    })
    .then(() => {
      self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  
  // Only cache GET requests to avoid issues with POST, PUT, etc.
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        
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
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
