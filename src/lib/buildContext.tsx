import React, { createContext, useContext, useState } from 'react'

export type SlotKey =
  | 'helm'
  | 'shoulders'
  | 'back'
  | 'body'
  | 'gloves'
  | 'belt'
  | 'boots'
  | 'jewel1'
  | 'jewel2'
  | 'jewel3'
  | 'jewel4'
  | 'pocket1'
  | 'pocket2'
  | 'mainhand'
  | 'offhand'
  | 'ranged'
  | 'event'

export type ItemRef = {
  id: string
  name: string
  icon?: string
  rarity?: string
  itemLevel?: number
  itemSet?: { id: string; name?: string } | null
  // brief description/tooltip summary (optional)
  description?: string
  // item type (e.g. ROBE, HELM, etc.)
  type?: string
  // armor value (if applicable)
  armor?: number | string
  // optional full details fetched when the item is selected
  details?: any
  // optional stats from the item (or talisman)
  stats?: Array<{ stat: string; value?: number | null; percentage?: number | null }>
  // optional nested talismans when item supports them
  talismans?: Array<ItemRef | null>
}

type BuildState = {
  careerId?: string
  careerRank: number
  renownRank: number
  slots: Partial<Record<SlotKey, ItemRef | null>>
}

type BuildContextValue = {
  state: BuildState
  setCareer: (careerId?: string) => void
  setCareerRank: (rank: number) => void
  setRenownRank: (rank: number) => void
  setSlotItem: (slot: SlotKey, item: ItemRef | null) => void
  reset: () => void
}

const BuildContext = createContext<BuildContextValue | undefined>(undefined)

export const BuildProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<BuildState>({ careerRank: 40, renownRank: 80, slots: {} })

  const setCareer = (careerId?: string) => setState((s) => ({ ...s, careerId }))
  const setCareerRank = (careerRank: number) => setState((s) => ({ ...s, careerRank }))
  const setRenownRank = (renownRank: number) => setState((s) => ({ ...s, renownRank }))
    const setSlotItem = (slot: SlotKey, item: ItemRef | null) =>
      setState((s) => {
        let toStore = item
        try {
          if (item && (item as any).details) {
            // merge nested details into top-level and remove details key
            const merged = { ...item, ...(item as any).details }
            delete (merged as any).details
            toStore = merged as ItemRef
          }
        } catch (e) {
          // if merging fails, fall back to storing the provided item (silent)
        }

        // build the tentative new slots map
        const newSlots: Partial<Record<SlotKey, ItemRef | null>> = { ...s.slots, [slot]: toStore }

        // compute counts of how many items of each itemSet id are slotted
        const counts: Record<string, number> = {}
        try {
          for (const k of Object.keys(newSlots)) {
            const it = (newSlots as any)[k]
            if (it && it.itemSet && it.itemSet.id) {
              const id = String(it.itemSet.id)
              counts[id] = (counts[id] || 0) + 1
            }
          }
        } catch (e) {
          // ignore counting errors
        }

        // attach slottedCount to each stored item's itemSet so Tooltip can render correctly
        const slotsWithCounts: Partial<Record<SlotKey, ItemRef | null>> = {}
        for (const k of Object.keys(newSlots)) {
          const it = (newSlots as any)[k]
          if (it && it.itemSet && it.itemSet.id) {
            const id = String(it.itemSet.id)
            // shallow copy item and itemSet to avoid mutating original references
            const newItem = { ...it, itemSet: { ...it.itemSet, slottedCount: counts[id] } }
            slotsWithCounts[k as SlotKey] = newItem
          } else {
            slotsWithCounts[k as SlotKey] = it
          }
        }

        return { ...s, slots: slotsWithCounts }
      })
  const reset = () => setState({ careerRank: 1, renownRank: 1, slots: {} })
  // reset to sensible defaults used elsewhere in the app
  const resetDefaults = () => setState({ careerId: undefined, careerRank: 40, renownRank: 80, slots: {} })

  return (
    <BuildContext.Provider value={{ state, setCareer, setCareerRank, setRenownRank, setSlotItem, reset: resetDefaults }}>
      {children}
    </BuildContext.Provider>
  )
}

export function useBuild() {
  const ctx = useContext(BuildContext)
  if (!ctx) throw new Error('useBuild must be used inside BuildProvider')
  return ctx
}
