;(async () => {
  const endpoint = 'https://production-api.waremu.com/graphql/'
  const slot = 'MAIN_HAND'
  const rarity = 'COMMON'
  const minIlvl = 1
  const maxIlvl = 10
  const target = 100
  const first = 50

  const query = `query Items($where: ItemFilterInput, $first: Int, $after: String){ items(where: $where, first: $first, after: $after){ nodes { id name slot type itemLevel dps speed rarity } pageInfo { hasNextPage endCursor } totalCount } }`

  const where = { slot: { eq: slot }, rarity: { eq: rarity }, itemLevel: { gte: minIlvl, lte: maxIlvl } }

  async function fetchPage(after) {
    const body = JSON.stringify({ query, variables: { where, first, after } })
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    const text = await res.text()
    let j
    try { j = JSON.parse(text) } catch (e) { j = null }
    if (!res.ok) {
      console.error('HTTP error', res.status, res.statusText)
      console.error('body:', text)
      throw new Error('HTTP')
    }
    if (j && j.errors && j.errors.length) console.error('GraphQL errors:', JSON.stringify(j.errors, null, 2))
    return j && j.data ? j.data.items : null
  }

  function toNumber(v){ const n = Number(v); return Number.isFinite(n)? n : null }
  function baseDamage(it){ const d = toNumber(it.dps); const s = toNumber(it.speed); if (d==null||s==null||s<=0) return null; return d*(s/1000) }

  try {
    let after = null
    let pages = 0
    const maxPages = 20
    const all = []
    while (all.length < target && pages < maxPages) {
      const conn = await fetchPage(after)
      if (!conn) break
      const nodes = conn.nodes || []
      for (const n of nodes) {
        if (!n) continue
        all.push(n)
        if (all.length >= target) break
      }
      pages += 1
      const pi = conn.pageInfo || {}
      if (!pi.hasNextPage) break
      after = pi.endCursor
    }

    console.log(`Fetched ${all.length} items (requested up to ${target}) across ${pages} pages`)
    if (!all.length) return

    const withBase = all.map((it) => {
      const base = baseDamage(it)
      return { id: it.id, name: it.name, type: it.type, itemLevel: it.itemLevel, rarity: it.rarity, dps: it.dps, speed: it.speed, base }
    })

    const valid = withBase.filter(s=>s.base!=null)
    const zeros = withBase.filter(s=>s.base==null)

    const bases = valid.map(s=>s.base)
    const count = withBase.length
    const validCount = valid.length
    const min = bases.length? Math.min(...bases) : null
    const max = bases.length? Math.max(...bases) : null
    const mean = bases.length? (bases.reduce((a,b)=>a+b,0)/bases.length) : null

    console.log(`Total: ${count}, with numeric baseDamage: ${validCount}, missing dps/speed: ${zeros.length}`)
    if (mean!=null) console.log(`baseDamage stats — min:${min.toFixed(3)} mean:${mean.toFixed(3)} max:${max.toFixed(3)}`)

    if (valid.length) {
      console.log('\nTop 10 by baseDamage:')
      const top = valid.slice().sort((a,b)=>b.base-a.base).slice(0,10)
      for (const t of top) console.log(`${t.id} ilvl:${t.itemLevel} type:${t.type} dps:${t.dps} speed:${t.speed} base:${t.base.toFixed(3)} name:${t.name}`)

      console.log('\nBottom 10 (non-zero):')
      const bot = valid.slice().sort((a,b)=>a.base-b.base).slice(0,10)
      for (const t of bot) console.log(`${t.id} ilvl:${t.itemLevel} type:${t.type} dps:${t.dps} speed:${t.speed} base:${t.base.toFixed(3)} name:${t.name}`)
    }
    if (zeros.length) {
      console.log('\nItems missing dps/speed (sample up to 10):')
      for (const z of zeros.slice(0,10)) console.log(`${z.id} ilvl:${z.itemLevel} type:${z.type} dps:${z.dps} speed:${z.speed} name:${z.name}`)
    }
  } catch (e) {
    console.error('Probe failed:', e && e.message ? e.message : e)
  }
})()
