const https = require('https')

function fetchType(name) {
  const body = JSON.stringify({ query: `{ __type(name: \"${name}\") { enumValues { name } } }` })
  const opts = { hostname: 'production-api.waremu.com', path: '/graphql', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }
  return new Promise((res, rej) => {
    const req = https.request(opts, (r) => {
      let d = ''
      r.setEncoding('utf8')
      r.on('data', (c) => d += c)
      r.on('end', () => res(JSON.parse(d)))
    })
    req.on('error', rej)
    req.write(body)
    req.end()
  })
}

;(async () => {
  const eq = await fetchType('EquipSlot')
  const st = await fetchType('Stat')
  // write useful enum lists to stdout so callers can pipe/inspect the output
  process.stdout.write(JSON.stringify({ EquipSlot: eq.data.__type.enumValues.map(v=>v.name), Stat: st.data.__type.enumValues.map(v=>v.name) }) + '\n')
})().catch((e) => { /* suppressed error - run interactively to debug */ })
