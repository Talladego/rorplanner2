const https = require('https')

const RANGES = [ [0,10],[11,20],[21,30],[31,40],[41,50],[51,60],[61,70] ]
const PER_RANGE = 50

function fetchRange(low, high) {
  return new Promise((resolve, reject) => {
    const query = `query Items($where: ItemFilterInput, $first: Int){ items(where: $where, first: $first) { nodes { id name slot type itemLevel dps speed rarity } } }`;
    const where = { slot: { eq: 'MAIN_HAND' }, itemLevel: { gte: low, lte: high } }
    const body = JSON.stringify({ query, variables: { where, first: PER_RANGE, usableByCareer: 'CHOPPA' } })
    const opts = { hostname: 'production-api.waremu.com', path: '/graphql', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }
    const req = https.request(opts, (res) => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

;(async () => {
  try {
    const samples = []
    for (const [low, high] of RANGES) {
      console.log('=== fetching range', low, '-', high, `(${PER_RANGE} max) ===`)
      try {
        const res = await fetchRange(low, high)
        const nodes = res?.data?.items?.nodes || []
        console.log('server returned', nodes.length, 'nodes')
        for (const n of nodes) {
          if (!n) continue
          const dps = (typeof n.dps === 'number') ? n.dps : (n.dps ? Number(n.dps) : null)
          const speed = (typeof n.speed === 'number') ? n.speed : (n.speed ? Number(n.speed) : null)
          if (!Number.isFinite(dps) || !Number.isFinite(speed)) continue
          const base = dps * (speed / 1000)
          samples.push({ id: n.id, name: n.name, slot: n.slot, type: n.type, itemLevel: n.itemLevel, rarity: n.rarity, dps, speed, base })
        }
      } catch (e) {
        console.error('range fetch failed', low, high, e && e.message ? e.message : e)
      }
    }

    console.log('\nCollected samples:', samples.length)
    if (!samples.length) return

    const mean = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null
    const bySlot = { MAIN_HAND: [] }
    for (const s of samples) bySlot.MAIN_HAND.push(s.base)
    console.log('MAIN_HAND count', bySlot.MAIN_HAND.length, 'meanBase', mean(bySlot.MAIN_HAND).toFixed(2))

    const groups = {}
    for (const s of samples) {
      const key = `${s.itemLevel}||${s.rarity}`
      if (!groups[key]) groups[key] = { itemLevel: s.itemLevel, rarity: s.rarity, bases: [] }
      groups[key].bases.push(s.base)
    }

    const rows = []
    for (const k of Object.keys(groups)) {
      const g = groups[k]
      const m = mean(g.bases)
      const min = g.bases.length ? Math.min(...g.bases) : null
      const max = g.bases.length ? Math.max(...g.bases) : null
      rows.push({ ilvl: g.itemLevel, rarity: g.rarity, count: g.bases.length, mean: m, min, max })
    }
    rows.sort((a,b)=> (b.ilvl||0)-(a.ilvl||0))
    console.log('\nRows (ilvl | rarity | count | meanBase | min | max)')
    for (const r of rows) console.log(`${r.ilvl} | ${r.rarity} | ${r.count} | ${r.mean ? r.mean.toFixed(1) : '-'} | ${r.min ? r.min.toFixed(1) : '-'} | ${r.max ? r.max.toFixed(1) : '-'} `)

    console.log('\nTop 50 samples by base damage:')
    samples.sort((a,b)=>b.base - a.base)
    for (const s of samples.slice(0,50)) console.log(`${s.id} ilvl:${s.itemLevel} rar:${s.rarity} type:${s.type} dps:${s.dps} speed:${s.speed} base:${s.base.toFixed(2)}`)

    console.log('\nBottom 50 samples by base damage:')
    samples.sort((a,b)=>a.base - b.base)
    for (const s of samples.slice(0,50)) console.log(`${s.id} ilvl:${s.itemLevel} rar:${s.rarity} type:${s.type} dps:${s.dps} speed:${s.speed} base:${s.base.toFixed(2)}`)

  } catch (e) {
    console.error('fatal', e)
  }
})()
