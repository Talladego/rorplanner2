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
    setState((s) => ({ ...s, slots: { ...s.slots, [slot]: item } }))
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
