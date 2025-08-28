export interface ItemSetRef {
  id: string
  name?: string | null
}

export interface PickerItem {
  id: string
  name: string
  iconUrl?: string | null
  icon?: string | null
  rarity?: string | null
  slot?: string | null
  type?: string | null
  description?: string | null
  itemLevel?: number | null
  levelRequirement?: number | null
  renownRankRequirement?: number | null
  uniqueEquipped?: boolean | null
  dps?: number | null
  speed?: number | null
  armor?: number | null
  talismanSlots?: number | null
  itemSet?: ItemSetRef | null
  stats?: Array<{ stat: string; value?: number | null; percentage?: boolean | null }> | null
  careerRestriction?: string[] | null
  raceRestriction?: string[] | null
  // optional demo-only fields
  stat?: string | null
}

export interface ItemsQueryData {
  items?: {
    totalCount: number
    nodes: PickerItem[]
    pageInfo: { hasNextPage: boolean; endCursor?: string | null }
  } | null
}

export interface ItemsQueryVars {
  where?: any
  hasStats?: string[] | null
  first?: number | null
  after?: string | null
  usableByCareer?: string | null
  order?: Array<{ itemLevel?: 'ASC' | 'DESC' }>
}
