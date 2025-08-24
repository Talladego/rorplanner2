import React from 'react'
import { useBuild } from '../lib/buildContext'

export default function StatsPanel() {
  const { state } = useBuild()

  // simple aggregation example: count equipped
  const equipped = Object.values(state.slots).filter(Boolean).length

  return (
    <aside className="stats-panel">
      <h3>Stats</h3>
      <div>Career: {state.careerId ?? '—'}</div>
      <div>Level: {state.careerRank}</div>
      <div>Renown: {state.renownRank}</div>
      <div>Equipped: {equipped}</div>
    </aside>
  )
}
