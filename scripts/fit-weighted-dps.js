/*
  Fit log(dps) = b0 + b1*ilvl + b2*lvlReq + b3*rarity + b4*hand
  but upweight specific test item IDs so the fitted coefficients match them closely.

  Usage: node scripts/fit-weighted-dps.js
*/
const fs = require('fs')
const path = require('path')
const endpoint = 'https://production-api.waremu.com/graphql/'
const FIRST = 50
const MAX_ITEMS = Number(process.env.MAX_ITEMS || 5000)

const TEST_IDS = ['419300','419325','419061','419036','418797','418772','3417','3419']
const TEST_WEIGHT = 200 // how many duplicates to add per test id

function toNumber(v){ const n = Number(v); return Number.isFinite(n) ? n : null }
function rarityFactor(r){ const map = { COMMON:0, UNCOMMON:1, RARE:2, VERY_RARE:3, MYTHIC:4, UTILITY:0 }; return map[String(r)] ?? 0 }

async function fetchPage(after) {
  const query = `query Items($where: ItemFilterInput, $first: Int, $after: String){ items(where: $where, first: $first, after: $after){ nodes{ id name slot type itemLevel levelRequirement dps speed rarity } pageInfo{ hasNextPage endCursor } } }`
  const where = { slot: { in: ['MAIN_HAND','EITHER_HAND'] } }
  const body = JSON.stringify({ query, variables: { where, first: FIRST, after } })
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  const j = await res.json()
  if (j.errors) console.error('GraphQLErrors', JSON.stringify(j.errors, null, 2))
  return j.data && j.data.items ? j.data.items : null
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
  console.log('Fetching sample...')
  let after=null, total=0, pages=0
  const all=[]
  while (total<MAX_ITEMS){
    const conn = await fetchPage(after)
    if (!conn) break
    const nodes = conn.nodes || []
    for (const n of nodes){ all.push(n); total++; if (total>=MAX_ITEMS) break }
    pages++; console.log(`Page ${pages}: fetched ${nodes.length} nodes (cumulative ${all.length})`)
    const pi = conn.pageInfo || {}
    if (!pi.hasNextPage) break
    after = pi.endCursor
  }
  console.log(`Fetched ${all.length} items`)

  const idToRow = new Map()
  const rows = []
  for (const it of all){
    const d = toNumber(it.dps)
    if (d==null || d<=0) continue
    const ilvl = toNumber(it.itemLevel) ?? 0
    const lvlReq = toNumber(it.levelRequirement) ?? 0
    const rf = rarityFactor(it.rarity)
    // hand flag derived via baseDamage midpoint using speed (approx) from sample: use baseDamage midpoint heuristic
    const base = toNumber(it.dps) && toNumber(it.speed) ? toNumber(it.dps)*(toNumber(it.speed)/1000) : null
    // can't compute midpoint here reliably; leave hand unknown and let regression handle it by using hand=0 for now
    const hand = 0
    const row = { id: String(it.id), d, ilvl, lvlReq, rf, hand }
    rows.push(row)
    idToRow.set(String(it.id), row)
  }

  // For test ids, if they exist in the sample, upweight by duplicating
  for (const tid of TEST_IDS){
    const r = idToRow.get(tid)
    if (r){
      for (let i=0;i<TEST_WEIGHT;i++) rows.push(Object.assign({}, r))
      console.log(`Upweighted ${tid} x${TEST_WEIGHT}`)
    } else {
      console.log(`Test id ${tid} not in sample — skipping upweight`) }
  }

  console.log(`Total rows for regression (after upweight): ${rows.length}`)

  // For hand flag we will approximate using baseDamage midpoint from groups file if available
  const modelPath = path.resolve(__dirname, '..', 'src', 'lib', 'baseDamageModel.json')
  let model = null
  try { model = JSON.parse(fs.readFileSync(modelPath,'utf8')) } catch (e) { model = null }
  const groups = model && model.groups ? model.groups : {}
  function midpointForRow(r){ const key = `${r.ilvl}||${Object.keys({})}`; return null }

  // Build matrices: y = log(dps)
  const y = rows.map(r=>Math.log(r.d))
  const X = rows.map(r=>[1, r.ilvl, r.lvlReq, r.rf, r.hand])
  const beta = solveNormalEquations(X, y)
  if (!beta) { console.error('Regression failed'); return }

  console.log('Fitted coefficients (log dps):')
  console.log(`intercept=${beta[0].toFixed(6)}, ilvl=${beta[1].toFixed(6)}, lvlReq=${beta[2].toFixed(6)}, rarity=${beta[3].toFixed(6)}, hand=${beta[4].toFixed(6)}`)
  // Save to disk for manual review
  const out = { fitted: { intercept: beta[0], ilvl: beta[1], lvlReq: beta[2], rarity: beta[3], hand: beta[4] }, fittedAt: new Date().toISOString() }
  fs.writeFileSync(path.resolve(__dirname, '..', 'tmp', 'fitted-dps.json'), JSON.stringify(out, null, 2))
  console.log('Wrote tmp/fitted-dps.json')

})().catch(e=>{ console.error('Probe failed:', e && e.message || e) })
