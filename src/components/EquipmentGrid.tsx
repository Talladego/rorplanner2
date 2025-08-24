import React from 'react'
import SlotCard from './SlotCard'

// Precise grid mapping to roughly match the ASCII schematic from the synopsis.
// We use an explicit list of slots with grid coordinates (col, row).
const SLOTS: Array<{ key: string; col: number; row: number; colSpan?: number; rowSpan?: number }> = [
  { key: 'helm', col: 1, row: 1 },
  { key: 'jewel1', col: 2, row: 1 },
  { key: 'mainhand', col: 3, row: 1 },

  { key: 'shoulders', col: 1, row: 2 },
  { key: 'jewel2', col: 2, row: 2 },
  // place offhand directly below mainhand (row 2) to avoid gap
  { key: 'offhand', col: 3, row: 2 },

  { key: 'back', col: 1, row: 3 },
  { key: 'jewel3', col: 2, row: 3 },
  // put ranged directly below offhand so main/off/ranged are vertically aligned
  { key: 'ranged', col: 3, row: 3 },

  { key: 'body', col: 1, row: 4 },
  { key: 'jewel4', col: 2, row: 4 },
  // event slot moved under the jewels (col 2) to match the synopsis layout
  { key: 'event', col: 2, row: 5 },

  // place belt and boots directly under body to form a vertical column
  { key: 'belt', col: 1, row: 5 },
  { key: 'boots', col: 1, row: 6 },

  // move pockets and gloves down to avoid collisions
  { key: 'pocket1', col: 2, row: 6 },
  { key: 'pocket2', col: 2, row: 7 },
  { key: 'gloves', col: 1, row: 7 },
]

export default function EquipmentGrid() {
  return (
    <div className="equipment-panel">
      <div className="equipment-grid" role="grid" aria-label="Equipment grid">
        <h3>Equipment</h3>
        {SLOTS.map((s) => {
          const rowStart = s.row + 1 // shift down so header can sit at row 1
          return (
            <div
              key={s.key}
              className={`grid-slot grid-slot-${s.key}`}
              style={{ gridColumn: s.col, gridRow: `${rowStart} / span ${s.rowSpan ?? 1}` }}
            >
              <SlotCard slotKey={s.key as any} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
