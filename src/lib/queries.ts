import { gql } from '@apollo/client'

export const ITEMS_QUERY = gql`
  query Items($where: ItemFilterInput, $hasStats: [Stat!], $first: Int, $after: String, $usableByCareer: Career, $order: [ItemSortInput!]) {
    items(where: $where, hasStats: $hasStats, first: $first, after: $after, usableByCareer: $usableByCareer, order: $order) {
  totalCount
    nodes {
  id
  name
  iconUrl
  rarity
  itemLevel
  levelRequirement
  slot
  type
  armor
  dps
  speed
  uniqueEquipped
  stats { stat value percentage }
  itemSet { id name }
    }
      pageInfo { hasNextPage endCursor }
    }
  }
`

export const ITEM_QUERY = gql`
  query Item($id: ID!) {
    item(id: $id) {
      id
      name
      description
      iconUrl
      rarity
      slot
      type
      armor
      dps
      speed
      talismanSlots
      itemLevel
      levelRequirement
      renownRankRequirement
      uniqueEquipped
      stats { stat value percentage }
      careerRestriction
      raceRestriction
      itemSet {
        id
        name
        bonuses {
          itemsRequired
          bonus {
            __typename
            ... on ItemStat { stat value percentage }
            ... on Ability { id name description }
          }
        }
      }
      buffs { id name description }
      abilities { id name description }
      rewardedFromQuests { totalCount }
      rewardedFromChapters { totalCount }
      soldByVendors { totalCount }
      usedToPurchase { totalCount }
      dropsFromCreatures { totalCount }
      dropsFromGameObjects { totalCount }
    }
  }
`
