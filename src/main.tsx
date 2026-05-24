import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import React, { useEffect, useState } from "react"
import { DeviceMobileSlashIcon, MonitorIcon } from "@phosphor-icons/react"

const ScreenGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSmall, setIsSmall] = useState(false)

  useEffect(() => {
    const checkSize = () => setIsSmall(window.innerWidth < 768) // 768px = desktop breakpoint
    checkSize()
    window.addEventListener("resize", checkSize)
    return () => window.removeEventListener("resize", checkSize)
  }, [])

  if (isSmall) {
    return (
      <div className="flex min-h-screen w-screen items-center justify-center bg-background px-5 text-foreground">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center text-card-foreground">
          <div className="mx-auto grid size-11 place-items-center rounded-md border border-border bg-secondary text-secondary-foreground">
            <DeviceMobileSlashIcon size={22} />
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight">Desktop Required</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            Markdown Editor uses a split editor, preview, and document outline that need more horizontal space.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
            <MonitorIcon size={15} />
            Open on a tablet landscape, laptop, or desktop.
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export default ScreenGuard


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ScreenGuard>
      <App />
    </ScreenGuard>
  </StrictMode>,
)
