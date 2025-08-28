(async () => {
  // Simple probe script to fetch items and diagnose 2H classification.
  // Usage: node scripts\probe-items.js
  const endpoint = 'https://production-api.waremu.com/graphql/'
  const ids = [3442, 3444]

  const query = `query Item($id:ID!){ item(id:$id){ id name slot type dps speed rarity itemLevel } }`

  async function fetchItem(id) {
    const body = JSON.stringify({ query, variables: { id } })
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`HTTP ${res.status}: ${text}`)
    }
    const j = await res.json()
    return j.data?.item ?? null
  }

  function toNumber(v) {
    if (v == null) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  function getBaseDamage(it) {
    const d = toNumber(it?.dps)
    const s = toNumber(it?.speed)
    if (d == null || s == null || s <= 0) return 0
    return d * (s / 1000)
  }

  try {
    const results = []
    for (const id of ids) {
      try {
        const it = await fetchItem(id)
        if (!it) {
          console.error(`No item data for ${id}`)
          continue
        }
        results.push(it)
      } catch (e) {
        console.error(`Failed to fetch ${id}: ${e.message}`)
      }
    }

    if (!results.length) {
      console.error('No items fetched.')
      process.exit(1)
    }

    // build per-(ilvl,rarity) baseline
    const groups = {}
    for (const it of results) {
      const key = `${it.itemLevel ?? '0'}:${it.rarity ?? ''}`
      const base = getBaseDamage(it)
      if (!groups[key]) groups[key] = []
      if (base > 0) groups[key].push(base)
    }
    const baselines = {}
    for (const k of Object.keys(groups)) {
      const arr = groups[k]
      baselines[k] = arr.length ? Math.min(...arr) : 0
    }

    // Print table
    console.log('\nProbe results:')
    console.log('--------------------------------------------------------------------------------')
    console.log(['id', 'name', 'slot', 'type', 'ilvl', 'rarity', 'dps', 'speed', 'baseDamage', 'groupBaseline', '2H?'].join('\t'))
    for (const it of results) {
      const base = getBaseDamage(it)
      const key = `${it.itemLevel ?? '0'}:${it.rarity ?? ''}`
      const groupBaseline = baselines[key] ?? 0
      const classified = (base > 0 && groupBaseline > 0) ? (base >= groupBaseline * 1.8) : false
      console.log([
        it.id,
        it.name,
        it.slot ?? '',
        it.type ?? '',
        it.itemLevel ?? '',
        it.rarity ?? '',
        it.dps ?? '',
        it.speed ?? '',
        base.toFixed ? base.toFixed(3) : base,
        groupBaseline.toFixed ? groupBaseline.toFixed(3) : groupBaseline,
        classified
      ].join('\t'))
    }
    console.log('--------------------------------------------------------------------------------')
    console.log('Note: baseDamage = dps * (speed / 1000). Classification uses threshold: base >= baseline * 1.8')

  } catch (e) {
    console.error('Probe failed:', e)
    process.exit(2)
  }
})()
