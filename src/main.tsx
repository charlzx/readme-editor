import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import React, { useEffect, useState } from "react"

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
      <div className="flex items-center justify-center h-screen w-screen bg-gray-950 text-white">
        <div className="bg-gray-900 rounded-2xl shadow-2xl p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold mb-2">Unsupported Device</h1>
          <p className="text-gray-300">
            This app works only on desktop and large screens.  
            Please switch to a device with a larger display.
          </p>
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
