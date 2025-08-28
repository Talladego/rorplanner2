// Script: checkStats.js
// Query the GraphQL items endpoint for each stat and report totalCount.
// Usage: node scripts/checkStats.js

const endpoint = 'https://production-api.waremu.com/graphql'
const stats = [
  'STRENGTH','AGILITY','WILLPOWER','TOUGHNESS','WOUNDS','INITIATIVE','WEAPON_SKILL','BALLISTIC_SKILL','INTELLIGENCE','SPIRIT_RESISTANCE','ELEMENTAL_RESISTANCE','CORPOREAL_RESISTANCE','INCOMING_DAMAGE','INCOMING_DAMAGE_PERCENT','OUTGOING_DAMAGE','OUTGOING_DAMAGE_PERCENT','ARMOR','VELOCITY','BLOCK','PARRY','EVADE','DISRUPT','ACTION_POINT_REGEN','MORALE_REGEN','COOLDOWN','BUILD_TIME','CRITICAL_DAMAGE','RANGE','AUTO_ATTACK_SPEED','RADIUS','AUTO_ATTACK_DAMAGE','ACTION_POINT_COST','CRITICAL_HIT_RATE','CRITICAL_DAMAGE_TAKEN_REDUCTION','EFFECT_RESIST','EFFECT_BUFF','MINIMUM_RANGE','DAMAGE_ABSORB','SETBACK_CHANCE','SETBACK_VALUE','XP_WORTH','RENOWN_WORTH','INFLUENCE_WORTH','MONETARY_WORTH','AGGRO_RADIUS','TARGET_DURATION','SPECIALIZATION','GOLD_LOOTED','XP_RECEIVED','BUTCHERING','SCAVENGING','CULTIVATION','APOTHECARY','TALISMAN_MAKING','SALVAGING','STEALTH','STEALTH_DETECTION','HATE_CAUSED','HATE_RECEIVED','OFFHAND_PROC_CHANCE','OFFHAND_DAMAGE','RENOWN_RECEIVED','INFLUENCE_RECEIVED','DISMOUNT_CHANCE','GRAVITY','LEVITATION_HEIGHT','MELEE_CRIT_RATE','RANGED_CRIT_RATE','MAGIC_CRIT_RATE','HEALTH_REGEN','MELEE_POWER','RANGED_POWER','MAGIC_POWER','ARMOR_PENETRATION_REDUCTION','CRITICAL_HIT_RATE_REDUCTION','BLOCK_STRIKETHROUGH','PARRY_STRIKETHROUGH','EVADE_STRIKETHROUGH','DISRUPT_STRIKETHROUGH','HEAL_CRIT_RATE','MAX_ACTION_POINTS','MASTERY_1_BONUS','MASTERY_2_BONUS','MASTERY_3_BONUS','HEALING_POWER','INTERACT_TIME','FORTITUDE','OUTGOING_HEAL_PERCENT','INCOMING_HEAL_PERCENT','ARMOR_PENETRATION','LOOT_CHANCE'
]

const query = `query Items($hasStats: [Stat!]) { items(hasStats: $hasStats, first: 1) { totalCount } }`

async function run() {
  if (typeof fetch === 'undefined') {
    console.error('Global fetch not available in this Node. Abort.')
    process.exit(1)
  }

  const results = []
  for (const stat of stats) {
    const body = JSON.stringify({ query, variables: { hasStats: [stat] } })
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
      })
      const json = await res.json()
      if (json.errors) {
        console.error(`ERROR for ${stat}:`, JSON.stringify(json.errors))
        results.push({ stat, count: null, error: json.errors })
      } else {
        const count = json.data?.items?.totalCount ?? null
        console.log(`${stat},${count}`)
        results.push({ stat, count })
      }
    } catch (err) {
      console.error(`FETCH ERROR for ${stat}:`, err)
      results.push({ stat, count: null, error: String(err) })
    }
    // small delay to be polite
    await new Promise(r => setTimeout(r, 120))
  }

  const zeros = results.filter(r => r.count === 0).map(r => r.stat)
  console.log('\nSTATS_WITH_ZERO_ITEMS:')
  console.log(zeros.join(',') || '(none)')
}

run()
.catch(err => { console.error(err); process.exitCode = 1 })
