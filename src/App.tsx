import React from 'react'
import { BuildProvider } from './lib/buildContext'
import Toolbar from './components/Toolbar'
import EquipmentGrid from './components/EquipmentGrid'
import StatsPanel from './components/StatsPanel'
import { MODAL_ROOT_ID, TOOLTIP_ROOT_ID } from './lib/constants'

export default function App() {
  return (
    <BuildProvider>
      <div className="app-root">
        <header className="app-header">RorPlanner</header>
  <div id={MODAL_ROOT_ID} />
  <div id={TOOLTIP_ROOT_ID} />
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
