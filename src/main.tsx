import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/rubik/400.css'
import '@fontsource/rubik/500.css'
import '@fontsource/rubik/700.css'
import '@fontsource/rubik/800.css'
import './index.css'
import './table.css'
import './premium.css'
import './table2.css'
import './app2.css'
import './motion.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { installCrashReporter } from './lib/crash'
import { initInstallCapture } from './lib/platform'
import { registerSW } from './lib/push'
import { unlockAudio } from './lib/sound'

installCrashReporter()
initInstallCapture()
unlockAudio()
registerSW()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
