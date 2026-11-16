import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Home as HomeIcon, Users, ShieldCheck, User, Bell } from 'lucide-react'
import { supabase, configured } from './supabase'
import { Toasts, Confetti } from './components/ui'
import { initBack, layersOpen } from './lib/nav'
import { resyncPush } from './lib/push'
import Login from './screens/Login'
import Onboarding from './screens/Onboarding'
import Home from './screens/Home'
import Groups, { GroupView } from './screens/Groups'
import Partners from './screens/Partners'
import Me from './screens/Me'
import Inbox from './screens/Inbox'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export default function App() {
  const [session, setSession] = useState(undefined)
  useEffect(() => {
    const url = new URL(window.location.href)
    const j = url.searchParams.get('join')
    if (j) {
      localStorage.setItem('pakka_join', j.trim().toUpperCase())
      url.searchParams.delete('join')
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])
  if (!configured) return <div className="splash"><p>App setup pending.</p></div>
  if (session === undefined) return <Splash />
  if (!session) return <Login />
  return <Main session={session} />
}

function Splash() {
  return <div className="splash"><img className="logo-big pulse" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" /></div>
}

const TABS = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'groups', label: 'Groups', Icon: Users },
  { id: 'partners', label: 'Partners', Icon: ShieldCheck },
  { id: 'me', label: 'Me', Icon: User }
]
const TITLES = { groups: 'Groups', partners: 'Partners', me: 'Me' }

const readSeen = () => { try { return JSON.parse(localStorage.getItem('pakka_seen') || '{}') } catch { return {} } }

function Main({ session }) {
  const uid = session.user.id
  const [me, setMe] = useState(null)
  const [people, setPeople] = useState({})
  const [groups, setGroups] = useState([])
  const [members, setMembers] = useState([])
  const [joinReqs, setJoinReqs] = useState([])
  const [partnerships, setPartnerships] = useState([])
  const [sazas, setSazas] = useState([])
  const [pendingReviews, setPendingReviews] = useState(0)
  const [unread, setUnread] = useState(0)
  const [lastMsgs, setLastMsgs] = useState({})
  const [seen, setSeen] = useState(readSeen)
  const [tab, setTabState] = useState('home')
  const [openGroup, setOpenGroup] = useState(null)
  const [groupTab, setGroupTab] = useState('chat')
  const [inboxOpen, setInboxOpen] = useState(false)
  const [version, setVersion] = useState(0)
  const [toasts, setToasts] = useState([])
  const [burst, setBurst] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [slide, setSlide] = useState('')
  const tabRef = useRef('home')
  const openGroupRef = useRef(null)
  const exitArmed = useRef(false)

  const bump = useCallback(() => setVersion((v) => v + 1), [])
  const toast = useCallback((text, kind = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t.slice(-2), { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])
  const celebrate = useCallback(() => setBurst(Date.now()), [])
  const setTab = useCallback((t, dir) => {
    if (t === tabRef.current) return
    const order = TABS.map((x) => x.id)
    setSlide(dir || (order.indexOf(t) > order.indexOf(tabRef.current) ? 'from-right' : 'from-left'))
    tabRef.current = t
    setTabState(t)
    window.scrollTo(0, 0)
  }, [])
  const markSeen = useCallback((gid) => {
    setSeen((s) => {
      const n = { ...s, [gid]: new Date().toISOString() }
      localStorage.setItem('pakka_seen', JSON.stringify(n))
      return n
    })
  }, [])
  const showGroup = useCallback((gid, sub = 'chat') => {
    openGroupRef.current = gid
    setGroupTab(sub)
    setOpenGroup(gid)
  }, [])
  const closeGroup = useCallback(() => { openGroupRef.current = null; setOpenGroup(null) }, [])

  const loadCore = useCallback(async () => {
    const [p, g, gm, jr, ps, sz, n] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('groups').select('*').order('created_at'),
      supabase.from('group_members').select('*'),
      supabase.from('join_requests').select('*').order('created_at'),
      supabase.from('partnerships').select('*').order('created_at'),
      supabase.from('sazas').select('*').in('status', ['active', 'submitted', 'appealed']).order('created_at', { ascending: false }),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('read', false)
    ])
    const map = {}
    for (const x of p.data || []) map[x.id] = x
    const myGroupIds = new Set((gm.data || []).filter((m) => m.user_id === uid).map((m) => m.group_id))
    setPeople(map)
    setMe(map[uid] || null)
    setGroups(g.data || [])
    setMembers(gm.data || [])
    setJoinReqs(jr.data || [])
    setPartnerships(ps.data || [])
    setSazas(sz.data || [])
    setUnread(n.count || 0)
    const last = {}
    await Promise.all([...myGroupIds].map(async (gid) => {
      const { data } = await supabase.from('messages').select('*').eq('group_id', gid).order('created_at', { ascending: false }).limit(1)
      if (data?.[0]) last[gid] = data[0]
    }))
    setLastMsgs(last)
    const accountees = (ps.data || []).filter((x) => x.partner_id === uid && x.status === 'active').map((x) => x.user_id)
    if (accountees.length) {
      const { count } = await supabase.from('checkins').select('id', { count: 'exact', head: true }).eq('status', 'pending').in('user_id', accountees)
      setPendingReviews(count || 0)
    } else setPendingReviews(0)
    setLoaded(true)
  }, [uid])

  const reloadTimer = useRef(null)
  const softReload = useCallback(() => {
    clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(() => { loadCore(); bump() }, 250)
  }, [loadCore, bump])

  useEffect(() => { loadCore(); resyncPush() }, [loadCore])

  // live updates
  useEffect(() => {
    const ch = supabase
      .channel('pakka-' + uid)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, (pl) => {
        toast(pl.new.message || 'Nayi notification', 'info'); softReload()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sazas' }, softReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partnerships' }, softReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins' }, softReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'join_requests' }, softReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, softReload)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (pl) => {
        window.dispatchEvent(new CustomEvent('pakka:msg', { detail: pl.new }))
        setLastMsgs((m) => ({ ...m, [pl.new.group_id]: pl.new }))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (pl) => {
        window.dispatchEvent(new CustomEvent('pakka:react', { detail: pl }))
      })
      .subscribe()
    const onVis = () => { if (document.visibilityState === 'visible') softReload() }
    document.addEventListener('visibilitychange', onVis)
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis) }
  }, [uid, toast, softReload])

  // back button + deep links from notifications
  useEffect(() => {
    initBack(() => {
      if (tabRef.current !== 'home') { setTab('home'); return true }
      if (exitArmed.current) return false
      exitArmed.current = true
      toast('Exit ke liye dobara back dabao')
      setTimeout(() => { exitArmed.current = false }, 2000)
      return true
    })
    const go = (href) => {
      const u = new URL(href, window.location.origin)
      const where = u.searchParams.get('go')
      if (!where) return
      setInboxOpen(false)
      if (where === 'group' && u.searchParams.get('id')) { setTab('groups'); showGroup(u.searchParams.get('id')) }
      else if (['home', 'groups', 'partners', 'me'].includes(where)) setTab(where)
    }
    if (new URL(window.location.href).searchParams.get('go')) {
      go(window.location.href)
      window.history.replaceState(window.history.state, '', import.meta.env.BASE_URL)
    }
    const onMsg = (e) => { if (e.data?.type === 'pakka-nav') go(e.data.url) }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, [setTab, showGroup, toast])

  // swipe left/right to change tabs
  const touch = useRef(null)
  const onTouchStart = (e) => {
    if (openGroupRef.current || layersOpen() || e.target.closest('[data-noswipe], input, textarea')) { touch.current = null; return }
    const t = e.touches[0]
    touch.current = { x: t.clientX, y: t.clientY, at: Date.now() }
  }
  const onTouchEnd = (e) => {
    const s = touch.current
    touch.current = null
    if (!s) return
    const t = e.changedTouches[0]
    const dx = t.clientX - s.x, dy = t.clientY - s.y
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6 || Date.now() - s.at > 700) return
    const order = TABS.map((x) => x.id)
    const i = order.indexOf(tabRef.current)
    const next = order[i + (dx < 0 ? 1 : -1)]
    if (next) setTab(next, dx < 0 ? 'from-right' : 'from-left')
  }

  const derived = useMemo(() => {
    const myGroups = groups.filter((g) => members.some((m) => m.group_id === g.id && m.user_id === uid))
    const requestedGroups = groups.filter((g) => joinReqs.some((r) => r.group_id === g.id && r.user_id === uid))
    const isAdmin = (gid) => members.some((m) => m.group_id === gid && m.user_id === uid && m.role === 'admin')
    const membersOf = (gid) => members.filter((m) => m.group_id === gid)
    const activeSazasFor = (id) => sazas.filter((s) => s.target_id === id)
    const shameOf = (id) => sazas.find((s) => s.target_id === id && s.shame_badge && s.status !== 'appealed')?.shame_badge || null
    const lockedOf = (id) => sazas.some((s) => s.target_id === id && s.lock_rewards && s.status !== 'appealed')
    const myPartners = partnerships.filter((x) => x.user_id === uid)
    const accountees = partnerships.filter((x) => x.partner_id === uid && x.status === 'active').map((x) => x.user_id)
    const requests = partnerships.filter((x) => x.partner_id === uid && x.status === 'pending')
    const circle = [...new Set(members.filter((m) => myGroups.some((g) => g.id === m.group_id)).map((m) => m.user_id))].filter((id) => id !== uid)
    const submittedToReview = sazas.filter((s) => accountees.includes(s.target_id) && s.status === 'submitted').length
    const appealsToJudge = sazas.filter((s) => s.status === 'appealed' && s.target_id !== uid && s.issued_by !== uid).filter((s) => {
      const tg = new Set(members.filter((m) => m.user_id === s.target_id).map((m) => m.group_id))
      const shared = members.filter((m) => m.user_id === s.issued_by && tg.has(m.group_id)).map((m) => m.group_id)
      const cands = members.filter((m) => shared.includes(m.group_id) && m.user_id !== s.target_id && m.user_id !== s.issued_by)
      const admins = cands.filter((c) => c.role === 'admin')
      return (admins.length ? admins : cands).some((c) => c.user_id === uid)
    })
    const unreadGroups = myGroups.filter((g) => {
      const m = lastMsgs[g.id]
      return m && m.user_id !== uid && m.kind !== 'system' && (!seen[g.id] || m.created_at > seen[g.id])
    }).map((g) => g.id)
    const adminRequests = joinReqs.filter((r) => r.user_id !== uid && isAdmin(r.group_id))
    return {
      myGroups, requestedGroups, isAdmin, membersOf, activeSazasFor, shameOf, lockedOf, myPartners, accountees, requests,
      circle, appealsToJudge, unreadGroups, adminRequests,
      partnersBadge: pendingReviews + requests.length + submittedToReview + appealsToJudge.length,
      groupsBadge: unreadGroups.length + adminRequests.length
    }
  }, [groups, members, joinReqs, sazas, partnerships, uid, pendingReviews, lastMsgs, seen])

  const ctx = {
    uid, me, people, groups, members, joinReqs, partnerships, sazas, lastMsgs, seen, markSeen, version, bump, toast, celebrate,
    loadCore, setTab, showGroup, closeGroup, openGroup, groupTab, setGroupTab, ...derived
  }

  if (!loaded) return <Splash />
  if (!me) return <div className="splash"><p>Profile load nahi hua. Refresh karo.</p></div>
  if (!me.onboarded) return <Ctx.Provider value={ctx}><Onboarding /><Toasts items={toasts} /></Ctx.Provider>

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          {tab === 'home'
            ? <div className="brand-sm"><img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" /><span>Pakka</span></div>
            : <h1 className="page-title">{TITLES[tab]}</h1>}
          <button className="icon-btn bell" onClick={() => setInboxOpen(true)} aria-label="Inbox">
            <Bell size={20} />{unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
          </button>
        </header>
        <main className={'screen ' + slide} key={tab} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {tab === 'home' && <Home />}
          {tab === 'groups' && <Groups />}
          {tab === 'partners' && <Partners />}
          {tab === 'me' && <Me />}
        </main>
        <nav className="tabbar">
          {TABS.map(({ id, label, Icon }) => {
            const badge = id === 'partners' ? derived.partnersBadge : id === 'groups' ? derived.groupsBadge : 0
            return (
              <button key={id} className={'tab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>
                <span className="tab-icon"><Icon size={22} strokeWidth={tab === id ? 2.4 : 1.8} />{badge > 0 && <span className="dot">{badge > 9 ? '9+' : badge}</span>}</span>
                <span className="tab-label">{label}</span>
              </button>
            )
          })}
        </nav>
        {openGroup && <GroupView gid={openGroup} onClose={closeGroup} />}
        <Inbox open={inboxOpen} onClose={() => { setInboxOpen(false); loadCore() }} />
        <Confetti trigger={burst} />
        <Toasts items={toasts} />
      </div>
    </Ctx.Provider>
  )
}
