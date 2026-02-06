import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { initNativeAudioSessionBridge } from './lib/native-audio-session'
import { initCallKitDiagnosticListener } from './lib/callkit-diagnostic'

initNativeAudioSessionBridge()
initCallKitDiagnosticListener()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
