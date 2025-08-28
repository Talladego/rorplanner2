// Script: generate-stat-popularity.js
// Fetch all Stat enum values from the GraphQL schema, query the item count for
// each stat, and write a JSON mapping of { STAT: count } to src/lib/statPopularity.json
// Usage: node scripts/generate-stat-popularity.js

const fs = require('fs')
const endpoint = 'https://production-api.waremu.com/graphql'

async function fetchJson(body) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function run() {
  if (typeof fetch === 'undefined') {
    console.error('Global fetch not available in this Node. Abort.');
    process.exit(1);
  }

  // get enum values for Stat
  const enumQuery = { query: 'query StatEnum { __type(name: "Stat") { enumValues { name } } }' }
  const enumResp = await fetchJson(enumQuery)
  const stats = enumResp?.data?.__type?.enumValues?.map((v) => v.name) || []
  if (!stats.length) {
    console.error('No Stat enum values found')
    process.exit(1)
  }

  const counts = {}
  const itemQuery = 'query Items($hasStats: [Stat!]) { items(hasStats: $hasStats, first: 1) { totalCount } }'
  for (const stat of stats) {
    try {
      const body = { query: itemQuery, variables: { hasStats: [stat] } }
      const json = await fetchJson(body)
      const count = json?.data?.items?.totalCount ?? 0
      console.log(`${stat},${count}`)
      counts[stat] = Number(count || 0)
    } catch (err) {
      console.error('Error for', stat, err)
      counts[stat] = 0
    }
    // small delay
    await new Promise((r) => setTimeout(r, 120))
  }

  const out = JSON.stringify(counts, null, 2)
  fs.writeFileSync('src/lib/statPopularity.json', out)
  console.log('Wrote src/lib/statPopularity.json')
}

run().catch((e) => { console.error(e); process.exitCode = 1 })
