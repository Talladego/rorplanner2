// Script: find-rare-stats.js
// For each Stat enum value, query the items connection for totalCount and up to
// two example nodes. Print stats with count <= 1 along with the item names.
// Usage: node scripts/find-rare-stats.js

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
    console.error('Global fetch not available in this Node. Abort.')
    process.exit(1)
  }

  const enumQuery = { query: 'query StatEnum { __type(name: "Stat") { enumValues { name } } }' }
  const enumResp = await fetchJson(enumQuery)
  const stats = enumResp?.data?.__type?.enumValues?.map((v) => v.name) || []
  if (!stats.length) {
    console.error('No Stat enum values found')
    process.exit(1)
  }

  const itemQuery = 'query Items($hasStats: [Stat!]) { items(hasStats: $hasStats, first: 2) { totalCount nodes { id name } } }'

  const rare = []
  for (const stat of stats) {
    try {
      const body = { query: itemQuery, variables: { hasStats: [stat] } }
      const json = await fetchJson(body)
      const count = Number(json?.data?.items?.totalCount ?? 0)
      const nodes = json?.data?.items?.nodes || []
      if (count <= 1) {
        rare.push({ stat, count, nodes: nodes.map(n => ({ id: n.id, name: n.name })) })
      }
      // be polite
    } catch (err) {
      console.error('Error for', stat, err)
    }
    await new Promise((r) => setTimeout(r, 120))
  }

  if (!rare.length) {
    console.log('No stats with <= 1 items found')
    return
  }

  console.log('Stats with <= 1 items:')
  for (const r of rare) {
    console.log(`\n${r.stat} — count: ${r.count}`)
    if (r.nodes && r.nodes.length) {
      for (const n of r.nodes) {
        console.log(`  - ${n.id}: ${n.name}`)
      }
    } else {
      console.log('  (no example nodes returned)')
    }
  }
}

run().catch((e) => { console.error(e); process.exitCode = 1 })
