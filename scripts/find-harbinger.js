/*
  Query server for items with name containing 'Harbinger' and print matches.
  Usage: node scripts/find-harbinger.js
*/
const endpoint = 'https://production-api.waremu.com/graphql/'
const FIRST = 50

async function run(){
  const query = `query Items($where: ItemFilterInput, $first: Int){ items(where: $where, first: $first){ nodes{ id name slot type itemLevel levelRequirement renownRankRequirement dps speed rarity } } }`
  const where = { name: { contains: 'Harbinger' }, slot: { in: ['MAIN_HAND','EITHER_HAND'] } }
  const body = JSON.stringify({ query, variables: { where, first: FIRST } })
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  const j = await res.json()
  if (j.errors) console.error('GraphQLErrors', j.errors)
  const nodes = j.data?.items?.nodes || []
  console.log(`Found ${nodes.length} nodes with 'Harbinger'`)
  for (const n of nodes){ console.log(`${n.id} | ${n.name} | ilvl=${n.itemLevel} lvlReq=${n.levelRequirement} dps=${n.dps} speed=${n.speed} rarity=${n.rarity}`) }
}
run().catch(e=>{ console.error('Failed', e && e.message) })
