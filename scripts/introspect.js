const https = require('https')

const body = JSON.stringify({ query: '{ __type(name: "Query") { fields { name args { name type { kind name ofType { kind name } } } type { kind name ofType { kind name } } } } }' })

const opts = {
  hostname: 'production-api.waremu.com',
  path: '/graphql',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Accept': 'application/json',
  },
}

const req = https.request(opts, (res) => {
  let data = ''
  res.setEncoding('utf8')
  res.on('data', (chunk) => { data += chunk })
  res.on('end', () => {
    // Introspection script: intentionally quiet. Write raw data to stdout only when
    // explicitly needed by piping the script output or debugging locally.
    // e.g., node scripts/introspect.js | jq .
    process.stdout.write(data)
  })
})

req.on('error', (e) => { /* request error - suppressed to avoid console noise */ })
req.write(body)
req.end()
