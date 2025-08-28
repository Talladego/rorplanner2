const https = require('https')

const RANGES = [ [0,10],[11,20],[21,30],[31,40],[41,50],[51,60],[61,70] ]

function fetchRange(low, high) {
  return new Promise((resolve, reject) => {
    const query = `query Items($where: ItemFilterInput, $first: Int){ items(where: $where, first: $first) { nodes { id name slot type itemLevel dps speed rarity } pageInfo { hasNextPage endCursor } } }`;
    const where = { slot: { eq: 'MAIN_HAND' }, itemLevel: { gte: low, lte: high } }
    const body = JSON.stringify({ query, variables: { where, first: 10, usableByCareer: 'CHOPPA' } })
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
  for (const [low, high] of RANGES) {
    try {
      console.log('=== range', low, '-', high, '===')
      const res = await fetchRange(low, high)
      const nodes = res?.data?.items?.nodes || []
      if (!nodes.length) {
        console.log('no items found for this range (server returned 0 nodes)')
        continue
      }
      nodes.forEach((n, idx) => {
        const dps = (typeof n.dps === 'number') ? n.dps : (n.dps ? Number(n.dps) : null)
        const speed = (typeof n.speed === 'number') ? n.speed : (n.speed ? Number(n.speed) : null)
        const base = (dps != null && speed != null) ? (dps * (speed / 1000)) : null
        console.log(`#${idx+1} id:${n.id} name:"${n.name}" slot:${n.slot} type:${n.type} ilvl:${n.itemLevel} rar:${n.rarity} dps:${dps} speed:${speed} base:${base != null ? base.toFixed(2) : '-'} `)
      })
    } catch (e) {
      console.error('error fetching range', low, high, e && e.message ? e.message : e)
    }
  }
})()
