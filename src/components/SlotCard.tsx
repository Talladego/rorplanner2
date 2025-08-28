import React, { useState, useEffect } from 'react'
import { apolloClient } from '../lib/apollo'
import { ITEM_QUERY } from '../lib/queries'
import { SlotKey, useBuild, ItemRef } from '../lib/buildContext'
import ItemPickerModal from './ItemPickerModal'
import Tooltip from './Tooltip'
import { friendlyName, slotNames, getDefaultIcon } from '../lib/constants'
import { RARITY_COLORS, ITEMSET_COLOR, EMPTY_TALISMAN_ICON, MUTED_COLOR } from '../lib/constants'


export default function SlotCard({ slotKey }: { slotKey: SlotKey }) {
  const { state, setSlotItem } = useBuild()
  const [open, setOpen] = useState(false)
  const [openTalisman, setOpenTalisman] = useState<{ index: number } | null>(null)
  const item = state.slots[slotKey]

  // if a slot has an item but no full details, fetch them and update the slot
  useEffect(() => {
    let cancelled = false
    if (!item || (item as any).details) return
    ;(async () => {
      try {
        const resp = await apolloClient.query({ query: ITEM_QUERY, variables: { id: item.id }, fetchPolicy: 'network-only' })
        const fetched = resp.data?.item ?? null
        if (!cancelled && fetched) {
          // log the full fetched object for debugging (object + truncated JSON)
          try {
            const asJson = JSON.stringify(fetched, Object.keys(fetched).sort(), 2)
          } catch (logErr) {
            // ignore stringify errors silently
          }
          // detailed debug: print fetched top-level keys and small samples
          try {
            const fkeys = Object.keys(fetched)
            // samples ignored in production
          } catch (logErr) {
            // ignore logging errors
          }

          // attach fetched full details under `details`; buildContext will merge when storing
          const withDetails = { ...item, details: fetched }
          setSlotItem(slotKey, withDetails as any)

          // Dev-only: POST a lightweight debug payload to the dev server so it
          // appears in the terminal (vite plugin). Only do this on localhost or
          // when explicitly enabled via window.__SLOT_DEBUG_SERVER.
          try {
            const enabledFlag = (typeof (window as any) !== 'undefined' && (window as any).__SLOT_DEBUG_SERVER === true)
            // Send in dev builds (vite) or when explicitly enabled at runtime
            const isDev = typeof import.meta !== 'undefined' ? ((import.meta as any).env?.DEV === true) : false
            if (isDev || enabledFlag) {
              const mergedForPayload = { ...withDetails, ...(withDetails.details ?? {}) }
              if ('details' in mergedForPayload) delete (mergedForPayload as any).details
              const payload = {
                slot: slotKey,
                id: mergedForPayload.id,
                name: mergedForPayload.name,
                keys: Object.keys(mergedForPayload || {}),
                statsSample: Array.isArray(mergedForPayload.stats) ? mergedForPayload.stats.slice(0, 3) : mergedForPayload.stats,
                timestamp: new Date().toISOString(),
              }
              fetch('/__debug/slot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                .then(() => { /* no-op */ })
                .catch(() => { /* swallow errors silently */ })
            }
          } catch (e) {
            // swallow errors silently
          }
        }
      } catch (e) {
        // ignore fetch failures silently here
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item])

  // iconNode moved below slotFriendly to ensure helper is defined before use

  // local pretty fallback removed — prefer centralized slotNames map via slotFriendly

  // Map runtime slotKey (eg 'mainhand' or 'jewel1') to the centralized slotNames map
  const slotFriendly = (k: string) => {
    if (!k) return ''
    const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const target = norm(k)
    for (const enumKey of Object.keys(slotNames || {})) {
      if (norm(enumKey) === target) return slotNames[enumKey]
      // also try matching the friendly value's normalized form
      if (norm(slotNames[enumKey]) === target) return slotNames[enumKey]
    }
  // fallback: title-case the runtime key (e.g. "mainhand" -> "Mainhand")
  return String(k || '').replace(/[_\-]+/g, ' ').replace(/(\b[a-z](?!\s))/g, (m) => m.toUpperCase())
  }

  // runtime slotKey -> server EquipSlot enum mapping for authoritative friendly names
  const RUNTIME_TO_ENUM: Record<string, string> = {
    helm: 'HELM',
    shoulders: 'SHOULDER',
    back: 'BACK',
    body: 'BODY',
    gloves: 'GLOVES',
    belt: 'BELT',
    boots: 'BOOTS',
    jewel1: 'JEWELLERY1',
    jewel2: 'JEWELLERY2',
    jewel3: 'JEWELLERY3',
    jewel4: 'JEWELLERY4',
    pocket1: 'POCKET1',
    pocket2: 'POCKET2',
    mainhand: 'MAIN_HAND',
    offhand: 'OFF_HAND',
    ranged: 'RANGED_WEAPON',
    event: 'EVENT',
  }

  const defaultSlotName = (k: string) => {
    if (!k) return ''
    const enumKey = RUNTIME_TO_ENUM[k]
    if (enumKey && slotNames[enumKey]) return slotNames[enumKey]
    return slotFriendly(k)
  }

  // interactive icon: only this element is clickable and tooltip-enabled
  const iconNode = (
    <div
      className="slot-icon"
      role="button"
      tabIndex={0}
      aria-label={item ? `Open ${item.name} items` : `Open ${defaultSlotName(slotKey)} items`}
      onClick={(e) => {
        e.stopPropagation()
        if (!state.careerId) return
        setOpen(true)
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && state.careerId) {
          e.preventDefault()
          setOpen(true)
        }
      }}
      onContextMenu={(e) => {
        // Right-click on the item icon clears the item in this slot only.
        e.preventDefault()
        e.stopPropagation()
        if (item) setSlotItem(slotKey, null)
      }}
    >
      {item ? (
        <img src={item?.icon ?? getDefaultIcon(slotKey) ?? ''} alt={item?.name ?? defaultSlotName(slotKey)} />
      ) : (
        <img src={getDefaultIcon(slotKey) ?? ''} alt={defaultSlotName(slotKey)} />
      )}
    </div>
  )

  // Tooltip content varies: if no career selected, instruct to select a career first.
  // If career selected but slot empty, prompt to click to select an item.
  // Otherwise show the item/slot info.
  let tooltipContent: React.ReactNode
  // Tooltip content should not include the icon image itself; show textual info only
  const iconPlaceholder = <div className="slot-icon" aria-hidden="true" />
  if (!state.careerId) {
    tooltipContent = (
      <div className="slot-row">
        {iconPlaceholder}
        <div className="slot-meta">
          <div className="slot-name item-tooltip-name">Select a career first</div>
        </div>
      </div>
    )
  } else if (!item) {
    tooltipContent = (
      <div className="slot-row">
        {iconPlaceholder}
        <div className="slot-meta">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="slot-name item-tooltip-name">{defaultSlotName(slotKey)}</div>
            <div style={{ fontSize: 12, color: MUTED_COLOR, marginTop: 6 }}>Click to select</div>
          </div>
        </div>
      </div>
    )
  } else {
    tooltipContent = (
      <div className="slot-row">
        {iconPlaceholder}
        <div className="slot-meta">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="slot-name item-tooltip-name" style={{ color: item?.itemSet?.id ? ITEMSET_COLOR : (RARITY_COLORS[item?.rarity ?? 'COMMON'] ?? '#fff') }}>{item?.name}</div>
            <div style={{ fontSize: 12, color: MUTED_COLOR }}>{/* additional meta could go here */}</div>
          </div>
        </div>
      </div>
    )
  }

  // Visible content for the SlotCard itself: always show the slot name (icon + slot label)
  const displayName = item ? item.name : defaultSlotName(slotKey)
  const displayMeta = item
    ? `${(item as any)?.slot ? friendlyName((item as any).slot) : (RUNTIME_TO_ENUM[slotKey] ? friendlyName(RUNTIME_TO_ENUM[slotKey]) : slotFriendly(slotKey))}${(item as any)?.type ? ` · ${friendlyName((item as any).type)}` : ''}`
    : ''

  const tooltipProp = item ? ({ ...item, slot: (item as any).slot ?? RUNTIME_TO_ENUM[slotKey] ?? slotFriendly(slotKey) } as any) : (<div className="tooltip-inner">{tooltipContent}</div>)

  const visibleNode = (
    <div className="slot-row">
      {/* wrap only the icon with Tooltip so hover/click is isolated to the icon */}
      <Tooltip content={tooltipProp}>
        {iconNode}
      </Tooltip>
      <div className="slot-meta">
        <div className="talisman-column">
          {/* show up to N talisman placeholders vertically; make each clickable to open the picker for ENHANCEMENT */}
          {Array.from({ length: Math.min(2, (item as any)?.talismanSlots ?? 0) }).map((_, i) => {
            const tal = item && Array.isArray((item as any).talismans) ? (item as any).talismans[i] : null
            const talIcon = tal?.icon ?? EMPTY_TALISMAN_ICON
            const talAlt = tal?.name ? `${tal.name} (talisman ${i + 1})` : `Empty talisman ${i + 1}`
            const talContent = tal ? tal : (<div style={{ padding: 6, color: MUTED_COLOR }}>Empty talisman slot</div>)
            return (
              <Tooltip key={i} content={talContent}>
                <div
                  className="talisman"
                  role="button"
                  tabIndex={0}
                  aria-label={tal?.name ? `Open ${tal.name}` : `Select talisman ${i + 1} for ${defaultSlotName(slotKey)}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!state.careerId || !item) return
                    setOpenTalisman({ index: i })
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && state.careerId && item) {
                      e.preventDefault()
                      setOpenTalisman({ index: i })
                    }
                  }}
                  onContextMenu={(e) => {
                    // Right-clicking a talisman clears only that talisman and attempts to remove its stats from the host item.
                    e.preventDefault()
                    e.stopPropagation()
                    try {
                      if (!item) return
                      const copy: any = { ...item }
                      const talArray = copy.talismans ? [...copy.talismans] : []
                      const removedTal = talArray[i] ?? null
                      talArray[i] = null
                      copy.talismans = talArray

                      try {
                        if (removedTal && Array.isArray(removedTal.stats) && Array.isArray(copy.stats)) {
                          const statsCopy = [...copy.stats]
                          for (const rs of removedTal.stats) {
                            const idx = statsCopy.findIndex((s: any) => s && s.stat === rs.stat && (s.value ?? null) === (rs.value ?? null) && (s.percentage ?? null) === (rs.percentage ?? null))
                            if (idx >= 0) statsCopy.splice(idx, 1)
                          }
                          copy.stats = statsCopy
                        }
                      } catch (e) {
                        /* ignore stat removal errors */
                      }
                      setSlotItem(slotKey, copy)
                    } catch (e) {
                      // swallow errors silently
                    }
                  }}
                >
                  <img src={talIcon} alt={talAlt} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
              </Tooltip>
            )
          })}
        </div>
        <div>
          <div className="slot-name item-tooltip-name" style={{ color: item ? (item?.itemSet?.id ? ITEMSET_COLOR : (RARITY_COLORS[item?.rarity ?? 'COMMON'] ?? '#fff')) : '#fff' }}>{displayName}</div>
          {displayMeta ? <div className="meta-line" style={{ marginTop: 6 }}>{displayMeta}</div> : null}
        </div>
      </div>
    </div>
  )

    return (
    <div
      className={`slot-card ${!item ? 'empty-slot' : ''}`}
      role="group"
      aria-label={state.careerId ? `${defaultSlotName(slotKey)} slot` : `Select a career first`}
    >
      {visibleNode}

      {open && (
        <ItemPickerModal
          slotKey={slotKey}
          onClose={() => setOpen(false)}
          onSelect={(it: ItemRef) => {
            setSlotItem(slotKey, it)
            setOpen(false)
          }}
        />
      )}
      {openTalisman && (
        <ItemPickerModal
          slotKey={slotKey}
          onClose={() => setOpenTalisman(null)}
          typeFilter={'ENHANCEMENT'}
          forItemName={item?.name}
          forItemLevel={item?.itemLevel ?? (item as any)?.details?.itemLevel ?? (item as any)?.details?.levelRequirement ?? state?.careerRank ?? undefined}
          onSelect={(it: ItemRef) => {
            // commit selected talisman into the slot's talismans array and merge talisman stats into parent item stats
            try {
              const current = state.slots[slotKey]
              if (!current) {
                // nothing to attach talisman to; create placeholder item and attach
                const placeholder: any = { id: '', name: defaultSlotName(slotKey), talismans: [] }
                placeholder.talismans[openTalisman.index] = it
                setSlotItem(slotKey, placeholder)
              } else {
                const copy: any = { ...current }
                const talismanArray = copy.talismans ? [...copy.talismans] : []
                talismanArray[openTalisman.index] = it
                copy.talismans = talismanArray

                // merge talisman stats next to item stats: produce combinedStats array
                try {
                  const baseStats = Array.isArray(copy.stats) ? [...copy.stats] : Array.isArray((copy as any).details?.stats) ? (copy as any).details.stats.map((s: any) => ({ stat: s.stat, value: s.value ?? null, percentage: s.percentage ?? null })) : []
                  const talismanStats = (it && Array.isArray(it.stats)) ? it.stats.map((s: any) => ({ stat: s.stat, value: s.value ?? null, percentage: s.percentage ?? null })) : []
                  // Simple merge: append talisman stats to baseStats. Dedup/aggregation can be added later.
                  copy.stats = baseStats.concat(talismanStats)
                } catch (e) {
                  // ignore stat merge errors
                }

                setSlotItem(slotKey, copy)
              }
            } catch (e) {
              // swallow errors silently
            }
            setOpenTalisman(null)
          }}
        />
      )}
    </div>
  )
}
