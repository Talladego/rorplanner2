(async () => {
  const endpoint = 'https://production-api.waremu.com/graphql/'
  // adjust filters as needed
  const ilvl = 66
  const rarity = 'VERY_RARE'
  const slot = 'MAIN_HAND'
  const first = 50

  const query = `query Items($where:ItemFilterInput,$first:Int,$after:String){ items(where:$where, first:$first, after:$after){ totalCount nodes{ id name slot type dps speed rarity itemLevel } pageInfo{ endCursor hasNextPage } } }`

  const where = { slot: { eq: slot }, itemLevel: { eq: ilvl }, rarity: { eq: rarity } }

  async function fetchPage(after) {
    const variables = { where, first, after }
    const body = JSON.stringify({ query, variables })
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    const text = await res.text()
    let j
    try { j = JSON.parse(text) } catch (err) { j = null }
    if (!res.ok) {
      console.error('HTTP error', res.status, res.statusText)
      console.error('Response body:', text)
      throw new Error(`HTTP ${res.status}`)
    }
    if (j && j.errors && j.errors.length) {
      console.error('GraphQL errors:', JSON.stringify(j.errors, null, 2))
    }
    return j && j.data ? j.data.items : null
  }

  function toNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : null }
  function baseDamage(it) { const d = toNumber(it.dps); const s = toNumber(it.speed); if (d==null||s==null||s<=0) return 0; return d*(s/1000) }

  try {
    let allNodes = []
    let after = null
    let pages = 0
    const maxPages = 20
    let totalCount = null
    while (pages < maxPages) {
      const itemsConn = await fetchPage(after)
      if (!itemsConn) {
        console.error('Server returned empty items connection; raw response dumped below:')
        const body = JSON.stringify({ query, variables: { where, first, after } })
        console.error('Request body:', body)
        break
      }
      const nodes = itemsConn.nodes || []
      totalCount = itemsConn.totalCount
      allNodes = allNodes.concat(nodes)
      pages += 1
      const pi = itemsConn.pageInfo || {}
      console.log(`Page ${pages}: fetched ${nodes.length} nodes (cumulative ${allNodes.length})`) 
      if (!pi.hasNextPage) break
      after = pi.endCursor
    }
    if (!allNodes.length) {
      console.log('No nodes fetched; aborting')
      return
    }
  console.log(`Fetched ${allNodes.length} nodes (totalCount ${totalCount}) for slot=${slot}, ilvl=${ilvl}, rarity=${rarity} across ${pages} pages`)
  const bases = allNodes.map(baseDamage).filter(b=>b>0)
  const globalBaseline = bases.length ? Math.min(...bases) : 0
    console.log('globalBaseline (min non-zero baseDamage):', globalBaseline)

    // group baseline map by ilvl:rarity (they're the same here) but compute anyway
    const groupKey = `${ilvl}:${rarity}`
    const groupBaseline = globalBaseline

    // count how many would be classified as 2H
    const threshold = groupBaseline * 1.8
  const classified = allNodes.map(it=>({ id: it.id, name: it.name, type: it.type, dps: it.dps, speed: it.speed, base: baseDamage(it), is2H: (baseDamage(it)>0 && baseDamage(it)>=threshold) }))
  const count2H = classified.filter(c=>c.is2H).length
  console.log(`Items classified 2H (threshold ${threshold.toFixed(3)}): ${count2H} / ${allNodes.length}`)
  // show sample of extremes
  const sorted = classified.slice().sort((a,b)=>b.base-a.base)
  console.log('\nTop 10 by baseDamage:')
  console.table(sorted.slice(0,10))
  console.log('\nBottom 10 (non-zero):')
  console.table(sorted.filter(s=>s.base>0).slice(-10))
  } catch (e) {
    console.error('Probe failed:', e.message||e)
  }
})()
