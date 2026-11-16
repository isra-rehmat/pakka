import { supabase } from '../supabase'
import { doneSets, streakFor, bestStreakFor } from './utils'

export const ACHIEVEMENTS = [
  { code: 'first_checkin', name: 'Pehla Qadam', icon: '👣', desc: 'Pehla check-in kiya' },
  { code: 'checkins_10', name: 'Das ka Dum', icon: '🔟', desc: '10 check-ins' },
  { code: 'checkins_50', name: 'Half Century', icon: '🏏', desc: '50 check-ins' },
  { code: 'checkins_100', name: 'Century', icon: '💯', desc: '100 check-ins' },
  { code: 'streak_3', name: 'Hat-trick', icon: '🎩', desc: '3 din ki streak' },
  { code: 'streak_7', name: 'Week Warrior', icon: '⚔️', desc: '7 din ki streak' },
  { code: 'streak_30', name: 'Mahine ka Sher', icon: '🦁', desc: '30 din ki streak' },
  { code: 'habits_3', name: 'Planner', icon: '🗂️', desc: '3 habits banayi' },
  { code: 'team_player', name: 'Team Player', icon: '🤝', desc: 'Accountability partner mil gaya' },
  { code: 'hype_machine', name: 'Hype Machine', icon: '📣', desc: '10 cheers bheje' },
  { code: 'maafi', name: 'Maafi Mil Gayi', icon: '😇', desc: 'Saza poori ki' },
  { code: 'early_bird', name: 'Early Bird', icon: '🐦', desc: 'Subha 7 baje se pehle check-in' },
  { code: 'ullu', name: 'Raat ka Ullu', icon: '🦉', desc: 'Raat 11 baje ke baad check-in' }
]
export const ACH = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.code, a]))

// Checks what the user has earned and unlocks anything new. Returns new achievements.
export async function checkAchievements(userId, ctx = {}) {
  const { data: have } = await supabase.from('achievements').select('code').eq('user_id', userId)
  const got = new Set((have || []).map((a) => a.code))
  const earned = []
  const want = (code, cond) => { if (!got.has(code) && cond) earned.push(code) }

  const [{ count: doneCount }, { data: habits }, { data: checkins }, { count: partners }, { count: cheers }, { count: sazasDone }] =
    await Promise.all([
      supabase.from('checkins').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'done'),
      supabase.rpc('habits_for', { p_user: userId }),
      supabase.from('checkins').select('habit_id, day, status').eq('user_id', userId).order('day', { ascending: false }).limit(3000),
      supabase.from('partnerships').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'active'),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('from_id', userId).eq('type', 'cheer'),
      supabase.from('sazas').select('id', { count: 'exact', head: true }).eq('target_id', userId).eq('status', 'done')
    ])

  const sets = doneSets(checkins || [])
  let best = 0
  for (const h of habits || []) {
    const s = sets[h.id] || new Set()
    best = Math.max(best, streakFor(h, s), bestStreakFor(h, s))
  }

  want('first_checkin', doneCount >= 1)
  want('checkins_10', doneCount >= 10)
  want('checkins_50', doneCount >= 50)
  want('checkins_100', doneCount >= 100)
  want('streak_3', best >= 3)
  want('streak_7', best >= 7)
  want('streak_30', best >= 30)
  want('habits_3', (habits || []).filter((h) => !h.group_id).length >= 3)
  want('team_player', partners >= 1)
  want('hype_machine', cheers >= 10)
  want('maafi', sazasDone >= 1)
  if (ctx.checkedIn) {
    const h = new Date().getHours()
    want('early_bird', h >= 4 && h < 7)
    want('ullu', h >= 23 || h < 4)
  }

  const unlocked = []
  for (const code of earned) {
    const { error } = await supabase.from('achievements').insert({ user_id: userId, code, name: ACH[code].name })
    if (!error) unlocked.push(ACH[code])
  }
  return unlocked
}
