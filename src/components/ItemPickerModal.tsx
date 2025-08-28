import React, { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ItemRef } from '../lib/buildContext'
import { getDefaultIcon } from '../lib/constants'
import { useQuery, gql } from '@apollo/client'
import { ITEMS_QUERY } from '../lib/queries'
// ItemPicker only shows minimal list data; Tooltip and full-item queries are
// handled elsewhere (SlotCard + Tooltip rendering).
import { useBuild } from '../lib/buildContext'

import { RARITY_COLORS, ITEMSET_COLOR, MODAL_ROOT_ID, MUTED_COLOR, slotNames, friendlyName, SLOTS, STATS_WITH_ZERO_ITEMS } from '../lib/constants'
import statPopularity from '../lib/statPopularity.json'
import { PickerItem, ItemsQueryData, ItemsQueryVars } from '../lib/graphqlTypes'
// Two-handed classification removed — rely only on server slot hints

export default function ItemPickerModal({ slotKey, onClose, onSelect, typeFilter, commitToSlot, forItemName, forItemLevel }: { slotKey: string; onClose: () => void; onSelect: (it: ItemRef) => void; typeFilter?: string; commitToSlot?: boolean; forItemName?: string; forItemLevel?: number }) {
  const localStatFallback = ['Strength', 'Toughness', 'Agility', 'Dexterity', 'Weapon Strength']
  const localRarityFallback = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']

  const ENUM_QUERY = gql`
    query EnumValues($name: String!) {
      __type(name: $name) { enumValues { name } }
    }
  `

  const { data: statData } = useQuery(ENUM_QUERY, { variables: { name: 'Stat' } })
  const { data: rarityData } = useQuery(ENUM_QUERY, { variables: { name: 'ItemRarity' } })

  const stats: string[] = statData?.__type?.enumValues?.map((v: any) => v.name) ?? localStatFallback
  const rarities: string[] = rarityData?.__type?.enumValues?.map((v: any) => v.name) ?? localRarityFallback

  // filter out stats known to have zero matching items on the production API.
  // If `stats` comes from the server enum it will contain enum keys (e.g. 'STRENGTH').
  // When using the local fallback the names are friendly strings and won't match
  // the filter list, which is acceptable for the fallback case.
  const visibleStats = stats.filter((s) => !STATS_WITH_ZERO_ITEMS.includes(s))

  // sort by popularity using the generated statPopularity mapping (descending)
  const popularityMap: Record<string, number> = (statPopularity as any) || {}
  visibleStats.sort((a, b) => {
    const pa = popularityMap[a] ?? 0
    const pb = popularityMap[b] ?? 0
    if (pa !== pb) return pb - pa
    return String(a).localeCompare(String(b))
  })

  const itemsPerPage = 10
  // items per server page
  
  const [page, setPage] = useState(0)
  const [nameQuery, setNameQuery] = useState('')
  const [statFilter, setStatFilter] = useState('')
  const [rarityFilter, setRarityFilter] = useState('')

  // local flag while advancing pages to prevent accidental double-navigation
  const [isAdvancing, setIsAdvancing] = useState(false)
  // items currently shown in the list; keep previous page visible while fetching next
  const [displayedItems, setDisplayedItems] = useState<PickerItem[]>([])
  // when advancing, preserve the list height to avoid layout flicker
  const [frozenHeight, setFrozenHeight] = useState<number | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  // measured height for a full page (itemsPerPage) so we can reserve space
  const [fullListHeight, setFullListHeight] = useState<number | null>(null)

  // Server schema: items(where: ItemFilterInput, first: Int, after: String) -> ItemsConnection
  const [pageCursors, setPageCursors] = useState<Array<string | null>>([null])
  const afterCursor = pageCursors[page] ?? null

  // track which page index the current `afterCursor` corresponds to so when
  // itemsData returns we know which page the data belongs to (avoids races)
  const lastAfterRef = useRef<{ cursor: string | null; page: number } | null>(null)
  useEffect(() => {
    lastAfterRef.current = { cursor: afterCursor, page }
  }, [afterCursor, page])

  // map local slot keys to server EquipSlot enum names (defined before first use)
  const SLOT_MAP: Record<string, string> = {
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

  // Map runtime slotKey to centralized slotNames for user-facing labels
  const slotFriendly = (k: string) => {
    if (!k) return ''
    const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const target = norm(k)
    for (const enumKey of Object.keys(slotNames || {})) {
      if (norm(enumKey) === target) return slotNames[enumKey]
      if (norm(slotNames[enumKey]) === target) return slotNames[enumKey]
    }
    return String(k || '').replace(/[_\-]+/g, ' ').replace(/(\b[a-z](?!\s))/g, (m) => m.toUpperCase())
  }

  // read current build state (career) and map slot to server enum
  const build = useBuild()
  const usableByCareer = build?.state?.careerId ?? null
  const mappedSlot = SLOT_MAP[slotKey]
  const levelReq = build?.state?.careerRank ?? undefined
  const renownReq = build?.state?.renownRank ?? undefined

  // Build slot filter with custom rules for jewellery slots:
  // - JEWELLERY1: accept any jewellery slot (JEWELLERY1..4)
  // - JEWELLERY2/3/4: restrict to the specific slot
  let slotFilter: any = null
  if (mappedSlot) {
    const m = String(mappedSlot).match(/^JEWELLERY(\d)$/)
    const p = String(mappedSlot).match(/^POCKET(\d)$/)
    if (m) {
      const n = m[1]
      // For selected jewel slot N, show JEWELLERY1 and JEWELLERY<N>
      const set = Array.from(new Set(['JEWELLERY1', `JEWELLERY${n}`]))
      slotFilter = { in: set }
    } else if (p) {
      // pocket slots are agnostic: allow items for either pocket slot
      slotFilter = { in: ['POCKET1', 'POCKET2'] }
    } else if (mappedSlot === SLOTS.MAIN_HAND || mappedSlot === SLOTS.OFF_HAND) {
      // include items that can be equipped in either hand for main/off hand slots
      slotFilter = { in: [mappedSlot, SLOTS.EITHER_HAND] }
    } else {
      slotFilter = { eq: mappedSlot }
    }
  }

  // Note: server ItemFilterInput does not support OR. For talisman (ENHANCEMENT)
  // selection we omit the level filter server-side and apply a client-side
  // post-filter that accepts items where either `levelRequirement` or
  // `itemLevel` equals the host item's level.
  const whereInput: any = (nameQuery || rarityFilter || mappedSlot || levelReq || renownReq || typeFilter || typeof forItemLevel !== 'undefined') ? {
    ...(nameQuery ? { name: { contains: nameQuery } } : {}),
    ...(rarityFilter ? { rarity: { eq: rarityFilter } } : {}),
    // When filtering for talismans (type=ENHANCEMENT) do not apply the equipment slot filter
    ...((typeFilter === 'ENHANCEMENT') ? {} : (slotFilter ? { slot: slotFilter } : {})),
    // Only add a server-side levelRequirement filter when not picking ENHANCEMENT talismans.
    ...(typeof forItemLevel !== 'undefined' && typeFilter !== 'ENHANCEMENT' ? { levelRequirement: { eq: forItemLevel } } : (levelReq != null ? { levelRequirement: { lte: levelReq } } : {})),
    ...(renownReq != null ? { renownRankRequirement: { lte: renownReq } } : {}),
    ...(typeFilter ? { type: { eq: typeFilter } } : {}),
  } : null

  const variables: any = {
    where: whereInput,
  first: itemsPerPage,
  after: afterCursor,
  order: [{ itemLevel: 'DESC' }, { name: 'ASC' }],
  }
  // If the user selected a stat, ask the server for items that have that stat.
  // The server's `hasStats` can be restrictive when used with multiple values,
  // so only set it when the user explicitly chooses one.
  if (statFilter) variables.hasStats = [statFilter]
  // Do not include usableByCareer when selecting ENHANCEMENT talismans because many
  // enhancements are not career-bound; sending this filter returns zero results.
  if (usableByCareer && typeFilter !== 'ENHANCEMENT') variables.usableByCareer = usableByCareer

  const { data: itemsData, loading: itemsLoading, error: itemsError, refetch } = useQuery<ItemsQueryData, ItemsQueryVars>(ITEMS_QUERY, {
    variables,
    fetchPolicy: 'cache-and-network',
  })

  // Dev debug: always print the query variables, selection context, and a
  // small summary of server results to diagnose empty lists.
  useEffect(() => {
  try {
  console.log('[ItemPicker] context', { slotKey, typeFilter, forItemName, forItemLevel })
  console.log('[ItemPicker] variables:', variables)
  try { console.log('[ItemPicker] variablesJSON:', JSON.stringify(variables, null, 2)) } catch (e) { /* ignore */ }
      console.log('[ItemPicker] totalCount:', itemsData?.items?.totalCount ?? 0)
      if (itemsData?.items?.nodes) console.log('[ItemPicker] sample node:', (itemsData.items.nodes as any)[0] ?? null)
  // raw server payload (object) to help inspect unexpected shapes
  try { console.log('[ItemPicker] rawResponseObject:', itemsData) } catch (e) { /* ignore */ }
  // also attempt a JSON snapshot (may fail on circular refs)
  try { console.log('[ItemPicker] rawResponseJSON:', JSON.stringify(itemsData)) } catch (e) { console.log('[ItemPicker] rawResponseJSON:error', String(e)) }
  // log any query error reported by Apollo
  try { if ((itemsError as any)) console.log('[ItemPicker] itemsError:', itemsError) } catch (e) { /* ignore */ }
    } catch (e) {
      // ignore debug failures
    }
  }, [slotKey, typeFilter, forItemName, forItemLevel, variables, itemsData])

  const serverResults: PickerItem[] = (itemsData?.items?.nodes ?? []) as PickerItem[]
  const totalResults: number = itemsData?.items?.totalCount ?? 0

  // pageCount: when server has returned data use its total, otherwise default to 1
  const serverPageCount = Math.max(1, Math.ceil((itemsData?.items?.totalCount ?? 0) / itemsPerPage))
  const hasResults = totalResults > 0
  const isRefetching = itemsLoading && serverResults && serverResults.length > 0

  const root = document.getElementById(MODAL_ROOT_ID)
  if (!root) return null

  

  // decide which source of items to render (server-only) and sort by itemLevel desc
  const rawSource: PickerItem[] = serverResults
  const getILvl = (it: PickerItem) => {
    const v = it?.itemLevel
    if (v == null) return 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  // Rarity ranking: higher number => higher precedence in sort
  const RARITY_RANK: Record<string, number> = {
    MYTHIC: 6,
    LEGENDARY: 5,
    EPIC: 4,
    RARE: 3,
    UNCOMMON: 2,
    COMMON: 1,
  }
  const getRarityRank = (it: PickerItem) => {
    try {
      const r = String(it?.rarity ?? '').toUpperCase()
      return RARITY_RANK[r] ?? 0
    } catch (e) {
      return 0
    }
  }
  // compute baseDamage: dps * (speed / 1000). both fields may be null/undefined.
  const getBaseDamage = (it: PickerItem) => {
    try {
      const d = (it as any).dps
      const s = (it as any).speed
      if (d == null || s == null) return 0
      const nd = Number(d)
      const ns = Number(s)
      if (!Number.isFinite(nd) || !Number.isFinite(ns) || ns <= 0) return 0
      return nd * (ns / 1000)
    } catch (e) {
      return 0
    }
  }

  // Two-hand classification removed: rely entirely on server `slot` metadata.
  // source of items is the server-provided nodes only; no local prefetch buffer
  const combinedSource = rawSource
  // Previously we filtered out items with no stats (vanity items); show everything the
  // server returns now so the picker reflects raw server results.
  const isPocketSlot = Boolean(mappedSlot && String(mappedSlot).startsWith('POCKET'))
  const isVisible = (_it: PickerItem) => true

  const filteredSource = combinedSource.filter(isVisible)
  // If selecting talismans (ENHANCEMENT) for a host item level, apply a client-side
  // filter to accept items where either levelRequirement or itemLevel equals that level.
  let itemsFiltered = filteredSource.slice()
  if (typeof forItemLevel !== 'undefined' && typeFilter === 'ENHANCEMENT') {
    const wantLevel = Number(forItemLevel)
    itemsFiltered = itemsFiltered.filter((it) => {
      const lvlReq = it.levelRequirement == null ? null : Number(it.levelRequirement)
      const ilvl = it.itemLevel == null ? null : Number(it.itemLevel)
      return lvlReq === wantLevel || ilvl === wantLevel
    })
  }
  const itemsSource: PickerItem[] = itemsFiltered.sort((a, b) => {
    const ilvlDiff = getILvl(b) - getILvl(a)
    if (ilvlDiff !== 0) return ilvlDiff
    const rarityDiff = getRarityRank(b) - getRarityRank(a)
    if (rarityDiff !== 0) return rarityDiff
    return String(a.name ?? '').localeCompare(String(b.name ?? ''))
  })
  // displayedItems holds the most recently confirmed page of items; initialize
  // from itemsSource when new server data arrives.
  const visibleCount = displayedItems.length

  // compute baseline (minimum non-zero baseDamage) from the current server page
  const currentBases = (itemsSource ?? []).map((it) => getBaseDamage(it)).filter((v) => v > 0)
  const globalBaseline = currentBases.length ? Math.min(...currentBases) : 0

  // Build a per-(itemLevel,rarity) baseline map to allow uniform classification
  // across item classes. Key format: "<ilvl>:<rarity>".
  const groupBaselineMap = (() => {
    const m = new Map<string, number>()
    for (const it of itemsSource ?? []) {
      const key = `${getILvl(it)}:${String(it.rarity ?? '')}`
      const base = getBaseDamage(it)
      if (base <= 0) continue
      const prev = m.get(key)
      if (prev == null || base < prev) m.set(key, base)
    }
    return m
  })()

  // compute a stable full-page height (10 items) once we have a rendered page
  useEffect(() => {
    try {
      const el = listRef.current
      if (!el) return
      const currentCount = displayedItems.length
      if (!currentCount || currentCount === 0) return
      const totalH = el.clientHeight
      if (!totalH || totalH <= 0) return
      const perItem = totalH / currentCount
      const fullH = Math.round(perItem * itemsPerPage)
      if (fullH > 0) setFullListHeight(fullH)
    } catch (e) {
      /* ignore */
    }
  }, [displayedItems, itemsPerPage])

  // whether server indicates there are more pages available
  const serverHasNext = Boolean(itemsData?.items?.pageInfo?.hasNextPage)
  // determine if the next page will have items: either we have the cursor or server reports more
  const nextPageHasItems = Boolean(pageCursors[page + 1]) || Boolean(serverHasNext)

  // local page count based on filtered items (what the user actually sees)
  const localPageCount = Math.max(1, Math.ceil((filteredSource?.length ?? 0) / itemsPerPage))
  // pageCount should prefer the server's total (which respects all filters) when available;
  // otherwise fall back to the local page count computed from filtered results
  const pageCount = itemsData ? serverPageCount : localPageCount

  useEffect(() => {
    setPage(0)
    setPageCursors([null])
  }, [slotKey])

  useEffect(() => {
    setPage(0)
    setPageCursors([null])
  }, [nameQuery, statFilter, rarityFilter, build?.state?.careerRank, build?.state?.renownRank])

  // No client-side prefetching: rely on server `first/after` cursors and pageInfo

  // global key handling while modal is open: Escape to close, arrows to page
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1))
      if (e.key === 'ArrowRight') {
  if (nextPageHasItems) { freezeListHeight(); setIsAdvancing(true); goNext() }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, pageCount, pageCursors])

  // when new page data arrives, store its endCursor so user can navigate forward
  useEffect(() => {
    const endCursor = itemsData?.items?.pageInfo?.endCursor
    if (!endCursor) return

    // determine which page this itemsData corresponds to. Prefer the lastAfterRef
    // (which is set when the query variables were rendered). Fall back to `page`.
    const dataPage = lastAfterRef.current?.page ?? page
    setPageCursors((prev) => {
      const copy = prev.slice()
      if (copy[dataPage + 1] !== endCursor) copy[dataPage + 1] = endCursor
      return copy
    })
  }, [itemsData, page])

  // when itemsData for the current page arrives, update the displayedItems
  useEffect(() => {
    const nodes = (itemsData?.items?.nodes ?? []) as PickerItem[]
    if (!nodes) return
    const sorted = nodes.slice().sort((a, b) => {
      const ilvlDiff = getILvl(b) - getILvl(a)
      if (ilvlDiff !== 0) return ilvlDiff
      const rarityDiff = getRarityRank(b) - getRarityRank(a)
      if (rarityDiff !== 0) return rarityDiff
      return String(a.name ?? '').localeCompare(String(b.name ?? ''))
    })
    setDisplayedItems(sorted)
    // new data arrived; unfreeze height and clear advancing
    if (listRef.current) {
      try { listRef.current.style.minHeight = '' } catch (e) { /* ignore */ }
    }
    setFrozenHeight(null)
  }, [itemsData])

  // Debug: when itemsData arrives, log detailed info for specific items to
  // help diagnose classification differences (only on localhost).
  useEffect(() => {
    try {
      const host = typeof window !== 'undefined' ? window.location.hostname : ''
      if (!(host === 'localhost' || host === '127.0.0.1')) return
      const nodes = (itemsData?.items?.nodes ?? []) as PickerItem[]
      if (!nodes || !nodes.length) return
      const inspectIds = new Set([3442, 3444].map((n) => String(n)))
      const rows: any[] = []
      for (const it of nodes) {
        if (!it || !it.id) continue
        if (!inspectIds.has(String(it.id))) continue
        const base = getBaseDamage(it)
        const key = `${getILvl(it)}:${String(it.rarity ?? '')}`
        const groupBaseline = groupBaselineMap.get(key) ?? globalBaseline
  const slotStr = (it as any).slot
  const twoHand = slotStr === SLOTS.TWO_HAND || slotStr === SLOTS.TWO_HANDED || slotStr === SLOTS.TWO_HANDED_WEAPON
  rows.push({ id: it.id, name: it.name, slot: slotStr, type: (it as any).type, dps: (it as any).dps, speed: (it as any).speed, rarity: it.rarity, itemLevel: it.itemLevel, baseDamage: base, groupBaseline, twoHand, confidence: twoHand ? 'server' : 'server' })
      }
      if (rows.length) console.table(rows)
    } catch (e) {
      /* ignore debug errors */
    }
  }, [itemsData, groupBaselineMap, globalBaseline])

  // clear advancing flag when new data arrives or on error
  useEffect(() => {
    if (isAdvancing && (itemsData || itemsError)) {
      setIsAdvancing(false)
    }
  }, [isAdvancing, itemsData, itemsError])

  // also clear inline minHeight when advancing completes
  useEffect(() => {
    if (!isAdvancing && listRef.current) {
      try { listRef.current.style.minHeight = '' } catch (e) { /* ignore */ }
      setFrozenHeight(null)
    }
  }, [isAdvancing])

  // helper to capture and freeze current list height
  const freezeListHeight = () => {
    try {
      const h = listRef.current?.clientHeight ?? null
      if (h && h > 0) {
        // apply inline style synchronously so the list doesn't resize on the next render
        try { if (listRef.current) listRef.current.style.minHeight = `${h}px` } catch (e) { /* ignore */ }
        setFrozenHeight(h)
      }
    } catch (e) {
      /* ignore */
    }
  }

  // helper to advance to next page safely: ensure we have a cursor and some data for it
  function goNext() {
    // if we already at last page according to pageCount, do nothing
    if (page >= pageCount - 1) return

    // advance if we know the next page cursor or server indicates there is a next page
    if (pageCursors[page + 1] || Boolean(itemsData?.items?.pageInfo?.hasNextPage)) {
      setIsAdvancing(true)
      setPage((p) => Math.min(p + 1, pageCount - 1))
    }
  }

  const handleSelectAndClose = (it: PickerItem) => {
    // normalize server item into ItemRef shape expected by build context
    const normalized: ItemRef = {
      id: it.id,
      name: it.name,
  icon: it.iconUrl ?? it.icon ?? undefined,
  rarity: it.rarity ?? undefined,
  itemLevel: it.itemLevel ?? undefined,
  itemSet: it.itemSet ? { id: it.itemSet.id, name: it.itemSet.name ?? undefined } : undefined,
    stats: Array.isArray((it as any).stats) ? (it as any).stats.map((s: any) => ({ stat: s.stat, value: s.value ?? null, percentage: s.percentage ?? null })) : undefined,
    }
  // selection committed silently
  // commit only the minimal normalized item; SlotCard will fetch full details
  if (build && commitToSlot) {
    // If we're putting a two-handed item into mainhand, clear the offhand slot
                const key = `${getILvl(it)}:${String(it.rarity ?? '')}`
                const groupBaseline = groupBaselineMap.get(key) ?? globalBaseline
                // Do not auto-clear offhand here. Server metadata determines valid equipping.
    build.setSlotItem(slotKey as any, normalized)
  }
  onSelect(normalized)
  onClose()
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal modal-topcenter"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Select ${slotKey}`}
        tabIndex={-1}
      >
        <div className="modal-header">
          <h3>{forItemName ? `Choose talisman for ${forItemName}` : `Choose item for ${slotFriendly(slotKey)}`}</h3>
          {/* Refresh indicator removed per UX request */}
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className="modal-close"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="picker-toolbar" onMouseDown={(e) => e.stopPropagation()}>
          <input className="picker-input" placeholder="Filter name..." value={nameQuery} onChange={(e) => setNameQuery(e.target.value)} onMouseDown={(e) => e.stopPropagation()} />
          <select className="picker-select" value={statFilter} onChange={(e) => setStatFilter(e.target.value)} onMouseDown={(e) => e.stopPropagation()}>
            <option value="">All stats</option>
            {visibleStats.map((s) => (
              <option key={s} value={s}>{friendlyName(s)}</option>
            ))}
          </select>
          <select className="picker-select" value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value)} onMouseDown={(e) => e.stopPropagation()}>
            <option value="">All rarities</option>
            {rarities.map((r) => (
              <option key={r} value={r}>{friendlyName(r)}</option>
            ))}
          </select>
  </div>

  {itemsError ? (
          <div className="picker-state picker-error">
            <div style={{ marginBottom: 8 }}>Failed to load items: {itemsError.message}</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button type="button" onClick={() => refetch?.()}>Retry</button>
              <button type="button" onClick={() => refetch?.()}>Retry (no filters)</button>
              <button type="button" onClick={async () => {
                // raw fetch to surface server response body for debugging
                try {
                  const res = await fetch('https://production-api.waremu.com/graphql/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: '{ __typename }' }),
                  })
                  const text = await res.text()
                  alert(`Raw response (${res.status}):\n\n${text.substring(0, 2000)}`)
                } catch (e: any) {
                  // raw fetch failed — surface to user via alert, but avoid console noise
                  alert(String(e))
                }
              }}>Raw fetch</button>
            </div>
            <details style={{ maxHeight: 300, overflow: 'auto' }}>
              <summary>Show raw error</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(itemsError, Object.getOwnPropertyNames(itemsError), 2)}</pre>
            </details>
          </div>
        ) : itemsLoading && (!serverResults || serverResults.length === 0) && !isAdvancing ? (
          <div className="picker-state picker-loading">Loading items…</div>
  ) : (visibleCount === 0 && !isAdvancing) ? (
          <div className="picker-state picker-empty">
            <div style={{ marginBottom: 8 }}>No items found for your filters.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => { setNameQuery(''); setRarityFilter(''); refetch?.() }}>Clear filters</button>
              <button type="button" onClick={() => refetch?.()}>Retry</button>
            </div>
          </div>
        ) : (
          <>
            {/* decide minHeight: prefer the frozen snapshot while advancing,
                otherwise reserve the measured full page height so the list never collapses */}
            <ul
            className="picker-list"
            role="list"
            ref={listRef}
            style={(() => {
              if (isAdvancing) {
                if (frozenHeight) return { minHeight: `${frozenHeight}px` }
                if (fullListHeight) return { minHeight: `${fullListHeight}px` }
                return undefined
              }
              if (fullListHeight) return { minHeight: `${fullListHeight}px` }
              return undefined
            })()}
          >
            {displayedItems.map((it) => {
              // determine if this item is already slotted in another slot (by id)
              const findEquippedSlot = (itemId: string): string | null => {
                try {
                  const slots = build.state?.slots ?? {}
                  for (const k of Object.keys(slots)) {
                    const s = (slots as any)[k]
                    if (s && s.id === itemId) return k
                  }
                } catch (e) {
                  /* ignore */
                }
                return null
              }

              const equippedIn = findEquippedSlot(it.id)
              const uniqueFlag = Boolean((it as any).uniqueEquipped)
              const disabled = Boolean(uniqueFlag && equippedIn && equippedIn !== slotKey)
              const key = `${getILvl(it)}:${String(it.rarity ?? '')}`
              const groupBaseline = groupBaselineMap.get(key) ?? globalBaseline
              // Use server slot metadata to show (2H) when slot indicates two-handed.
              const slotStr = (it as any).slot
              const twoHand = slotStr === SLOTS.TWO_HAND || slotStr === SLOTS.TWO_HANDED || slotStr === SLOTS.TWO_HANDED_WEAPON
              const dpsVal = (it as any).dps
              const speedVal = (it as any).speed
              const armorVal = (it as any).armor
              // Only show metadata when the numeric value is finite and non-zero.
              const dpsNum = dpsVal != null ? Number(dpsVal) : null
              const speedNum = speedVal != null ? Number(speedVal) : null
              const armorNum = armorVal != null ? Number(armorVal) : null
              const showMeta = (dpsNum != null && Number.isFinite(dpsNum) && dpsNum !== 0) || (speedNum != null && Number.isFinite(speedNum) && speedNum !== 0) || (armorNum != null && Number.isFinite(armorNum) && armorNum !== 0)

              return (
                <li
                  key={it.id}
                  className={`picker-item${disabled ? ' picker-item-disabled' : ''}`}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (disabled) return
                    handleSelectAndClose(it)
                  }}
                  role="button"
                  aria-disabled={disabled}
                  tabIndex={disabled ? -1 : 0}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter' && !disabled) handleSelectAndClose(it)
                  }}
                  style={{ opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
                >
                  <div className="picker-icon">
                    <img src={it.iconUrl ?? it.icon ?? getDefaultIcon(slotKey) ?? ''} alt={it.name} />
                  </div>
                  <div className="picker-name" style={{ color: it.itemSet?.id ? ITEMSET_COLOR : (RARITY_COLORS[it.rarity ?? 'COMMON'] ?? '#fff') }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 600 }}>{it.name}</div>
                    </div>
                    <div style={{ fontSize: 11, color: MUTED_COLOR, marginLeft: 8 }}>
                      {friendlyName((it as any).type)} - {friendlyName((it as any).slot)}{twoHand ? ' (2H)' : ''} - Item level {it.itemLevel ?? '\ufffd'}
                    </div>
                    {showMeta ? (
                      <div style={{ fontSize: 11, color: MUTED_COLOR, marginLeft: 8 }}>
                        {(() => {
                          const parts: string[] = []
                          if (dpsNum != null && Number.isFinite(dpsNum) && dpsNum !== 0) parts.push(`DPS: ${dpsNum}`)
                          if (speedNum != null && Number.isFinite(speedNum) && speedNum !== 0) parts.push(`Speed: ${speedNum}`)
                          if (armorNum != null && Number.isFinite(armorNum) && armorNum !== 0) parts.push(`Armor: ${armorNum}`)
                          return parts.join(' · ')
                        })()}
                      </div>
                    ) : null}
                    {disabled ? <div style={{ fontSize: 11, color: MUTED_COLOR, marginLeft: 8 }}>Already equipped in {slotFriendly(equippedIn ?? '')}</div> : null}
                    {/* item id moved to Tooltip rendering; do not show it inline in the picker list */}
                  </div>
                </li>
              )
            })}
          </ul>
          </>
        )}

        <div className="picker-footer">
          <button type="button" className="pager-button" onClick={() => { freezeListHeight(); setIsAdvancing(true); setPage((p) => Math.max(0, p - 1)) }} disabled={visibleCount === 0 || page === 0} aria-label="Previous page">
            ‹ Prev
          </button>
          <div className="pager-info">Page {page + 1} of {pageCount}</div>
          {/* Loading page indicator removed per UX request */}
          <button type="button" className="pager-button" onClick={() => { if (nextPageHasItems) { freezeListHeight(); setIsAdvancing(true); goNext() } }} disabled={visibleCount === 0 || !nextPageHasItems || isAdvancing} aria-label="Next page">
            Next ›
          </button>
        </div>
      </div>
    </div>,
    root,
  )
}

