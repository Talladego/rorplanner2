// Compute log(dps) model coefficients from labeled test pairs.
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
    if (!it) { console.error('missing', id); return }
    const d = toNumber(it.dps)
    if (!d) { console.error('no dps', id); return }
    const ilvl = toNumber(it.itemLevel) || 0
    const lvlReq = toNumber(it.levelRequirement) || 0
    const rf = rarityFactor(it.rarity)
    const hand = RAPIER_IDS.has(id) ? 0 : (CLAYMORE_IDS.has(id) ? 1 : 0)
    rows.push({ id, d, ilvl, lvlReq, rf, hand })
  }

  // compute hand coef b4 as average ln(dps_1 / dps_0) across pairs
  const pairs = [['419300','419325'], ['419036','419061'], ['418772','418797'], ['3417','3419']]
  const diffs = []
  for (const [id0,id1] of pairs){
    const r0 = rows.find(r=>r.id===id0)
    const r1 = rows.find(r=>r.id===id1)
    if (!r0 || !r1) continue
    diffs.push(Math.log(r1.d / r0.d))
  }
  const b4 = diffs.reduce((a,b)=>a+b,0)/diffs.length
  console.log('Derived hand coef b4 =', b4.toFixed(6))

  // adjust y = ln(dps) - b4*hand
  const y = rows.map(r=> Math.log(r.d) - b4 * r.hand )
  const X = rows.map(r=> [1, r.ilvl, r.lvlReq, r.rf])
  const beta = solveNormalEquations(X, y)
  if (!beta) { console.error('failed to fit remaining coefs'); return }
  console.log('Fitted remaining coefs:')
  console.log(`intercept=${beta[0].toFixed(6)}, ilvl=${beta[1].toFixed(6)}, lvlReq=${beta[2].toFixed(6)}, rarity=${beta[3].toFixed(6)}`)
  // write to tmp
  const fs = require('fs'); fs.writeFileSync('tmp/test-fit-coefs-2.json', JSON.stringify({ intercept: beta[0], ilvl: beta[1], lvlReq: beta[2], rarity: beta[3], hand: b4 }, null, 2))
  console.log('Wrote tmp/test-fit-coefs-2.json')
})().catch(e=>{ console.error('failed', e && e.message || e) })
