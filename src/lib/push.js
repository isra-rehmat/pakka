import { supabase } from '../supabase'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone

function keyBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function save(sub) {
  const j = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent.slice(0, 300)
  })
  if (error) throw error
}

// 'unsupported' | 'ios-install' | 'denied' | 'on' | 'off'
export async function pushState() {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

export async function enablePush() {
  if (!pushSupported()) throw new Error(isIOS() ? 'iPhone par pehle app ko Home Screen par add karo' : 'Is browser mein notifications nahi chalti')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Notification ki permission nahi mili')
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) })
  await save(sub)
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
}

// keep the server copy fresh on every app open
export async function resyncPush() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) await save(sub)
  } catch { /* ignore */ }
}
