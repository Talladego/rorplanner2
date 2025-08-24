import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ItemRef } from '../lib/buildContext'
import { getDefaultIcon } from '../lib/defaultIcons'
import { useQuery, gql } from '@apollo/client'
import { apolloClient } from '../lib/apollo'
import Tooltip from './Tooltip'

export default function ItemPickerModal({ slotKey, onClose, onSelect }: { slotKey: string; onClose: () => void; onSelect: (it: ItemRef) => void }) {
  // demo data for paging — replace with real query later
  type DemoItem = ItemRef & { stat: string; rarity: string }
  const localStatFallback = ['Strength', 'Toughness', 'Agility', 'Dexterity', 'Weapon Strength']
  const localRarityFallback = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']

  const ENUM_QUERY = gql`
    query EnumValues($name: String!) {
      __type(name: $name) { enumValues { name } }
    }
  `

  const { data: statData } = useQuery(ENUM_QUERY, { variables: { name: 'Stat' }, client: apolloClient })
  const { data: rarityData } = useQuery(ENUM_QUERY, { variables: { name: 'ItemRarity' }, client: apolloClient })

  const stats: string[] = statData?.__type?.enumValues?.map((v: any) => v.name) ?? localStatFallback
  const rarities: string[] = rarityData?.__type?.enumValues?.map((v: any) => v.name) ?? localRarityFallback
  const demoItems: DemoItem[] = Array.from({ length: 50 }).map((_, i) => ({
    id: `${slotKey}-demo-${i + 1}`,
    name: `${slotKey} - Demo Item ${i + 1}`,
    stat: stats[i % stats.length],
    rarity: rarities[i % rarities.length],
  }))

  const itemsPerPage = 10
  const [page, setPage] = useState(0)
  const [nameQuery, setNameQuery] = useState('')
  const [statFilter, setStatFilter] = useState('')
  const [rarityFilter, setRarityFilter] = useState('')

  const filtered = demoItems.filter((it) => {
    if (nameQuery && !it.name.toLowerCase().includes(nameQuery.toLowerCase())) return false
    if (statFilter && it.stat !== statFilter) return false
    if (rarityFilter && it.rarity !== rarityFilter) return false
    return true
  })

  const pageCount = Math.max(1, Math.ceil(filtered.length / itemsPerPage))

  const root = document.getElementById('modal-root')
  if (!root) return null

  useEffect(() => {
    setPage(0)
  }, [slotKey])

  useEffect(() => {
    setPage(0)
  }, [nameQuery, statFilter, rarityFilter])

  // global key handling while modal is open: Escape to close, arrows to page
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1))
      if (e.key === 'ArrowRight') setPage((p) => Math.min(pageCount - 1, p + 1))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, pageCount])

  const handleSelectAndClose = (it: ItemRef) => {
    onSelect(it)
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
          <h3>Choose item for {slotKey}</h3>
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
            {stats.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select className="picker-select" value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value)} onMouseDown={(e) => e.stopPropagation()}>
            <option value="">All rarities</option>
            {rarities.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button type="button" className="picker-clear" onClick={() => { setNameQuery(''); setStatFilter(''); setRarityFilter('') }} onMouseDown={(e) => e.stopPropagation()}>Clear</button>
        </div>

        <ul className="picker-list" role="list">
          {filtered.slice(page * itemsPerPage, page * itemsPerPage + itemsPerPage).map((it) => (
            <li
              key={it.id}
              className="picker-item"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                handleSelectAndClose(it)
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') handleSelectAndClose(it)
              }}
            >
              <Tooltip content={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="slot-icon"><img src={getDefaultIcon(slotKey) ?? ''} alt={it.name} /></div><div><div className="slot-name">{it.name}</div><div style={{ fontSize: 11, color: '#9aa6b2' }}>{it.stat} · {it.rarity}</div></div></div>}>
                <>
                  <div className="picker-icon">
                    <img src={getDefaultIcon(slotKey) ?? ''} alt={it.name} />
                  </div>
                  <div className="picker-name">{it.name}<div style={{ fontSize: 11, color: '#9aa6b2', marginLeft: 8 }}>{it.stat} · {it.rarity}</div></div>
                </>
              </Tooltip>
            </li>
          ))}
        </ul>

        <div className="picker-footer">
          <button type="button" className="pager-button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page">
            ‹ Prev
          </button>
          <div className="pager-info">Page {page + 1} of {pageCount}</div>
          <button type="button" className="pager-button" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} aria-label="Next page">
            Next ›
          </button>
        </div>
      </div>
    </div>,
    root,
  )
}
