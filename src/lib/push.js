import { supabase } from './supabase';
import { getCurrentUserId } from './user.js';
import { registerServiceWorker } from './sw';

// IMPORTANT: on mettra la VAPID PUBLIC KEY plus tard (Bloc Push 4)
// Pour l’instant on prépare la structure.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function enablePushNotifications() {
  // 1) Service Worker
  await registerServiceWorker();

  // 2) Permission
  if (!('Notification' in window)) throw new Error('Notifications non supportées.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permission refusée.');

  // 3) PushManager
  if (!('serviceWorker' in navigator)) throw new Error('Service Worker non supporté.');
  const reg = await navigator.serviceWorker.ready;

  if (!('PushManager' in window)) throw new Error('PushManager non supporté.');

  if (!VAPID_PUBLIC_KEY) throw new Error('VITE_VAPID_PUBLIC_KEY manquante (on la fera au bloc suivant).');

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });

  // 4) Stockage Supabase
  const userId = getCurrentUserId();
  const deviceId = `${navigator.userAgent}`; // MVP simple, on raffine après

  const subJson = sub.toJSON();

  const payload = {
    user_id: userId,
    device_id: deviceId,
    endpoint: subJson.endpoint,
    p256dh: subJson.keys.p256dh,
    auth: subJson.keys.auth,
    user_agent: navigator.userAgent,
    last_seen_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(payload, { onConflict: 'user_id,device_id' });

  if (error) throw error;

  return { ok: true };
}
