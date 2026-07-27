export function registerSW(): void {
  if (typeof window === 'undefined') return;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('SW registered: ', registration.scope);

          // Check for updates periodically
          setInterval(() => {
            registration.update().catch(() => {
              // Update check failed silently
            });
          }, 60 * 60 * 1000); // Every hour
        })
        .catch((error) => {
          console.log('SW registration failed: ', error);
        });
    });
  }
}
