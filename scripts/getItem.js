// Script: getItem.js
// Fetch item by id and print abilities and buffs
const endpoint = 'https://production-api.waremu.com/graphql'
const id = '10429'

const query = `query Item($id: ID!) {
  item(id: $id) {
    id
    name
    abilities { id name description }
    buffs { id name description }
  }
}`

async function run() {
  if (typeof fetch === 'undefined') {
    console.error('Global fetch not available in this Node. Abort.')
    process.exit(1)
  }

  const body = JSON.stringify({ query, variables: { id } })
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body,
  })
  const json = await res.json()
  if (json.errors) {
    console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2))
    process.exit(1)
  }
  const item = json.data?.item
  if (!item) {
    console.log('No item returned for id', id)
    process.exit(0)
  }
  console.log('ITEM:', item.id, item.name)
  console.log('\nABILITIES:')
  console.log(JSON.stringify(item.abilities || [], null, 2))
  console.log('\nBUFFS:')
  console.log(JSON.stringify(item.buffs || [], null, 2))
}

run().catch(err => { console.error(err); process.exitCode = 1 })
