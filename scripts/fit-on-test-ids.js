// Fit log(dps) using only the supplied labeled test items.
// Labels: rapier = 1H (hand=0), claymore = 2H (hand=1)
const endpoint = 'https://production-api.waremu.com/graphql/'
const ids = ['419300','419325','419061','419036','418797','418772','3417','3419']
const RAPIER_IDS = new Set(['419300','419036','418772'])
const CLAYMORE_IDS = new Set(['419325','419061','418797','3419'])

function toNumber(v){ const n = Number(v); return Number.isFinite(n) ? n : null }
function rarityFactor(r){ const map = { COMMON:0, UNCOMMON:1, RARE:2, VERY_RARE:3, MYTHIC:4, UTILITY:0 }; return map[String(r)] ?? 0 }

async function fetchItem(id){
  const q = `query Item($id: ID!){ item(id: $id){ id name itemLevel levelRequirement dps speed rarity slot type } }`
  const body = JSON.stringify({ query: q, variables: { id } })
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  const j = await res.json()
  if (j.errors) throw new Error(JSON.stringify(j.errors))
  return j.data && j.data.item ? j.data.item : null
}

function solveNormalEquations(X, y){
  const n = X.length; if (!n) return null
  const p = X[0].length
  const XT_X = Array.from({length:p}, ()=>Array(p).fill(0))
  const XT_y = Array(p).fill(0)
  for (let i=0;i<n;i++){
    const xi = X[i]
    for (let a=0;a<p;a++){
      XT_y[a] += xi[a] * y[i]
      for (let b=0;b<p;b++) XT_X[a][b] += xi[a]*xi[b]
    }
  }
  const A = XT_X.map(r=>r.slice()); const B = XT_y.slice()
  // gaussian elimination
  for (let i=0;i<p;i++){
    let piv = i
    for (let j=i;j<p;j++) if (Math.abs(A[j][i]) > Math.abs(A[piv][i])) piv = j
    if (Math.abs(A[piv][i]) < 1e-12) return null
    if (piv !== i){ const tmp=A[i]; A[i]=A[piv]; A[piv]=tmp; const tb=B[i]; B[i]=B[piv]; B[piv]=tb }
    const div = A[i][i]; for (let c=i;c<p;c++) A[i][c] /= div; B[i] /= div
    for (let r=0;r<p;r++){ if (r===i) continue; const fac = A[r][i]; for (let c=i;c<p;c++) A[r][c] -= fac*A[i][c]; B[r] -= fac*B[i] }
  }
  return B
}

(async ()=>{
  const rows = []
  for (const id of ids){
    const it = await fetchItem(id)
    if (!it) { console.log('missing', id); continue }
    const d = toNumber(it.dps)
    if (!d) { console.log('no dps', id); continue }
    const ilvl = toNumber(it.itemLevel) || 0
    const lvlReq = toNumber(it.levelRequirement) || 0
    const rf = rarityFactor(it.rarity)
    const hand = RAPIER_IDS.has(id) ? 0 : (CLAYMORE_IDS.has(id) ? 1 : 0)
    rows.push({ id, name: it.name, d, ilvl, lvlReq, rf, hand })
    console.log(`row ${id}: dps=${d}, ilvl=${ilvl}, lvlReq=${lvlReq}, rarity=${it.rarity}, hand=${hand}`)
  }
  if (rows.length < 5) { console.error('not enough rows'); return }
  const y = rows.map(r=>Math.log(r.d))
  const X = rows.map(r=>[1, r.ilvl, r.lvlReq, r.rf, r.hand])
  const beta = solveNormalEquations(X, y)
  if (!beta) { console.error('singular, cannot fit'); return }
  console.log('Fitted (log dps) coefficients:')
  console.log(`intercept=${beta[0].toFixed(6)}, ilvl=${beta[1].toFixed(6)}, lvlReq=${beta[2].toFixed(6)}, rarity=${beta[3].toFixed(6)}, hand=${beta[4].toFixed(6)}`)
  // Write coefficients to tmp for review
  const fs = require('fs'); fs.writeFileSync('tmp/test-fit-coefs.json', JSON.stringify({ intercept: beta[0], ilvl: beta[1], lvlReq: beta[2], rarity: beta[3], hand: beta[4] }, null, 2))
  console.log('Wrote tmp/test-fit-coefs.json')
})().catch(e=>{ console.error('failed', e && e.message || e) })
