import { api } from './api';

let swRegistration: ServiceWorkerRegistration | null = null;

/**
 * Register the service worker and set up push notifications.
 * Call this once after user authenticates.
 */
export async function initializePushNotifications(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[Push] Push notifications not supported in this browser');
    return;
  }

  try {
    // Register service worker
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    console.log('[Push] Service worker registered');

    // Wait for the service worker to be ready
    await navigator.serviceWorker.ready;

    // Check if already subscribed
    const existingSub = await swRegistration.pushManager.getSubscription();
    if (existingSub) {
      console.log('[Push] Already subscribed, syncing with server');
      await sendSubscriptionToServer(existingSub);
      return;
    }

    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[Push] Notification permission denied');
      return;
    }

    // Get VAPID public key from server
    const { publicKey } = await api.getVapidPublicKey();
    if (!publicKey) {
      console.warn('[Push] No VAPID public key available');
      return;
    }

    // Subscribe to push
    const subscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });

    console.log('[Push] Subscribed successfully');

    // Send subscription to server
    await sendSubscriptionToServer(subscription);
  } catch (error) {
    console.error('[Push] Failed to initialize push notifications:', error);
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribePush(): Promise<void> {
  try {
    if (!swRegistration) return;
    const subscription = await swRegistration.pushManager.getSubscription();
    if (subscription) {
      await api.pushUnsubscribe(subscription.endpoint);
      await subscription.unsubscribe();
      console.log('[Push] Unsubscribed');
    }
  } catch (error) {
    console.error('[Push] Failed to unsubscribe:', error);
  }
}

async function sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  await api.pushSubscribe({
    endpoint: json.endpoint!,
    keys: {
      p256dh: json.keys!.p256dh,
      auth: json.keys!.auth,
    },
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
