import { useEffect, useState } from 'react'
import { useApp } from '../../App'
import { supabase } from '../../supabase'
import { levelFromXp } from '../../lib/utils'
import { Avatar } from '../../components/ui'

export default function Ranks({ g }) {
  const { uid, version, shameOf, lockedOf } = useApp()
  const [rows, setRows] = useState(null)
  useEffect(() => {
    supabase.rpc('leaderboard', { p_group: g.id }).then(({ data }) => setRows((data || []).sort((a, b) => b.weekly_xp - a.weekly_xp)))
  }, [g.id, version])

  if (rows === null) return <div className="pad"><div className="skeleton" /></div>
  const podium = [rows[1], rows[0], rows[2]]
  const medals = ['🥈', '👑', '🥉']
  return (
    <div className="pad">
      <p className="muted small center">This week{g.kind === 'focused' ? ' · group tasks only' : ''}</p>
      <div className="podium">
        {podium.map((r, i) => r ? (
          <div key={r.user_id} className={'pod pod-' + i}>
            <span className="pod-medal">{medals[i]}</span>
            <Avatar p={r} size={i === 1 ? 56 : 44} locked={lockedOf(r.user_id)} />
            <b>{r.display_name.split(' ')[0]}</b>
            <small>{r.weekly_xp} XP</small>
            <div className="pod-block" />
          </div>
        ) : <div key={i} className="pod" />)}
      </div>
      <div className="list">
        {rows.map((r, i) => (
          <div key={r.user_id} className={'rank-row' + (r.user_id === uid ? ' me' : '')}>
            <span className="rank-n">{i + 1}</span>
            <Avatar p={r} size={34} locked={lockedOf(r.user_id)} />
            <span className="grow">
              <b>{r.display_name}</b> {shameOf(r.user_id) && <span className="shame xs">{shameOf(r.user_id)}</span>}
              <small className="muted">LVL {levelFromXp(r.xp)} · {r.done_week} done</small>
            </span>
            <span className="rank-xp">{r.weekly_xp}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
