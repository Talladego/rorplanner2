// Script: getItem2.js
// Fetch item by id 2 and print full details
const endpoint = 'https://production-api.waremu.com/graphql'
const id = '2'

const query = `query Item($id: ID!) {
  item(id: $id) {
    id
    name
    description
  iconUrl
    itemLevel
    itemSet { id name }
    rarity
    slot
    stats { stat value }
    talismanSlots
    uniqueEquipped
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
  console.log(JSON.stringify(item, null, 2))
}

run().catch(err => { console.error(err); process.exitCode = 1 })
