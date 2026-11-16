import { createClient } from '@supabase/supabase-js'
import { createMock } from './demo/mock'

const DEMO = import.meta.env.VITE_DEMO === '1'
const url = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder'

export const configured = DEMO || Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

export const supabase = DEMO
  ? createMock()
  : createClient(url, key, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })

// Friendly error text from Supabase errors
export function errText(e) {
  if (!e) return 'Kuch gadbad ho gayi 😅'
  return e.message || e.error_description || String(e)
}
