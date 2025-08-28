/*
  Regress baseDamage and log(baseDamage) against predictors:
    - itemLevel (ilvl)
    - levelRequirement (lvlReq)
    - rarityFactor (COMMON=0..MYTHIC=4)
    - handFlag (1 for lower-cluster, 2 for higher-cluster) derived from src/lib/baseDamageModel.json

  Usage: node scripts/regress-dps-model.js
*/
const fs = require('fs')
const path = require('path')
const endpoint = 'https://production-api.waremu.com/graphql/'
const FIRST = 50
const MAX_ITEMS = Number(process.env.MAX_ITEMS || 5000)

function toNumber(v){ const n = Number(v); return Number.isFinite(n) ? n : null }
function baseDamage(it){ const d = toNumber(it.dps); const s = toNumber(it.speed); if (d==null||s==null||s<=0) return null; return d*(s/1000) }

const modelPath = path.resolve(__dirname, '..', 'src', 'lib', 'baseDamageModel.json')
let model = null
try { model = JSON.parse(fs.readFileSync(modelPath, 'utf8')) } catch (e) { console.error('Failed to load baseDamageModel.json', e && e.message); process.exit(1) }
const groups = model && model.groups ? model.groups : {}

async function fetchPage(after) {
  const query = `query Items($where: ItemFilterInput, $first: Int, $after: String){ items(where: $where, first: $first, after: $after){ nodes{ id name slot type itemLevel levelRequirement dps speed rarity } pageInfo{ hasNextPage endCursor } } }`
  const where = { slot: { in: ['MAIN_HAND','EITHER_HAND'] } }
  const body = JSON.stringify({ query, variables: { where, first: FIRST, after } })
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  const text = await res.text()
  let j
  try { j = JSON.parse(text) } catch (e) { j = null }
  if (!res.ok) {
    console.error('HTTP error', res.status, res.statusText)
    console.error('body:', text)
    throw new Error('HTTP')
  }
  if (j && j.errors && j.errors.length) console.error('GraphQL errors:', JSON.stringify(j.errors, null, 2))
  return j && j.data ? j.data.items : null
}

function rarityFactor(r){
  if (!r) return 0
  const map = { 'COMMON':0, 'UNCOMMON':1, 'RARE':2, 'VERY_RARE':3, 'MYTHIC':4, 'UTILITY':0 }
  return map[String(r)] ?? 0
}

function midpointFor(it){ const key = `${it.itemLevel}||${it.rarity}`; const g = groups[key]; if (!g || g.one==null || g.two==null) return null; return (g.one + g.two)/2 }

function solveNormalEquations(X, y){
  // X is n x p (array of rows), y length n
  const n = X.length; if (!n) return null
  const p = X[0].length
  // build (X^T X) and X^T y
  const XT_X = Array.from({length:p}, ()=>Array(p).fill(0))
  const XT_y = Array(p).fill(0)
  for (let i=0;i<n;i++){
    const xi = X[i]
    for (let a=0;a<p;a++){
      XT_y[a] += xi[a] * y[i]
      for (let b=0;b<p;b++) XT_X[a][b] += xi[a]*xi[b]
    }
  }
  // solve XT_X * beta = XT_y via gaussian elimination
  const A = XT_X.map(r=>r.slice())
  const B = XT_y.slice()
  // gaussian
  for (let i=0;i<p;i++){
    let piv = i
    for (let j=i;j<p;j++) if (Math.abs(A[j][i]) > Math.abs(A[piv][i])) piv = j
    if (Math.abs(A[piv][i]) < 1e-12) return null
    if (piv !== i){ const tmp=A[i]; A[i]=A[piv]; A[piv]=tmp; const tb=B[i]; B[i]=B[piv]; B[piv]=tb }
    const div = A[i][i]
    for (let c=i;c<p;c++) A[i][c] /= div
    B[i] /= div
    for (let r=0;r<p;r++){ if (r===i) continue; const fac = A[r][i]; for (let c=i;c<p;c++) A[r][c] -= fac*A[i][c]; B[r] -= fac*B[i] }
  }
  return B
}

(async ()=>{
  console.log('Starting DPS regression probe...')
  let after = null, total=0, pages=0
  const all = []
  while (total < MAX_ITEMS){
    const conn = await fetchPage(after)
    if (!conn) break
    const nodes = conn.nodes || []
    for (const n of nodes){ all.push(n); total++; if (total>=MAX_ITEMS) break }
    pages++
    console.log(`Page ${pages}: fetched ${nodes.length} nodes (cumulative ${all.length})`)
    const pi = conn.pageInfo || {}
    if (!pi.hasNextPage) break
    after = pi.endCursor
  }
  console.log(`Fetched ${all.length} items total (cap ${MAX_ITEMS})`)

  const rows = []
  for (const it of all){
    const base = baseDamage(it)
    if (base==null) continue
    const ilvl = toNumber(it.itemLevel) ?? null
    const lvlReq = toNumber(it.levelRequirement) ?? null
    const rf = rarityFactor(it.rarity)
    const mid = midpointFor(it)
    // only keep rows where we can assign hand flag via midpoint
    if (mid==null) continue
    const hand = base > mid ? 2 : 1
    rows.push({ base, ilvl, lvlReq, rf, hand, id: it.id })
  }
  console.log(`Rows usable for regression (have base and group midpoint): ${rows.length}`)
  if (!rows.length) return

  // prepare matrices: include intercept
  const y = rows.map(r=>r.base)
  const X = rows.map(r=>[1, r.ilvl || 0, r.lvlReq || 0, r.rf, r.hand])
  const beta = solveNormalEquations(X, y)
  function rsq(predY){ const n = predY.length; const mean = y.reduce((a,b)=>a+b,0)/n; let ssTot=0, ssRes=0; for (let i=0;i<n;i++){ ssTot += Math.pow(y[i]-mean,2); ssRes += Math.pow(y[i]-predY[i],2) } return ssTot===0?0:1 - (ssRes/ssTot) }
  const pred = rows.map((r,i)=> beta ? beta[0] + beta[1]*r.ilvl + beta[2]*r.lvlReq + beta[3]*r.rf + beta[4]*r.hand : 0)
  const r2 = beta ? rsq(pred) : null
  console.log('\nLinear regression: baseDamage ~ ilvl + lvlReq + rarityFactor + handFlag')
  if (beta) console.log(`R^2 = ${r2.toFixed(4)}; coefficients: intercept=${beta[0].toFixed(4)}, ilvl=${beta[1].toFixed(4)}, lvlReq=${beta[2].toFixed(4)}, rarity=${beta[3].toFixed(4)}, hand=${beta[4].toFixed(4)}`)
  else console.log('Regression failed (singular matrix)')

  // log-transformed regression
  const ylog = rows.map(r=>Math.log(r.base))
  const Xlog = rows.map(r=>[1, r.ilvl || 0, r.lvlReq || 0, r.rf, r.hand])
  const betaLog = solveNormalEquations(Xlog, ylog)
  const predLog = betaLog ? rows.map(r=> betaLog[0] + betaLog[1]*r.ilvl + betaLog[2]*r.lvlReq + betaLog[3]*r.rf + betaLog[4]*r.hand ) : null
  const predLogExp = predLog ? predLog.map(v=>Math.exp(v)) : null
  const r2Log = predLogExp ? rsq(predLogExp) : null
  console.log('\nLog-linear regression: log(baseDamage) ~ ilvl + lvlReq + rarityFactor + handFlag (multiplicative model)')
  if (betaLog) console.log(`R^2 (on original scale using exp(pred)) = ${r2Log.toFixed(4)}; log-coefs: intercept=${betaLog[0].toFixed(4)}, ilvl=${betaLog[1].toFixed(6)}, lvlReq=${betaLog[2].toFixed(6)}, rarity=${betaLog[3].toFixed(6)}, hand=${betaLog[4].toFixed(6)}`)
  else console.log('Log regression failed (singular matrix)')

  // quick diagnostics: mean absolute error relative
  function mae(a,b){ const n=a.length; let s=0; for (let i=0;i<n;i++) s += Math.abs(a[i]-b[i]); return s/n }
  if (pred){ console.log(`MAE (linear) = ${mae(y,pred).toFixed(4)} (mean base ${ (y.reduce((a,b)=>a+b,0)/y.length).toFixed(4) })`) }
  if (predLogExp){ console.log(`MAE (log-model exp) = ${mae(y,predLogExp).toFixed(4)}`) }

  // top residuals
  if (pred){
    const diffs = rows.map((r,i)=>({ id: r.id, actual: r.base, pred: pred[i], err: r.base - pred[i] }))
    diffs.sort((a,b)=>Math.abs(b.err)-Math.abs(a.err))
    console.log('\nTop 10 absolute residuals (linear model):')
    for (let i=0;i<Math.min(10,diffs.length);i++){ const d=diffs[i]; console.log(`${i+1}. id=${d.id} actual=${d.actual.toFixed(2)} pred=${d.pred.toFixed(2)} err=${d.err.toFixed(2)}`) }
  }

  console.log('\nDone')

})().catch(e=>{ console.error('Probe failed:', e && e.message || e) })
