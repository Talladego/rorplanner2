// Fetch two items and test deterministic isTwohanded logic (inline coefficients)
const endpoint = 'https://production-api.waremu.com/graphql/'
const ids = ['419300','419325']

function toNumber(v){ const n = Number(v); return Number.isFinite(n) ? n : null }
function rarityFactor(r){ const map = { COMMON:0, UNCOMMON:1, RARE:2, VERY_RARE:3, MYTHIC:4, UTILITY:0 }; return map[String(r)] ?? 0 }
const COEFFS = { interceptLog: 2.3822, ilvl: -0.017174, lvlReq: 0.066553, rarity: 0.088459, hand: 0.663120 }
function predictBase({ itemLevel, levelRequirement, rarity, handBinary }){
  const ilvl = toNumber(itemLevel) || 0
  const lvl = toNumber(levelRequirement) || 0
  const rf = rarityFactor(rarity)
  const h = handBinary?1:0
  const logp = COEFFS.interceptLog + COEFFS.ilvl*ilvl + COEFFS.lvlReq*lvl + COEFFS.rarity*rf + COEFFS.hand*h
  return Math.exp(logp)
}
function classify(base, it){
  const p1 = predictBase({ itemLevel: it.itemLevel, levelRequirement: it.levelRequirement, rarity: it.rarity, handBinary: 0 })
  const p2 = predictBase({ itemLevel: it.itemLevel, levelRequirement: it.levelRequirement, rarity: it.rarity, handBinary: 1 })
  const e1 = Math.abs(Math.log(base) - Math.log(p1))
  const e2 = Math.abs(Math.log(base) - Math.log(p2))
  const logDiff = e1 - e2
  const margin = 0.223
  let isTwo=false, conf='low'
  if (logDiff>margin){ isTwo=true; conf='high' }
  else if (logDiff<-margin){ isTwo=false; conf='high' }
  else { isTwo = logDiff>0; conf='low' }
  return { isTwo, conf, base, p1, p2, logDiff }
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
      const d = toNumber(it.dps), s = toNumber(it.speed)
      const base = (d==null||s==null||s<=0)?null: d*(s/1000)
      const cls = base==null? { isTwo:false, conf:'unknown' } : classify(base, it)
      console.log(`\nItem ${id}: name="${it.name}", slot=${it.slot}, type=${it.type}, ilvl=${it.itemLevel}, lvlReq=${it.levelRequirement}, rarity=${it.rarity}`)
      console.log(' dps=',it.dps,' speed=',it.speed,' base=', base)
      console.log(' Prediction:', cls)
    }
  } catch (e){ console.error('Error', e && e.message ? e.message : e) }
})()
