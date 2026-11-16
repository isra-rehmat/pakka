import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Remember the Android "install app" prompt so the Me tab can show an Install button
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__pakkaInstall = e
  window.dispatchEvent(new Event('pakka:installable'))
})

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
