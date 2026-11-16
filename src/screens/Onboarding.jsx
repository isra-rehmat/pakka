import { useState } from 'react'
import { useApp } from '../App'
import { supabase, errText } from '../supabase'
import { AVATARS } from '../lib/utils'
import { Btn, Chips, EmojiGrid } from '../components/ui'
import { KindPicker } from './Groups'

const GROUP_EMOJIS = ['🏠', '👨‍👩‍👧‍👦', '🔥', '🎮', '💪', '⭐']

export default function Onboarding() {
  const { me, uid, loadCore, toast } = useApp()
  const pendingCode = localStorage.getItem('pakka_join') || ''
  const [step, setStep] = useState(0)
  const [name, setName] = useState(me.display_name || '')
  const [avatar, setAvatar] = useState(me.avatar || '😎')
  const [mode, setMode] = useState(pendingCode ? 'join' : 'create')
  const [gname, setGname] = useState('')
  const [gemoji, setGemoji] = useState('🏠')
  const [kind, setKind] = useState('general')
  const [code, setCode] = useState(pendingCode)
  const [busy, setBusy] = useState(false)

  const saveProfile = async () => {
    if (!name.trim()) return toast('Naam likho', 'warn')
    setBusy(true)
    const { error } = await supabase.from('profiles').update({ display_name: name.trim().slice(0, 40), avatar }).eq('id', uid)
    setBusy(false)
    if (error) return toast(errText(error), 'error')
    setStep(1)
  }

  const finish = async (skip) => {
    setBusy(true)
    try {
      if (!skip) {
        if (mode === 'create') {
          const { error } = await supabase.rpc('create_group', { p_name: gname.trim() || 'Family', p_emoji: gemoji, p_kind: kind })
          if (error) throw error
        } else {
          const { data, error } = await supabase.rpc('join_group', { p_code: code.trim() })
          if (error) throw error
          if (data.status === 'requested') toast(`Request bhej di. "${data.name}" ka admin approve karega`, 'success')
        }
      }
      localStorage.removeItem('pakka_join')
      const { error } = await supabase.from('profiles').update({ onboarded: true }).eq('id', uid)
      if (error) throw error
      await loadCore()
    } catch (e) { toast(errText(e), 'error') }
    setBusy(false)
  }

  return (
    <div className="onboard">
      <div className="steps"><span className="on" /><span className={step ? 'on' : ''} /></div>
      {step === 0 ? (
        <>
          <div className="big-avatar">{avatar}</div>
          <h2>Assalam o Alaikum 👋</h2>
          <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          <EmojiGrid list={AVATARS[0].list} value={avatar} onChange={setAvatar} />
          <Btn onClick={saveProfile} loading={busy} className="wide">Next</Btn>
        </>
      ) : (
        <>
          <h2>Your group</h2>
          <Chips options={[{ value: 'create', label: 'New group' }, { value: 'join', label: 'Join with code' }]} value={mode} onChange={setMode} />
          {mode === 'create' ? (
            <>
              <input className="input" value={gname} maxLength={40} onChange={(e) => setGname(e.target.value)} placeholder="e.g. Awan Family" />
              <EmojiGrid list={GROUP_EMOJIS} value={gemoji} onChange={setGemoji} />
              <KindPicker value={kind} onChange={setKind} />
            </>
          ) : (
            <input className="input code-input" value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE12" />
          )}
          <Btn onClick={() => finish(false)} loading={busy} className="wide">{mode === 'create' ? 'Create group' : 'Send request'}</Btn>
          <button className="link-btn center" onClick={() => finish(true)} disabled={busy}>Skip for now</button>
        </>
      )}
    </div>
  )
}
