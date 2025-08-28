const https = require('https')

const query = `query Item($id: ID!) { item(id: $id) { id name description iconUrl rarity slot type armor dps speed talismanSlots itemLevel levelRequirement renownRankRequirement uniqueEquipped stats { stat value percentage } careerRestriction raceRestriction itemSet { id name bonuses { itemsRequired bonus { __typename ... on ItemStat { stat value percentage } ... on Ability { id name description } } } } buffs { id name description } abilities { id name description } rewardedFromQuests { totalCount } rewardedFromChapters { totalCount } soldByVendors { totalCount } usedToPurchase { totalCount } dropsFromCreatures { totalCount } dropsFromGameObjects { totalCount } } }`

const body = JSON.stringify({ query, variables: { id: "436503" } })

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
    try {
      console.log(JSON.stringify(JSON.parse(data), null, 2))
    } catch (e) {
      console.log(data)
    }
  })
})

req.on('error', (e) => { console.error('request error', e) })
req.write(body)
req.end()
