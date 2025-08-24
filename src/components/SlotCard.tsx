import React, { useState } from 'react'
import { SlotKey, useBuild } from '../lib/buildContext'
import { getDefaultIcon } from '../lib/defaultIcons'
import ItemPickerModal from './ItemPickerModal'
import Tooltip from './Tooltip'

export default function SlotCard({ slotKey }: { slotKey: SlotKey }) {
  const { state, setSlotItem } = useBuild()
  const [open, setOpen] = useState(false)
  const item = state.slots[slotKey]

  const iconNode = (
    <div className="slot-icon">
      {item ? (
        <img src={item.icon ?? getDefaultIcon(slotKey) ?? ''} alt={item.name} />
      ) : (
        <img src={getDefaultIcon(slotKey) ?? ''} alt={slotKey} />
      )}
    </div>
  )

  const prettyNames: Record<string, string> = {
    helm: 'Helm',
    shoulders: 'Shoulders',
    back: 'Back',
    body: 'Body',
    gloves: 'Gloves',
    belt: 'Belt',
    boots: 'Boots',
    jewel1: 'Jewel 1',
    jewel2: 'Jewel 2',
    jewel3: 'Jewel 3',
    jewel4: 'Jewel 4',
    pocket1: 'Pocket 1',
    pocket2: 'Pocket 2',
    mainhand: 'Mainhand',
    offhand: 'Offhand',
    ranged: 'Ranged',
    event: 'Event',
  }
  const pretty = prettyNames[slotKey] ?? slotKey

  // Tooltip content varies: if no career selected, instruct to select a career first.
  // If career selected but slot empty, prompt to click to select an item.
  // Otherwise show the item/slot info.
  let tooltipContent: React.ReactNode
  if (!state.careerId) {
    tooltipContent = (
      <div className="slot-row">
        {iconNode}
        <div className="slot-meta">
          <div className="slot-name">Select a career first</div>
        </div>
      </div>
    )
  } else if (!item) {
    tooltipContent = (
      <div className="slot-row">
        {iconNode}
        <div className="slot-meta">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="slot-name">{pretty}</div>
            <div style={{ fontSize: 12, color: '#9aa6b2', marginTop: 6 }}>Click to select</div>
          </div>
        </div>
      </div>
    )
  } else {
    tooltipContent = (
      <div className="slot-row">
        {iconNode}
        <div className="slot-meta">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="slot-name">{item.name}</div>
            <div style={{ fontSize: 12, color: '#9aa6b2' }}>{/* additional meta could go here */}</div>
          </div>
        </div>
      </div>
    )
  }

  // Visible content for the SlotCard itself: always show the slot name (icon + slot label)
  const visibleNode = (
    <div className="slot-row">
      {iconNode}
      <div className="slot-meta">
        <div className="talisman-area">{/* placeholder for talisman icons */}</div>
        <div className="slot-name">{item ? item.name : pretty}</div>
      </div>
    </div>
  )

  return (
    <div
      className="slot-card"
      onClick={() => {
        if (!state.careerId) return
        setOpen(true)
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && state.careerId) setOpen(true)
      }}
      role="button"
      tabIndex={0}
      aria-label={state.careerId ? `Open ${slotKey} items` : `Select a career first`}
      aria-disabled={!state.careerId}
    >
      <Tooltip content={<div className="tooltip-inner">{tooltipContent}</div>}>
        {visibleNode}
      </Tooltip>

      {open && (
        <ItemPickerModal
          slotKey={slotKey}
          onClose={() => setOpen(false)}
          onSelect={(it: any) => {
            setSlotItem(slotKey, it)
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}
