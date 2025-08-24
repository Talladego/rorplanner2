import React from 'react'
import { BuildProvider } from './lib/buildContext'
import Toolbar from './components/Toolbar'
import EquipmentGrid from './components/EquipmentGrid'
import StatsPanel from './components/StatsPanel'

export default function App() {
  return (
    <BuildProvider>
      <div className="app-root">
        <header className="app-header">RorPlanner</header>
        <div id="modal-root" />
        <div id="tooltip-root" />
        <div className="content">
          <Toolbar />
          <main className="app-main">
            <EquipmentGrid />
            <div className="right-column">
              <StatsPanel />
            </div>
          </main>
        </div>
      </div>
    </BuildProvider>
  )
}
