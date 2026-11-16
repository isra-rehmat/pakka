// In-memory fake Supabase used only for local screenshots (VITE_DEMO=1)
const ME = 'u-okasha', AMMI = 'u-ammi', SANA = 'u-sana', ALI = 'u-ali', HAMZA = 'u-hamza'
const ds = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA') }
const iso = (mins) => new Date(Date.now() - mins * 60000).toISOString()
const old = new Date(Date.now() - 30 * 86400000).toISOString()

const db = {
  profiles: [
    { id: ME, display_name: 'Okasha', avatar: '🦊', title: 'Mehnati 💪', bio: 'Video editor 🎬 · gamer', xp: 340, onboarded: true, push_chat: true, push_reminder: true },
    { id: AMMI, display_name: 'Ammi', avatar: '🧕', title: 'Consistent 🔥', bio: 'Sab ki boss', xp: 1210, onboarded: true },
    { id: SANA, display_name: 'Sana Awan', avatar: '🐱', title: 'Shuru Ho Gaya 🚶', xp: 150, onboarded: true },
    { id: ALI, display_name: 'Ali', avatar: '🐼', title: 'Naya Khiladi 🐣', bio: 'Gym rat', xp: 60, onboarded: true },
    { id: HAMZA, display_name: 'Hamza', avatar: '🐯', title: 'Naya Khiladi 🐣', bio: 'Ali ka dost', xp: 0, onboarded: true }
  ],
  groups: [
    { id: 'g1', name: 'Awan Family', emoji: '🏠', kind: 'general', invite_code: 'K7Q2XA', created_by: ME, created_at: old },
    { id: 'g2', name: 'Gym Bros', emoji: '💪', kind: 'focused', invite_code: 'GYM42B', created_by: ME, created_at: old }
  ],
  group_members: [
    ...[ME, AMMI, SANA].map((u) => ({ group_id: 'g1', user_id: u, role: u === ME ? 'admin' : 'member', joined_at: old })),
    ...[ME, ALI].map((u) => ({ group_id: 'g2', user_id: u, role: u === ME ? 'admin' : 'member', joined_at: old }))
  ],
  join_requests: [{ group_id: 'g2', user_id: HAMZA, created_at: iso(40) }],
  partnerships: [
    { id: 'p1', user_id: ME, partner_id: AMMI, status: 'active', created_at: old },
    { id: 'p2', user_id: SANA, partner_id: ME, status: 'active', created_at: old },
    { id: 'p3', user_id: ALI, partner_id: ME, status: 'pending', created_at: old }
  ],
  habits: [
    { id: 'h1', user_id: ME, group_id: null, title: '10 page parhna', emoji: '📚', days: [0, 1, 2, 3, 4, 5, 6], proof: 'approval', xp: 20, archived: false, created_at: old },
    { id: 'h2', user_id: ME, group_id: null, title: '8 glass paani', emoji: '💧', days: [0, 1, 2, 3, 4, 5, 6], proof: 'none', xp: 10, archived: false, created_at: old },
    { id: 'h3', user_id: ME, group_id: null, title: 'Raat 12 se pehle sona', emoji: '😴', days: [0, 1, 2, 3, 4, 5, 6], proof: 'none', xp: 10, archived: false, created_at: old },
    { id: 'h4', user_id: ME, group_id: 'g2', title: 'Gym', emoji: '🏋️', days: [0, 1, 2, 3, 4, 5, 6], proof: 'photo', xp: 15, archived: false, created_at: old },
    { id: 'h5', user_id: SANA, group_id: null, title: 'Quran parhna', emoji: '🕌', days: [0, 1, 2, 3, 4, 5, 6], proof: 'none', xp: 10, archived: false, created_at: old },
    { id: 'h6', user_id: SANA, group_id: null, title: 'Walk 20 min', emoji: '🚶', days: [0, 1, 2, 3, 4, 5, 6], proof: 'approval', xp: 20, archived: false, created_at: old }
  ],
  checkins: [],
  sazas: [
    { id: 's1', target_id: ME, issued_by: AMMI, habit_id: 'h3', reason: 'Raat 12 se pehle sona: 2 din miss (Fri, Sat)', xp_penalty: 20, dare: 'Sab ke liye chai banao ☕', shame_badge: '🐢 Kal Karunga', lock_rewards: false, status: 'active', created_at: iso(90) },
    { id: 's2', target_id: SANA, issued_by: AMMI, habit_id: 'h6', reason: 'Walk 20 min: 3 din miss', xp_penalty: 30, dare: null, shame_badge: null, lock_rewards: true, status: 'appealed', appeal_reason: 'Barish ho rahi thi teeno din 🌧️', appealed_at: iso(30), created_at: iso(200) }
  ],
  xp_events: [
    { id: 1, user_id: ME, amount: 10, reason: 'Check-in: 8 glass paani', created_at: iso(30) },
    { id: 2, user_id: ME, amount: -20, reason: 'Saza Card', created_at: iso(90) },
    { id: 3, user_id: ME, amount: 25, reason: 'Achievement: Hat-trick', created_at: iso(600) }
  ],
  notifications: [
    { id: 1, user_id: ME, from_id: AMMI, type: 'saza', message: '😈 Ammi ne tumhe Saza Card diya! -20 XP. Dare: Sab ke liye chai banao ☕.', read: false, created_at: iso(90) },
    { id: 2, user_id: ME, from_id: HAMZA, type: 'join_request', ref_id: 'g2', message: 'Hamza "Gym Bros" join karna chahte hain 🙋', read: false, created_at: iso(40) },
    { id: 3, user_id: ME, from_id: SANA, type: 'cheer', message: '🎉 Sana Awan: Zabardast! 🔥', read: true, created_at: iso(800) }
  ],
  messages: [
    { id: 1, group_id: 'g1', user_id: ME, kind: 'system', content: '🎉 Okasha ne "Awan Family" group banaya', created_at: iso(3000) },
    { id: 2, group_id: 'g1', user_id: AMMI, kind: 'text', content: 'Okasha beta aaj gym gaye?', created_at: iso(130) },
    { id: 3, group_id: 'g1', user_id: ME, kind: 'text', content: 'Ammi kal pakka 😅', created_at: iso(125) },
    { id: 4, group_id: 'g1', user_id: AMMI, kind: 'sticker', content: 'bahana', created_at: iso(124) },
    { id: 5, group_id: 'g1', user_id: SANA, kind: 'text', content: 'Hahaha chai ka intezar hai ☕', created_at: iso(85) },
    { id: 6, group_id: 'g1', user_id: SANA, kind: 'text', content: 'Double cheeni please', created_at: iso(84) },
    { id: 7, group_id: 'g1', user_id: ME, kind: 'sticker', content: 'jiboss', created_at: iso(20) },
    { id: 8, group_id: 'g2', user_id: ALI, kind: 'text', content: 'Aaj leg day hai 🦵', created_at: iso(15) }
  ],
  message_reactions: [
    { message_id: 3, user_id: SANA, emoji: '😂' }, { message_id: 3, user_id: AMMI, emoji: '😂' }, { message_id: 6, user_id: ME, emoji: '👍' }
  ],
  achievements: [
    { user_id: ME, code: 'first_checkin', name: 'Pehla Qadam' },
    { user_id: ME, code: 'streak_3', name: 'Hat-trick' },
    { user_id: ME, code: 'team_player', name: 'Team Player' }
  ],
  todos: [
    { id: 't1', user_id: ME, title: 'Bijli ka bill jama karwana', done: false, created_at: iso(500) },
    { id: 't2', user_id: ME, title: 'Client ki wedding video export', done: false, created_at: iso(300) },
    { id: 't3', user_id: ME, title: 'Bike ki service', done: true, done_at: iso(60), created_at: iso(900) }
  ],
  push_subscriptions: []
}
for (let i = 1; i < 12; i++) {
  db.checkins.push({ id: 'c1-' + i, habit_id: 'h1', user_id: ME, day: ds(i), status: 'done', created_at: iso(i * 1440) })
  db.checkins.push({ id: 'c2-' + i, habit_id: 'h2', user_id: ME, day: ds(i), status: 'done', created_at: iso(i * 1440) })
  if (i > 2) db.checkins.push({ id: 'c3-' + i, habit_id: 'h3', user_id: ME, day: ds(i), status: 'done', created_at: iso(i * 1440) })
  if (i % 2) db.checkins.push({ id: 'c4-' + i, habit_id: 'h4', user_id: ME, day: ds(i), status: 'done', created_at: iso(i * 1440) })
  if (i % 3) db.checkins.push({ id: 'c5-' + i, habit_id: 'h5', user_id: SANA, day: ds(i), status: 'done', created_at: iso(i * 1440) })
}
db.checkins.push({ id: 'ct2', habit_id: 'h2', user_id: ME, day: ds(0), status: 'done', created_at: iso(30) })
db.checkins.push({ id: 'ct1', habit_id: 'h1', user_id: ME, day: ds(0), status: 'pending', created_at: iso(20) })
db.checkins.push({ id: 'ct4', habit_id: 'h4', user_id: ALI, day: ds(0), status: 'done', created_at: iso(15) })
db.checkins.push({ id: 'ct6', habit_id: 'h6', user_id: SANA, day: ds(0), status: 'pending', proof_url: '/icon-512.png', created_at: iso(15) })

let nextId = 1000
class Q {
  constructor(t) { this.t = t; this.f = []; this.op = 'select'; this.opts = {} }
  select(_c, o = {}) { if (this.op === 'select') this.opts = o; return this }
  eq(k, v) { this.f.push((r) => r[k] === v); return this }
  neq(k, v) { this.f.push((r) => r[k] !== v); return this }
  is(k, v) { this.f.push((r) => (r[k] ?? null) === v); return this }
  in(k, v) { this.f.push((r) => v.includes(r[k])); return this }
  gte(k, v) { this.f.push((r) => r[k] >= v); return this }
  order(k, o = {}) { this.ord = [k, o.ascending !== false]; return this }
  limit(n) { this.lim = n; return this }
  single() { this.one = true; return this }
  maybeSingle() { this.one = true; return this }
  insert(row) { this.op = 'insert'; this.row = row; return this }
  upsert(row) { this.op = 'upsert'; this.row = row; return this }
  update(row) { this.op = 'update'; this.row = row; return this }
  delete() { this.op = 'delete'; return this }
  run() {
    const tbl = (db[this.t] ||= [])
    const match = (r) => this.f.every((fn) => fn(r))
    if (this.op === 'insert' || this.op === 'upsert') {
      const rows = (Array.isArray(this.row) ? this.row : [this.row]).map((r) => ({ id: 'n' + nextId++, created_at: new Date().toISOString(), status: this.t === 'checkins' ? 'done' : r.status, ...r }))
      tbl.push(...rows); return { data: this.one ? rows[0] : rows, error: null }
    }
    if (this.op === 'update') { tbl.filter(match).forEach((r) => Object.assign(r, this.row)); return { data: null, error: null } }
    if (this.op === 'delete') { db[this.t] = tbl.filter((r) => !match(r)); return { data: null, error: null } }
    let rows = tbl.filter(match)
    if (this.ord) { const [k, asc] = this.ord; rows = [...rows].sort((a, b) => (a[k] > b[k] ? 1 : -1) * (asc ? 1 : -1)) }
    if (this.lim) rows = rows.slice(0, this.lim)
    if (this.opts.head) return { data: null, count: rows.length, error: null }
    return { data: this.one ? rows[0] : rows, count: rows.length, error: null }
  }
  then(res, rej) { return Promise.resolve(this.run()).then(res, rej) }
}

function habitsFor(u) {
  const groupsOf = db.group_members.filter((m) => m.user_id === u).map((m) => m.group_id)
  return db.habits.filter((h) => !h.archived && ((!h.group_id && h.user_id === u) || (h.group_id && groupsOf.includes(h.group_id))))
    .map((h) => ({ ...h, since: h.created_at }))
}

export function createMock() {
  const ch = { on() { return ch }, subscribe() { return ch } }
  return {
    auth: {
      getSession: async () => ({ data: { session: window.__demoLoggedOut ? null : { user: { id: ME } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithOAuth: async () => ({}),
      signOut: async () => ({})
    },
    from: (t) => new Q(t),
    rpc: async (name, args = {}) => {
      if (name === 'habits_for') return { data: habitsFor(args.p_user) }
      if (name === 'leaderboard') {
        const ids = db.group_members.filter((m) => m.group_id === args.p_group).map((m) => m.user_id)
        return { data: db.profiles.filter((p) => ids.includes(p.id)).map((p) => ({ user_id: p.id, display_name: p.display_name, avatar: p.avatar, title: p.title, xp: p.xp, weekly_xp: Math.round(p.xp / 5), done_week: Math.round(p.xp / 40) })) }
      }
      if (name === 'saza_options') return { data: { allowed: true, habits: [{ habit_id: 'h6', title: 'Walk 20 min', emoji: '🚶', missed: [ds(1), ds(2), ds(4)] }, { habit_id: 'h5', title: 'Quran parhna', emoji: '🕌', missed: [ds(3)] }] } }
      if (name === 'join_group') return { data: { status: 'requested', name: 'Awan Family' }, error: null }
      return { data: db.groups[0], error: null }
    },
    channel: () => ch,
    removeChannel: () => {},
    storage: { from: () => ({ upload: async () => ({}), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) }
  }
}
