const https = require('https')

const ENDPOINT = 'https://production-api.waremu.com/graphql'

const query = `query Items($where: ItemFilterInput, $first: Int){ items(where: $where, first: $first){ totalCount nodes{ id name slot type itemLevel levelRequirement rarity talismanSlots stats { stat value percentage } } } }`

function run(){
  const variables = { where: { type: { eq: 'ENHANCEMENT' } }, first: 50 }
  const payload = JSON.stringify({ query, variables })
  const url = new URL(ENDPOINT)
  const opts = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  }
  const req = https.request(opts, (res) => {
    let data = ''
    res.on('data', (chunk) => data += chunk)
    res.on('end', () => {
      try {
        const j = JSON.parse(data)
        console.log(JSON.stringify(j.data, null, 2))
      } catch (e) {
        console.error('Failed to parse response', e, data)
        process.exit(1)
      }
    })
  })
  req.on('error', (e) => { console.error(e); process.exit(1) })
  req.write(payload)
  req.end()
}

run()
