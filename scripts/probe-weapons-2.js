const https = require('https')

const MAX = 300
const collected = []

function fetchPage(after) {
  return new Promise((resolve, reject) => {
    const query = `query Items($first: Int, $after: String){items(first:$first, after:$after){nodes{id name slot type itemLevel dps speed rarity} pageInfo{hasNextPage endCursor}}}`
    const body = JSON.stringify({
      query,
      variables: { first: 100, after }
    })
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
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

;(async () => {
  try {
    let after = null
    while (collected.length < MAX) {
      const res = await fetchPage(after)
      const nodes = res?.data?.items?.nodes || []
      const pageInfo = res?.data?.items?.pageInfo || {}
      if (!nodes.length) break
      for (const n of nodes) {
        if (!n) continue
        if (n.slot === 'MAIN_HAND' || n.slot === 'EITHER_HAND') {
          collected.push(n)
          if (collected.length >= MAX) break
        }
      }
      if (!pageInfo.hasNextPage) break
      after = pageInfo.endCursor
    }

    // analyze collected items
    const byIlvl = {}
    for (const it of collected) {
      const ilvl = it.itemLevel ?? 'unknown'
      const rarity = it.rarity ?? 'UNKNOWN'
      const slot = it.slot ?? 'UNKNOWN'
      const dps = (typeof it.dps === 'number') ? it.dps : (it.dps ? Number(it.dps) : null)
      if (dps == null) continue
      const key = `${ilvl}||${rarity}`
      if (!byIlvl[key]) byIlvl[key] = { ilvl, rarity, main: [], either: [] }
      if (slot === 'MAIN_HAND') byIlvl[key].main.push(dps)
      else if (slot === 'EITHER_HAND') byIlvl[key].either.push(dps)
    }

    // compute stats
    const rows = []
    for (const k of Object.keys(byIlvl).sort((a,b)=>{const [ai]=a.split('||');const [bi]=b.split('||');return Number(bi)-Number(ai)})) {
      const g = byIlvl[k]
      const mean = arr => arr.length ? (arr.reduce((s,v)=>s+v,0)/arr.length) : null
      const mMain = mean(g.main)
      const mEither = mean(g.either)
      rows.push({ ilvl: g.ilvl, rarity: g.rarity, countMain: g.main.length, meanMain: mMain, countEither: g.either.length, meanEither: mEither, ratio: (mMain && mEither) ? (mMain / mEither) : null })
    }

    console.log('Collected', collected.length, 'items')
    console.log('Sample rows (ilvl | rarity | #main | meanMain | #either | meanEither | ratioMain/Either)')
    for (const r of rows.slice(0, 50)) {
      console.log(`${r.ilvl} | ${r.rarity} | ${r.countMain} | ${r.meanMain ? r.meanMain.toFixed(1) : '-'} | ${r.countEither} | ${r.meanEither ? r.meanEither.toFixed(1) : '-'} | ${r.ratio ? r.ratio.toFixed(2) : '-'} `)
    }

    // overall means
    const allMain = collected.filter(i=>i.slot==='MAIN_HAND' && typeof i.dps==='number').map(i=>i.dps)
    const allEither = collected.filter(i=>i.slot==='EITHER_HAND' && typeof i.dps==='number').map(i=>i.dps)
    const mean = arr => arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : null
    const meanMain = mean(allMain)
    const meanEither = mean(allEither)
    console.log('\nOverall mean DPS:')
    console.log('MAIN_HAND count', allMain.length, 'mean', meanMain ? meanMain.toFixed(1) : '-')
    console.log('EITHER_HAND count', allEither.length, 'mean', meanEither ? meanEither.toFixed(1) : '-')

  } catch (e) {
    console.error('Probe failed', e)
  }
})()
