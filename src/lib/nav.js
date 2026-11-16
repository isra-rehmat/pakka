// Phone back button support.
// Every open layer (sheet, group screen) adds a history entry. Back closes the top layer.
// With nothing open, back goes to Home; on Home it asks for a second back to exit.
import { useEffect, useRef } from 'react'

const stack = []
let ignore = 0
let rootHandler = null

export function initBack(onRoot) {
  rootHandler = onRoot
  if (window.__pakkaBackInit) return
  window.__pakkaBackInit = true
  history.replaceState({ pakka: 'root' }, '')
  history.pushState({ pakka: 'guard' }, '')
  window.addEventListener('popstate', () => {
    if (ignore > 0) { ignore--; return }
    const top = stack[stack.length - 1]
    if (top) { top.byBack = true; top.fn(); return }
    const stay = rootHandler ? rootHandler() : false
    if (stay) history.pushState({ pakka: 'guard' }, '')
    else history.back()
  })
}

export const layersOpen = () => stack.length

export function useBack(active, fn) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    if (!active) return
    const entry = { fn: () => ref.current(), byBack: false }
    stack.push(entry)
    history.pushState({ pakka: 'layer' }, '')
    return () => {
      const i = stack.indexOf(entry)
      if (i >= 0) stack.splice(i, 1)
      if (!entry.byBack) { ignore++; history.back() }
    }
  }, [active])
}
