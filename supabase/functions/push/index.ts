// Pakka push sender. Called by the database (pg_net) with a batch of
// { subs: [{endpoint, keys:{p256dh, auth}}], payload: {title, body, url, tag} }.
// Keys and the shared secret live in Supabase Vault and are read through push_config().
import { sendPush } from './webpush.js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? '' } catch { return '' } })()

// deno-lint-ignore no-explicit-any
let cfg: any = null

async function rpc(name: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  })
  if (!res.ok) throw new Error(`${name} ${res.status} ${await res.text()}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

async function config() {
  if (!cfg) cfg = await rpc('push_config', {})
  return cfg
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: true })
  // deno-lint-ignore no-explicit-any
  let c: any
  try { c = await config() } catch (e) { return json({ error: 'config', detail: String(e) }, 500) }
  if (!c?.secret || req.headers.get('x-push-secret') !== c.secret) return json({ error: 'unauthorized' }, 401)

  // deno-lint-ignore no-explicit-any
  let batch: any[] = []
  try { batch = (await req.json()).batch ?? [] } catch { return json({ error: 'bad json' }, 400) }

  const gone: string[] = []
  const statuses: number[] = []
  const jobs: Promise<void>[] = []
  for (const item of batch) {
    for (const sub of item?.subs ?? []) {
      jobs.push((async () => {
        try {
          const st = await sendPush(sub, item.payload, {
            jwk: c.jwk, subject: c.subject, urgency: 'high', ttl: 86400, topic: item.payload?.tag
          })
          statuses.push(st)
          if (st === 404 || st === 410) gone.push(sub.endpoint)
        } catch (_e) {
          statuses.push(0)
        }
      })())
    }
  }
  await Promise.all(jobs)
  if (gone.length) { try { await rpc('push_cleanup', { p_endpoints: gone }) } catch (_e) { /* ignore */ } }
  return json({ sent: statuses.filter((s) => s >= 200 && s < 300).length, statuses, gone: gone.length })
})
