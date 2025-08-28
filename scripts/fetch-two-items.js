const https = require('https')
const ids = ['3412', '3410']

function fetchItem(id) {
  return new Promise((resolve, reject) => {
    const query = `query Item($id: ID!){item(id:$id){id name slot type}}`
    const body = JSON.stringify({ query, variables: { id } })
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
  for (const id of ids) {
    try {
      const json = await fetchItem(id)
      console.log('---', id, '---')
      console.log(JSON.stringify(json, null, 2))
    } catch (e) {
      console.error('error fetching', id, e)
    }
  }
})()
