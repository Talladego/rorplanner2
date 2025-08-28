const https = require('https')

const target = 200
const maxAttempts = 2000
const samples = []

function fetchItem(id) {
  return new Promise((resolve, reject) => {
    const query = `query Item($id: ID!){item(id:$id){id name slot type itemLevel dps speed rarity}}`
    const body = JSON.stringify({ query, variables: { id: String(id) } })
    const opts = { hostname: 'production-api.waremu.com', path: '/graphql', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }
    const req = https.request(opts, (res) => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', (e) => resolve({ error: String(e) }))
    req.write(body)
    req.end()
  })
}

;(async () => {
  try {
    let attempts = 0
    // try multiple ranges to capture varied id spaces
    const ranges = [ [1000, 6000], [10000, 12000], [20000, 20500], [400000, 402000] ]
    for (const [start, end] of ranges) {
      for (let id = start; id <= end; id++) {
        if (samples.length >= target) break
        if (attempts++ >= maxAttempts) break
        try {
          const res = await fetchItem(String(id))
          const item = res?.data?.item
          if (!item) continue
          if (item.slot === 'MAIN_HAND' || item.slot === 'EITHER_HAND') {
            // require numeric dps and speed
            const dps = (typeof item.dps === 'number') ? item.dps : (item.dps ? Number(item.dps) : null)
            const speed = (typeof item.speed === 'number') ? item.speed : (item.speed ? Number(item.speed) : null)
            if (!Number.isFinite(dps) || !Number.isFinite(speed)) continue
            samples.push({ id: item.id, name: item.name, slot: item.slot, type: item.type, itemLevel: item.itemLevel, rarity: item.rarity, dps, speed })
            if (samples.length % 20 === 0) console.log('collected', samples.length)
          }
        } catch (e) {
          // ignore
        }
      }
      if (samples.length >= target || attempts >= maxAttempts) break
    }

    console.log('Finished: attempts', attempts, 'samples', samples.length)
    // compute base damage = dps * speed/1000
    const calc = s => ({ ...s, base: s.dps * (s.speed / 1000) })
    const withBase = samples.map(calc)
    // overall stats
    const bySlot = { MAIN_HAND: [], EITHER_HAND: [] }
    for (const s of withBase) {
      if (s.slot === 'MAIN_HAND') bySlot.MAIN_HAND.push(s.base)
      else if (s.slot === 'EITHER_HAND') bySlot.EITHER_HAND.push(s.base)
    }
    const mean = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null
    console.log('MAIN_HAND count', bySlot.MAIN_HAND.length, 'meanBase', mean(bySlot.MAIN_HAND) ? mean(bySlot.MAIN_HAND).toFixed(2) : '-')
    console.log('EITHER_HAND count', bySlot.EITHER_HAND.length, 'meanBase', mean(bySlot.EITHER_HAND) ? mean(bySlot.EITHER_HAND).toFixed(2) : '-')

    // show ratios per ilvl+rarity sample counts
    const groups = {}
    for (const s of withBase) {
      const key = `${s.itemLevel}||${s.rarity}`
      if (!groups[key]) groups[key] = { itemLevel: s.itemLevel, rarity: s.rarity, main: [], either: [] }
      if (s.slot === 'MAIN_HAND') groups[key].main.push(s.base)
      else if (s.slot === 'EITHER_HAND') groups[key].either.push(s.base)
    }
    const rows = []
    for (const k of Object.keys(groups)) {
      const g = groups[k]
      const mMain = mean(g.main)
      const mEither = mean(g.either)
      const ratio = (mMain && mEither) ? (mMain / mEither) : null
      rows.push({ ilvl: g.itemLevel, rarity: g.rarity, countMain: g.main.length, meanMain: mMain, countEither: g.either.length, meanEither: mEither, ratio })
    }
    rows.sort((a,b)=> (b.ilvl||0)-(a.ilvl||0))
    console.log('Sample rows (ilvl | rarity | #main | meanMain | #either | meanEither | ratioMain/Either)')
    for (const r of rows.slice(0,50)) {
      console.log(`${r.ilvl} | ${r.rarity} | ${r.countMain} | ${r.meanMain ? r.meanMain.toFixed(1) : '-'} | ${r.countEither} | ${r.meanEither ? r.meanEither.toFixed(1) : '-'} | ${r.ratio ? r.ratio.toFixed(2) : '-'} `)
    }

    // dump samples summary
    console.log('\nFirst 30 samples:')
    for (const s of withBase.slice(0,30)) console.log(`${s.id} ${s.slot} ilvl:${s.itemLevel} rar:${s.rarity} dps:${s.dps} speed:${s.speed} base:${s.base.toFixed(2)}`)

  } catch (e) {
    console.error('fatal', e)
  }
})()
