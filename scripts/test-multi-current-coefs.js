// Test multi items using the currently saved coefficients (prefers tmp/coefs-renown.json)
const fs = require('fs')
const endpoint = 'https://production-api.waremu.com/graphql/'
const ids = ['419300','419325','419061','419036','418797','418772','3417','3419']

function toNumber(v){ const n = Number(v); return Number.isFinite(n) ? n : null }
function rarityFactor(r){ const map = { COMMON:0, UNCOMMON:1, RARE:2, VERY_RARE:3, MYTHIC:4, UTILITY:0 }; return map[String(r)] ?? 0 }

function loadCoeffs(){
  const prefer = ['tmp/coefs-renown.json','tmp/coefs-families.json','tmp/coefs-harbinger-remote.json','tmp/coefs-families.json']
  for (const p of prefer){ try{ if (fs.existsSync(p)){ const j = JSON.parse(fs.readFileSync(p,'utf8')); console.log('Loaded coeffs from', p); return j } }catch(e){} }
  console.log('No tmp coefficients found, using built-in defaults')
  return { intercept: 4.40379, ilvl: -0.017625, lvlReq: 0.065508, rarity: 0.102798, renown: 0.002246, hand: 0.357549 }
}

const COEFFS = loadCoeffs()

function predictDps({ itemLevel, levelRequirement, rarity, renown, handBinary }){
  const ilvl = toNumber(itemLevel) || 0
  const lvl = toNumber(levelRequirement) || 0
  const rf = rarityFactor(rarity)
  const ren = toNumber(renown) || 0
  const h = handBinary?1:0
  const logp = COEFFS.intercept + COEFFS.ilvl*ilvl + COEFFS.lvlReq*lvl + COEFFS.rarity*rf + (COEFFS.renown||0)*ren + COEFFS.hand*h
  return Math.exp(logp)
}

function classifyDps(observedDps, it){
  const p1 = predictDps({ itemLevel: it.itemLevel, levelRequirement: it.levelRequirement, rarity: it.rarity, renown: it.renownRankRequirement, handBinary: 0 })
  const p2 = predictDps({ itemLevel: it.itemLevel, levelRequirement: it.levelRequirement, rarity: it.rarity, renown: it.renownRankRequirement, handBinary: 1 })
  const e1 = Math.abs(Math.log(observedDps) - Math.log(p1))
  const e2 = Math.abs(Math.log(observedDps) - Math.log(p2))
  const logDiff = e1 - e2
  const margin = 0.223 // ln(1.25)
  let isTwo=false, conf='low'
  if (logDiff>margin){ isTwo=true; conf='high' }
  else if (logDiff<-margin){ isTwo=false; conf='high' }
  else { isTwo = logDiff>0; conf='low' }
  return { isTwo, conf, observedDps, p1, p2, logDiff }
}

async function fetchItem(id){
  const q = `query Item($id: ID!){ item(id: $id){ id name itemLevel levelRequirement dps speed rarity slot type renownRankRequirement } }`
  const body = JSON.stringify({ query: q, variables: { id } })
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  const j = await res.json()
  if (j.errors) throw new Error(JSON.stringify(j.errors))
  return j.data && j.data.item ? j.data.item : null
}

;(async ()=>{
  try {
    for (const id of ids){
      const it = await fetchItem(id)
      if (!it) { console.log('No item', id); continue }
      const d = toNumber(it.dps)
      const s = toNumber(it.speed)
      const base = (d==null||s==null)? null : d*(s/1000)
      const res = d==null? { isTwo:false, conf:'unknown' } : classifyDps(d, it)
      console.log(`\nItem ${id}: ${it.name} (slot=${it.slot}, type=${it.type}, ilvl=${it.itemLevel}, lvlReq=${it.levelRequirement}, rarity=${it.rarity}, ren=${it.renownRankRequirement})`)
      console.log(` observed dps=${d}, speed=${s}, base=${base}`)
      console.log(` predicted 1H dps=${res.p1.toFixed(2)}, predicted 2H dps=${res.p2.toFixed(2)}`)
      console.log(` result: isTwo=${res.isTwo}, confidence=${res.conf}, logDiff=${res.logDiff.toFixed(3)}`)
    }
  } catch (e){ console.error('Error', e && e.message ? e.message : e) }
})()
