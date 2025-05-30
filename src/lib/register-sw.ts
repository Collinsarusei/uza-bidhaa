declare global {
  interface Window {
    workbox: any;
  }
}

interface WorkboxEvent {
  type: string;
  target: any;
}

export function registerServiceWorker() {
  if (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    window.workbox !== undefined
  ) {
    const wb = window.workbox;

    // Add event listeners to handle PWA lifecycle
    addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SKIP_WAITING') {
        wb.messageSkipWaiting();
      }
    });

    wb.addEventListener('installed', (event: WorkboxEvent) => {
      console.log(`Event ${event.type} is triggered.`);
      console.log(event);
    });

    wb.addEventListener('controlling', (event: WorkboxEvent) => {
      console.log(`Event ${event.type} is triggered.`);
      console.log(event);
    });

    wb.addEventListener('activated', (event: WorkboxEvent) => {
      console.log(`Event ${event.type} is triggered.`);
      console.log(event);
    });

    // Send skip waiting to the service worker
    wb.addEventListener('waiting', (event: WorkboxEvent) => {
      console.log(`Event ${event.type} is triggered.`);
      console.log(event);
      wb.messageSkipWaiting();
    });

    // Register the service worker after event listeners are added
    wb.register();
  }
} 