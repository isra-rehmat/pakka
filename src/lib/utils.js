import { supabase } from '../supabase'

/* ---------------- Dates (always the phone's local day) ---------------- */
export const dayStr = (d = new Date()) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
export const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const today = () => dayStr()
export const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const isScheduled = (habit, date) => (habit.days || [0, 1, 2, 3, 4, 5, 6]).includes(date.getDay())

export function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'abhi'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}
export const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export function greeting(name) {
  const h = new Date().getHours()
  const first = (name || '').split(' ')[0]
  if (h < 5) return `Abhi tak jaag rahe ho, ${first}? 🦉`
  if (h < 12) return `Subha bakhair, ${first}! ☀️`
  if (h < 17) return `Kya haal hai, ${first}? 😎`
  if (h < 21) return `Shaam ho gayi, ${first}! 🌇`
  return `Raat ho gayi, ${first} 🌙`
}

/* ---------------- Levels, titles, avatars ---------------- */
// Level n starts at 50*n*(n-1) XP: L2=100, L3=300, L4=600, L5=1000 ...
export const levelFromXp = (xp) => Math.max(1, Math.floor(0.5 + Math.sqrt(0.25 + Math.max(0, xp) / 50)))
export const xpForLevel = (n) => 50 * n * (n - 1)
export function levelProgress(xp) {
  const lvl = levelFromXp(xp)
  const start = xpForLevel(lvl), end = xpForLevel(lvl + 1)
  return { lvl, into: Math.max(0, xp - start), need: end - start, pct: Math.min(100, Math.max(0, ((xp - start) / (end - start)) * 100)) }
}

export const TITLES = [
  { lvl: 1, t: 'Naya Khiladi 🐣' },
  { lvl: 2, t: 'Shuru Ho Gaya 🚶' },
  { lvl: 3, t: 'Mehnati 💪' },
  { lvl: 5, t: 'Consistent 🔥' },
  { lvl: 7, t: 'Ustaad 🎯' },
  { lvl: 10, t: 'Sher 🦁' },
  { lvl: 15, t: 'Legend 👑' }
]
export const AVATARS = [
  { lvl: 1, list: ['😎', '🙂', '🐱', '🐶', '🦊', '🐼', '🐻', '🐰'] },
  { lvl: 3, list: ['🦁', '🐯', '🐸', '🐵', '🐨', '🐧'] },
  { lvl: 5, list: ['🤖', '👽', '🥷', '🧙', '🦸', '🧕'] },
  { lvl: 8, list: ['🐉', '🦄', '👑', '🔥', '💎', '🚀'] }
]

/* ---------------- Habits ---------------- */
export const PROOF = {
  none: { label: 'Tick', xp: 10, hint: 'Just tap done' },
  photo: { label: 'Photo', xp: 15, hint: 'Add a photo' },
  approval: { label: 'Photo + OK', xp: 20, hint: 'Partner approves' }
}
export const HABIT_EMOJIS = ['💪', '🏃', '📚', '💧', '🧘', '🕌', '🥗', '😴', '🦷', '🧹', '✍️', '🎨', '🎬', '💻', '🚭', '📵', '🛏️', '🚶', '🍎', '💊', '🙏', '🧠', '💰', '🎯']

// Streak: count back through scheduled days that have a done/pending check-in.
// Today does not break the streak until the day is over.
export function streakFor(habit, doneSet, todayDate = new Date()) {
  let d = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate())
  const created = parseDay(dayStr(new Date(habit.since || habit.created_at)))
  if (!doneSet.has(dayStr(d))) d = addDays(d, -1)
  let s = 0
  for (let i = 0; i < 1000 && d >= created; i++) {
    if (isScheduled(habit, d)) {
      if (doneSet.has(dayStr(d))) s++
      else break
    }
    d = addDays(d, -1)
  }
  return s
}
export function bestStreakFor(habit, doneSet, todayDate = new Date()) {
  let d = parseDay(dayStr(new Date(habit.since || habit.created_at)))
  const end = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate())
  let best = 0, run = 0
  for (let i = 0; i < 2000 && d <= end; i++) {
    if (isScheduled(habit, d)) {
      if (doneSet.has(dayStr(d))) { run++; best = Math.max(best, run) }
      else if (dayStr(d) !== dayStr(end)) run = 0
    }
    d = addDays(d, 1)
  }
  return best
}
// Missed scheduled days in the last N days (not counting today)
export function missedDays(habit, doneSet, n = 7) {
  const out = []
  const created = parseDay(dayStr(new Date(habit.since || habit.created_at)))
  const base = new Date(); base.setHours(0, 0, 0, 0)
  for (let i = 1; i <= n; i++) {
    const d = addDays(base, -i)
    if (d <= created) break
    if (isScheduled(habit, d) && !doneSet.has(dayStr(d))) out.push(dayStr(d))
  }
  return out
}
// Map of habit_id -> Set(days counted as done)
export function doneSets(checkins) {
  const m = {}
  for (const c of checkins) {
    if (c.status === 'rejected') continue
    ;(m[c.habit_id] ||= new Set()).add(c.day)
  }
  return m
}

/* ---------------- Saza presets ---------------- */
export const DARES = ['20 pushups 💪', 'No gaming tonight 🎮❌', 'Sab ke liye chai banao ☕', 'Bartan dho do 🍽️', 'Kamra saaf karo 🧹', '30 min walk 🚶', 'No phone 1 hour 📵']
export const SHAME_BADGES = ['🐌 Sust Insaan', '🤡 Bahana Master', '😴 Neend ka Shehzada', '🥔 Couch Potato', '🐢 Kal Karunga', '🦥 Aalsi No.1']
export const XP_PENALTIES = [0, 10, 25, 50, 100]
export const POKES = ['Oye! 👀 Kaam karo!', 'Uth jao! ⏰', 'Bahane nahi chalenge 😤', 'Abhi karo, baad mein nahi! 🔥']
export const CHEERS = ['Shabash! 🎉', 'Zabardast! 🔥', 'Kya baat hai! 👏', 'Proud of you! 💖']

/* ---------------- Photos ---------------- */
export async function compressImage(file, max = 1080, quality = 0.72) {
  const bmp = await createImageBitmap(file).catch(() => null)
  let w, h, src
  if (bmp) { w = bmp.width; h = bmp.height; src = bmp }
  else {
    src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file) })
    w = src.naturalWidth; h = src.naturalHeight
  }
  const scale = Math.min(1, max / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.round(w * scale); c.height = Math.round(h * scale)
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height)
  return await new Promise((res) => c.toBlob(res, 'image/jpeg', quality))
}

export async function uploadProof(userId, file) {
  const blob = await compressImage(file)
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from('proofs').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw error
  return supabase.storage.from('proofs').getPublicUrl(path).data.publicUrl
}

// Opens the camera / gallery and resolves with a File (or null)
export function pickPhoto() {
  return new Promise((resolve) => {
    const inp = document.createElement('input')
    inp.type = 'file'; inp.accept = 'image/*'
    inp.onchange = () => resolve(inp.files?.[0] || null)
    inp.click()
  })
}

/* ---------------- Invites ---------------- */
export function inviteText(g) {
  const url = `${window.location.origin}${import.meta.env.BASE_URL}?join=${g.invite_code}`
  return { url, text: `Pakka pe hamare "${g.name}" group mein aao! Saath mil ke habits pakki karte hain 💪\nInvite code: ${g.invite_code}\n${url}` }
}
export async function shareInvite(g, toast) {
  const { url, text } = inviteText(g)
  if (navigator.share) {
    try { await navigator.share({ title: 'Pakka invite', text, url }); return } catch { return }
  }
  try { await navigator.clipboard.writeText(text); toast?.('Invite copy ho gaya! WhatsApp pe bhejo 📋', 'success') }
  catch { window.prompt('Ye copy karo:', text) }
}
export const whatsappInvite = (g) => window.open('https://wa.me/?text=' + encodeURIComponent(inviteText(g).text), '_blank')

/* ---------------- Chat extras ---------------- */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥']
export const STICKERS = {
  shabash: { e: '🎉', t: 'Shabash!' },
  pakka: { e: '🔥', t: 'Pakka!' },
  oye: { e: '👀', t: 'Oye!' },
  chai: { e: '☕', t: 'Chai break' },
  gym: { e: '💪', t: 'Gym time' },
  neend: { e: '😴', t: 'Neend aa rahi' },
  bahana: { e: '🙄', t: 'Bahane band' },
  hahaha: { e: '😂', t: 'Hahaha' },
  mashallah: { e: '✨', t: 'MashaAllah' },
  love: { e: '❤️', t: 'Pyaar' },
  deal: { e: '🤝', t: 'Deal!' },
  jiboss: { e: '🫡', t: 'Ji boss' }
}
export const habitStart = (h) => parseDay(dayStr(new Date(h.since || h.created_at)))
export const shortDay = (s) => DAY_NAMES[parseDay(s).getDay()]
