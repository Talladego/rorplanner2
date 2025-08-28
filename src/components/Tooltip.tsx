import React, { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { RARITY_COLORS, ITEMSET_COLOR } from '../lib/constants'
import { friendlyName } from '../lib/constants'
import { useBuild } from '../lib/buildContext'
import { createPortal } from 'react-dom'
import { EMPTY_TALISMAN_ICON, TOOLTIP_ROOT_ID, MUTED_COLOR } from '../lib/constants'
// Tooltip should not fetch item details itself; SlotCard is responsible for
// fetching full item data and storing it on the slot (under the item or
// item.details). Tooltip will only render the merged object it receives.

type Props = {
  content: any
  children: React.ReactElement
  delay?: number
}

export default function Tooltip({ content, children, delay = 120 }: Props) {
  // prefer to anchor to .app-root but fall back to document.body so tooltips
  // work immediately on first render even if app-root isn't mounted yet
  let appRoot = typeof document !== 'undefined' ? (document.querySelector('.app-root') as HTMLElement | null) : null
  let root = typeof document !== 'undefined' ? document.getElementById(TOOLTIP_ROOT_ID) : null
  if (typeof document !== 'undefined' && !root) {
    root = document.createElement('div')
  root.id = TOOLTIP_ROOT_ID
    // always append tooltip root to document.body to avoid stacking context issues
    document.body.appendChild(root)
  }
  // ensure appRoot has a usable fallback
  if (!appRoot && typeof document !== 'undefined') appRoot = document.body as HTMLElement
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; placeBelow: boolean }>({ left: 0, top: 0, placeBelow: false })
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const timer = useRef<number | null>(null)
  const hostRef = useRef<HTMLElement | null>(null)
  // Tooltip renders data provided by the parent. No network fetch here.

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  // We intentionally do not fetch here. Parents (SlotCard) should provide
  // fully populated item objects (either directly on the item or under
  // item.details). Tooltip will merge shallow and deep fields for rendering.

  if (!root || !appRoot) return children

  const show = (el: HTMLElement) => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
  hostRef.current = el
  // prefer anchoring to the nested .talisman-area so the tooltip's top-left
  // aligns with the talisman area top-left (this keeps the slot-icon visible
  // to the left of the tooltip). Fall back to .slot-icon or the whole element.
  const talismanEl = (el.querySelector && (el.querySelector('.talisman-area') as HTMLElement)) || null
  const iconEl = (el.querySelector && (el.querySelector('.slot-icon') as HTMLElement)) || null
  // prefer the slot icon as anchor so the tooltip sits to the right of the icon
  const anchor = iconEl ?? talismanEl ?? el
  const r = anchor.getBoundingClientRect()
  // align tooltip top-left to the anchor's top-right using viewport coordinates
  const offset = 8
  const leftRaw = Math.round(r.right + offset) // viewport x coordinate
  const tentativeTop = Math.round(r.top) // viewport y coordinate
  // if tooltip would be too close to top of viewport, place it below the anchor
  const placeBelow = tentativeTop < 8
  let top = placeBelow ? Math.round(r.bottom + offset) : tentativeTop
  // set initial position in viewport coords; we'll remeasure tooltip size
  setPos({ left: leftRaw, top, placeBelow })
      setVisible(true)
    }, delay)
  }

  const hide = () => {
    if (timer.current) window.clearTimeout(timer.current)
    setVisible(false)
  }

  // clone child to attach hover/focus handlers without changing its props
  const child = React.cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      children.props.onMouseEnter?.(e)
      show(e.currentTarget as HTMLElement)
    },
    onMouseLeave: (e: React.MouseEvent) => {
      children.props.onMouseLeave?.(e)
      hide()
    },
    onFocus: (e: React.FocusEvent) => {
      children.props.onFocus?.(e)
      show(e.currentTarget as HTMLElement)
    },
    onBlur: (e: React.FocusEvent) => {
      children.props.onBlur?.(e)
      hide()
    },
  })

  const tooltipNode = visible ? (
  <div ref={tooltipRef} className="tooltip" style={{ left: pos.left, top: pos.top, position: 'fixed', zIndex: 9999 }} role="tooltip">
      <div className="tooltip-card">
        <div className="tooltip-content">
          {typeof content === 'object' && content !== null && 'id' in (content as any) ? (
            (() => {
              const base: any = content ?? {}
              // prefer the latest stored slot item from BuildContext (merged details)
              const build = useBuild()
              let it: any = { ...base, ...(base && base.details ? base.details : {}) }
              try {
                const slots = build.state?.slots ?? {}
                for (const k of Object.keys(slots)) {
                  const s = (slots as any)[k]
                  if (s && s.id === it.id) {
                    it = s
                    break
                  }
                }
              } catch (e) {
                // ignore and use merged base
              }
              // Determine the color for the item name area. We compute two colors:
              // - itemNameColor: color used for the item title (rarity color unless the item is part of a set)
              // - nameColor: color used for the set name / active-bonus highlighting (muted unless bonuses active)
              let nameColor = (RARITY_COLORS[(it?.rarity ?? 'COMMON')] ?? '#fff')
              const itemNameColor = it?.itemSet?.id ? ITEMSET_COLOR : (RARITY_COLORS[(it?.rarity ?? 'COMMON')] ?? '#fff')
              if (it?.itemSet?.id) {
                const slottedCount: number | null = (it.itemSet && (it.itemSet.slottedCount ?? it.itemSet.equippedCount)) ?? null
                if (Array.isArray(it.itemSet.bonuses) && typeof slottedCount === 'number') {
                  const anyActive = it.itemSet.bonuses.some((b: any) => (b.itemsRequired <= slottedCount))
                  // Use the same green as abilities/buffs for active set names/bonuses; otherwise mute
                  nameColor = anyActive ? '#0f0' : MUTED_COLOR
                } else {
                  // no reliable bonus info -> default to muted (don't assume active)
                  nameColor = MUTED_COLOR
                }
              }

              return (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <div className="item-tooltip">
                      {/* Name section */}
                      <div className="item-tooltip-name" style={{ color: itemNameColor, fontWeight: 600 }}>{it.name}</div>

                      {/* Description section */}
                      {it.description ? <div className="item-tooltip-desc">{it.description}</div> : null}

                      {/* Info section: Slot, Type, Item Level, Unique - Equipped, ID */}
                      <div className="item-tooltip-info">
                        {it.slot ? <div className="meta-line">{friendlyName(it.slot)}</div> : null}
                        {it.type ? <div className="meta-line">{friendlyName(it.type)}</div> : null}
                        {it.itemLevel ? <div className="meta-line">{typeof it.itemLevel === 'number' ? `Item level ${it.itemLevel}` : it.itemLevel}</div> : null}
                        {it.uniqueEquipped ? <div className="meta-line">Unique - Equipped</div> : null}
                        {/* show the item id in the info block, left-aligned with a label */}
                        {it.id ? <div className="meta-line" style={{ color: MUTED_COLOR }}>{`Item ID: ${it.id}`}</div> : null}
                      </div>

                      {/* Stats section */}
                        {( (it.stats && it.stats.length > 0) || it.armor || it.dps || it.speed || it.block || it.blockRating ) ? (
                        <div className="item-tooltip-stats">
                          {it.armor ? <div className="stat-line">{`${it.armor} Armor`}</div> : null}
                          {(it.blockRating || it.block) ? <div className="stat-line">{`${it.blockRating ?? it.block} Block Rating`}</div> : null}
                          {it.dps ? <div className="stat-line">{typeof it.dps === 'number' ? `${(it.dps / 10).toFixed(1)} DPS` : `${it.dps} DPS`}</div> : null}
                          {it.speed ? <div className="stat-line">{typeof it.speed === 'number' ? `${(it.speed / 100).toFixed(1)} Speed` : `${it.speed} Speed`}</div> : null}

                          {it.stats && it.stats.map((s: any, i: number) => {
                            if (typeof s === 'string') return <div key={`stat-${i}`} className="stat-line">{s}</div>
                            const sign = (s.value && Number(s.value) > 0) ? '+ ' : ''
                            const val = s.percentage ? `${s.value}%` : s.value
                            const statName = friendlyName(s.stat)
                            return <div key={`stat-${i}`} className="stat-line">{`${sign}${val} ${statName ?? ''}`.trim()}</div>
                          })}
                        </div>
                      ) : null}

                      {/* Talisman section: show slotted talismans (icon, name, small stat preview) */}
                      {it.talismanSlots ? (
                        <div className="item-tooltip-talisman">
                          <div className="item-tooltip-talisman-rows">
                            {Array.from({ length: it.talismanSlots }).map((_, i) => {
                              const tal = it.talismans && Array.isArray(it.talismans) ? it.talismans[i] : null
                              return (
                                <div key={i} className="item-tooltip-talisman-row">
                                  <img src={tal?.icon ?? EMPTY_TALISMAN_ICON} alt={tal?.name ? tal.name : `Empty talisman slot ${i + 1}`} title={tal?.name ?? `Empty talisman slot ${i + 1}`} className="talisman-empty-icon" />
                                  <div className="item-tooltip-talisman-meta">
                                    <span className="talisman-name" style={{ fontWeight: 600, color: tal ? (RARITY_COLORS[String(tal.rarity ?? 'COMMON')] ?? '#fff') : '#c7cbd1' }}>{tal?.name ?? 'Empty Talisman Slot'}</span>
                                    {tal && Array.isArray(tal.stats) && tal.stats.length ? (
                                      <div className="talisman-stats-row">
                                        {tal.stats.slice(0, 2).map((s: any, j: number) => {
                                          const sign = (s.value && Number(s.value) > 0) ? '+ ' : ''
                                          const val = s.percentage ? `${s.value}%` : s.value
                                          const statName = friendlyName(s.stat)
                                          return <div key={j} className="stat-line" style={{ fontSize: 12 }}>{`${sign}${val} ${statName ?? ''}`.trim()}</div>
                                        })}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : null}

                      {/* Set info section (use provided slotted/equipped count) */}
                      {it.itemSet ? (
                        <div className="item-tooltip-set">
                          {it.itemSet.name ? <div className="item-tooltip-set-name" style={{ color: nameColor, fontWeight: 600 }}>{it.itemSet.name}</div> : null}
                          {it.itemSet.bonuses && it.itemSet.bonuses.map((b: any, i: number) => {
                              // Determine readable bonus text
                              let bonusText = ''
                              if (b?.bonusText) {
                                bonusText = b.bonusText
                              } else if (b?.bonus) {
                                const bonus = b.bonus
                                // ItemStat shape
                                if (bonus.stat) {
                                  const statName = friendlyName(bonus.stat)
                                  const val = bonus.value ?? bonus.amount ?? ''
                                  const pct = bonus.percentage ? '%' : ''
                                  bonusText = `+ ${val}${pct} ${statName}`.trim()
                                } else if (bonus.description) {
                                  bonusText = bonus.description
                                } else if (bonus.name) {
                                  // Ability or named bonus
                                  bonusText = `Gain ability: ${bonus.name}`
                                } else if (typeof bonus === 'string') {
                                  bonusText = bonus
                                } else {
                                  try { bonusText = JSON.stringify(bonus) } catch (e) { bonusText = String(bonus) }
                                }
                              }
                              const prefix = `(${b.itemsRequired} piece bonus): `
                              const slottedCount: number | null = (it.itemSet && (it.itemSet.slottedCount ?? it.itemSet.equippedCount)) ?? null
                              const active = typeof slottedCount === 'number' ? (b.itemsRequired <= slottedCount) : true
                              const color = active ? nameColor : MUTED_COLOR
                              return (
                                <div key={i} className="set-bonus" style={{ color }}>
                                  {prefix + bonusText}
                                </div>
                              )
                          })}
                        </div>
                      ) : null}

                      {/* Abilities & Buffs section */}
                      {( (it.abilities && it.abilities.length) || (it.buffs && it.buffs.length) ) ? (
                        <div className="item-tooltip-abilities-buffs">
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {it.abilities && it.abilities.map((a: any, i: number) => (
                              <div key={`ability-${i}`} className="ability-item">
                                {a.description ? <div className="ability-desc" dangerouslySetInnerHTML={{ __html: `+ ${a.description}` }} /> : null}
                              </div>
                            ))}
                            {it.buffs && it.buffs.map((b: any, i: number) => (
                              <div key={`buff-${i}`} className="buff-item">
                                {b.description ? <div className="buff-desc" dangerouslySetInnerHTML={{ __html: `+ ${b.description}` }} /> : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {/* Requirements section */}
                      <div className="item-tooltip-requirements">
                        {it.levelRequirement ? <div className="item-tooltip-req">{typeof it.levelRequirement === 'number' ? `Minimum Rank: ${it.levelRequirement}` : it.levelRequirement}</div> : null}
                        {it.renownRankRequirement ? <div className="item-tooltip-req">{typeof it.renownRankRequirement === 'number' ? `Requires ${it.renownRankRequirement} Renown` : it.renownRankRequirement}</div> : null}
                        {it.careerRestriction && it.careerRestriction.length ? <div className="item-tooltip-req">Career: {Array.isArray(it.careerRestriction) ? it.careerRestriction.map((c: string) => friendlyName(c)).join(', ') : friendlyName(it.careerRestriction)}</div> : null}
                        {it.raceRestriction && it.raceRestriction.length ? <div className="item-tooltip-req">Race: {Array.isArray(it.raceRestriction) ? it.raceRestriction.map((r: string) => friendlyName(r)).join(', ') : friendlyName(it.raceRestriction)}</div> : null}
                      </div>
                    </div>
                </div>
              )
            })()
          ) : (
            content
          )}
        </div>
      </div>
    </div>
  ) : null

  // After the tooltip mounts, measure its size and clamp it inside the viewport
  useLayoutEffect(() => {
    if (!visible) return
    const t = tooltipRef.current
    if (!t) return
    try {
      const tr = t.getBoundingClientRect()
      const margin = 8
      const maxLeft = Math.max(margin, Math.round(window.innerWidth - tr.width - margin))
      const maxTop = Math.max(margin, Math.round(window.innerHeight - tr.height - margin))
      const clampedLeft = Math.max(margin, Math.min(pos.left, maxLeft))
      const clampedTop = Math.max(margin, Math.min(pos.top, maxTop))
      if (clampedLeft !== pos.left || clampedTop !== pos.top) {
        // update only when necessary to avoid render loops
        setPos((prev) => ({ ...prev, left: clampedLeft, top: clampedTop }))
      }
    } catch (e) {
      // ignore measurement errors
    }
  }, [visible, pos.left, pos.top])

  // send a lightweight debug payload to the server when hovering an item
  useEffect(() => {
    if (!visible) return
    // Tooltip debug uses the merged object so keys reveal nested fields stored
    // under `details` when present.
    const it: any = content
    if (!it || typeof it !== 'object' || !('id' in it)) return

    // only send debug to server when on localhost OR when explicitly enabled
    const host = typeof window !== 'undefined' ? window.location.hostname : ''
    const enabledFlag = (typeof (window as any) !== 'undefined' && (window as any).__TOOLTIP_DEBUG_SERVER === true)
    if (!(host === 'localhost' || host === '127.0.0.1' || enabledFlag)) return

  // merge nested details (if present) so debug reveals fields stored under `details`
  const mergedForPayload = { ...it, ...(it.details ?? {}) }
  // remove the `details` wrapper from the debug payload so keys reflect actual fields
  if (mergedForPayload && 'details' in mergedForPayload) delete mergedForPayload.details
    const payload = {
      id: mergedForPayload.id,
      name: mergedForPayload.name,
      keys: Object.keys(mergedForPayload || {}),
      statsSample: Array.isArray(mergedForPayload.stats) ? mergedForPayload.stats.slice(0, 3) : mergedForPayload.stats,
      itemSetBonusesSample: mergedForPayload.itemSet && Array.isArray(mergedForPayload.itemSet.bonuses) ? mergedForPayload.itemSet.bonuses.slice(0, 3) : mergedForPayload.itemSet?.bonuses,
      timestamp: new Date().toISOString(),
    }

  // debug payload sent silently
    // best-effort POST to /__debug/tooltip on same origin; failures are non-fatal
    try {
      fetch('/__debug/tooltip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then((r) => { /* no-op */ })
        .catch(() => { /* swallow debug post errors silently */ })
    } catch (e) {
      // swallow debug post exceptions
    }
  }, [visible, content])

  return (
    <>
      {child}
      {createPortal(tooltipNode, root)}
    </>
  )
}
