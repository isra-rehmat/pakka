// Minimal Web Push sender (RFC 8291 aes128gcm + RFC 8292 VAPID) using only Web Crypto.
// Works in Deno (Supabase Edge Functions) and Node 20+.

const enc = new TextEncoder()
const subtle = globalThis.crypto.subtle

export function b64urlToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}
export function bytesToB64url(bytes) {
  let s = ''
  for (const x of bytes) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
async function hmac(key, data) {
  const k = await subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await subtle.sign('HMAC', k, data))
}

// VAPID public key (uncompressed point) from the private JWK
export function vapidPublicKey(jwk) {
  return concat(new Uint8Array([4]), b64urlToBytes(jwk.x), b64urlToBytes(jwk.y))
}

async function vapidHeader(endpoint, jwk, subject) {
  const aud = new URL(endpoint).origin
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = bytesToB64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })))
  const key = await subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)))
  return `vapid t=${header}.${claims}.${bytesToB64url(sig)}, k=${bytesToB64url(vapidPublicKey(jwk))}`
}

// Encrypts payload for one subscription (aes128gcm, single record)
export async function encrypt(subscription, payloadBytes) {
  const uaPublic = b64urlToBytes(subscription.keys.p256dh)
  const authSecret = b64urlToBytes(subscription.keys.auth)
  const as = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPublic = new Uint8Array(await subtle.exportKey('raw', as.publicKey))
  const uaKey = await subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256))

  const prkKey = await hmac(authSecret, ecdhSecret)
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1]))
  const ikm = await hmac(prkKey, keyInfo)
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const prk = await hmac(salt, ikm)
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16)
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12)

  const aesKey = await subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const padded = concat(payloadBytes, new Uint8Array([2]))
  const cipher = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, padded))

  const rs = new Uint8Array([0, 0, 16, 0]) // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher)
}

// Sends one push. Returns the HTTP status (201/200 ok, 404/410 = subscription gone).
export async function sendPush(subscription, payload, { jwk, subject, ttl = 86400, urgency = 'normal', topic } = {}) {
  const body = await encrypt(subscription, enc.encode(JSON.stringify(payload)))
  const headers = {
    Authorization: await vapidHeader(subscription.endpoint, jwk, subject),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(ttl),
    Urgency: urgency
  }
  if (topic) headers.Topic = String(topic).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32)
  const res = await fetch(subscription.endpoint, { method: 'POST', headers, body })
  return res.status
}
