const https = require('https')

const body = JSON.stringify({ query: '{ __type(name: "ItemFilterInput") { inputFields { name type { kind name ofType { kind name } } } } }' })

const opts = {
  hostname: 'production-api.waremu.com',
  path: '/graphql',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
}

const req = https.request(opts, (res) => {
  let data = ''
  res.setEncoding('utf8')
  res.on('data', (chunk) => { data += chunk })
  res.on('end', () => {
    process.stdout.write(data)
  })
})

req.on('error', (e) => { /* request error - suppressed to avoid console noise */ })
req.write(body)
req.end()
