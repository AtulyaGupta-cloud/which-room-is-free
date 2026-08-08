import { supabase } from './supabase';
import { getUsageDeviceId } from './usageTracking';

const VAPID_PUBLIC_KEY = 'BKeud6jkrdRYSLqnRnxF0XFBa9CoKzCGf0em5bCtKiMMtS03tVppg9O2bkfIO4F23v53GmBvO4SrcHs9z2iQs3c';

export type PushState = 'unsupported' | 'blocked' | 'ready' | 'enabled';

function base64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export function isStandaloneApp() {
  return window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export async function getPushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'blocked';
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? 'enabled' : 'ready';
}

export async function enablePushNotifications() {
  if (isIOS() && !isStandaloneApp()) {
    throw new Error('On iPhone, first add the app to your Home Screen, then enable notifications from the installed app.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not allowed.');

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const { error } = await supabase.functions.invoke('push-subscription', {
    body: { action: 'subscribe', deviceId: getUsageDeviceId(), subscription: subscription.toJSON() },
  });
  if (error) throw new Error('Could not save notification permission. Please try again.');
}

export async function reportInstalledApp() {
  if (!isStandaloneApp()) return;
  await supabase.functions.invoke('push-subscription', {
    body: {
      action: 'installed',
      deviceId: getUsageDeviceId(),
      platform: isIOS() ? 'ios' : /Android/i.test(navigator.userAgent) ? 'android' : 'desktop',
    },
  });
}
