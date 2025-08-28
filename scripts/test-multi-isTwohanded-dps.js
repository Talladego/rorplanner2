// Test multiple items using DPS-only deterministic classifier
const endpoint = 'https://production-api.waremu.com/graphql/'
const ids = ['419300','419325','419061','419036','418797','418772','3417','3419']

function toNumber(v){ const n = Number(v); return Number.isFinite(n) ? n : null }
function rarityFactor(r){ const map = { COMMON:0, UNCOMMON:1, RARE:2, VERY_RARE:3, MYTHIC:4, UTILITY:0 }; return map[String(r)] ?? 0 }
// Coeffs from log(dps) regression
const COEFFS = { interceptLog: 4.4044, ilvl: -0.015234, lvlReq: 0.063076, rarity: 0.101095, hand: 0.357588 }

function predictDps({ itemLevel, levelRequirement, rarity, handBinary }){
  const ilvl = toNumber(itemLevel) || 0
  const lvl = toNumber(levelRequirement) || 0
  const rf = rarityFactor(rarity)
  const h = handBinary?1:0
  const logp = COEFFS.interceptLog + COEFFS.ilvl*ilvl + COEFFS.lvlReq*lvl + COEFFS.rarity*rf + COEFFS.hand*h
  return Math.exp(logp)
}

function classifyDps(observedDps, it){
  const p1 = predictDps({ itemLevel: it.itemLevel, levelRequirement: it.levelRequirement, rarity: it.rarity, handBinary: 0 })
  const p2 = predictDps({ itemLevel: it.itemLevel, levelRequirement: it.levelRequirement, rarity: it.rarity, handBinary: 1 })
  const e1 = Math.abs(Math.log(observedDps) - Math.log(p1))
  const e2 = Math.abs(Math.log(observedDps) - Math.log(p2))
  const logDiff = e1 - e2
  const margin = 0.336 // ln(1.4)
  let isTwo=false, conf='low'
  if (logDiff>margin){ isTwo=true; conf='high' }
  else if (logDiff<-margin){ isTwo=false; conf='high' }
  else { isTwo = logDiff>0; conf='low' }
  return { isTwo, conf, observedDps, p1, p2, logDiff }
}

async function fetchItem(id){
  const q = `query Item($id: ID!){ item(id: $id){ id name itemLevel levelRequirement dps speed rarity slot type } }`
  const body = JSON.stringify({ query: q, variables: { id } })
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  const j = await res.json()
  if (j.errors) throw new Error(JSON.stringify(j.errors))
  return j.data && j.data.item ? j.data.item : null
}

(async ()=>{
  try {
    for (const id of ids){
      const it = await fetchItem(id)
      if (!it) { console.log('No item', id); continue }
      const d = toNumber(it.dps)
      const s = toNumber(it.speed)
      const base = (d==null||s==null)? null : d*(s/1000)
      const res = d==null? { isTwo:false, conf:'unknown' } : classifyDps(d, it)
      console.log(`\nItem ${id}: ${it.name} (slot=${it.slot}, type=${it.type}, ilvl=${it.itemLevel}, lvlReq=${it.levelRequirement}, rarity=${it.rarity})`)
      console.log(` observed dps=${d}, speed=${s}, base=${base}`)
      console.log(` predicted 1H dps=${res.p1.toFixed(2)}, predicted 2H dps=${res.p2.toFixed(2)}`)
      console.log(` result: isTwo=${res.isTwo}, confidence=${res.conf}, logDiff=${res.logDiff.toFixed(3)}`)
    }
  } catch (e){ console.error('Error', e && e.message ? e.message : e) }
})()
