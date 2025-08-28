/*
  Fit log(dps) ~ itemLevel + levelRequirement + rarity + handFlag
  Usage: node scripts/regress-on-dps.js
*/
const fs = require('fs')
const path = require('path')
const endpoint = 'https://production-api.waremu.com/graphql/'
const FIRST = 50
const MAX_ITEMS = Number(process.env.MAX_ITEMS || 5000)

function toNumber(v){ const n = Number(v); return Number.isFinite(n) ? n : null }
const modelPath = path.resolve(__dirname, '..', 'src', 'lib', 'baseDamageModel.json')
let model = null
try { model = JSON.parse(fs.readFileSync(modelPath, 'utf8')) } catch (e) { console.error('Failed to load baseDamageModel.json', e && e.message); process.exit(1) }
const groups = model.groups || {}

function rarityFactor(r){ const map = { COMMON:0, UNCOMMON:1, RARE:2, VERY_RARE:3, MYTHIC:4, UTILITY:0 }; return map[String(r)] ?? 0 }
function midpointFor(it){ const key = `${it.itemLevel}||${it.rarity}`; const g = groups[key]; if (!g || g.one==null || g.two==null) return null; return (g.one + g.two)/2 }

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
  console.log('Starting DPS-only regression probe...')
  let after = null, total=0, pages=0
  const all = []
  while (total < MAX_ITEMS){
    const conn = await fetchPage(after)
    if (!conn) break
    const nodes = conn.nodes || []
    for (const n of nodes){ all.push(n); total++; if (total>=MAX_ITEMS) break }
    pages++; console.log(`Page ${pages}: fetched ${nodes.length} nodes (cumulative ${all.length})`)
    const pi = conn.pageInfo || {}
    if (!pi.hasNextPage) break
    after = pi.endCursor
  }
  console.log(`Fetched ${all.length} items total (cap ${MAX_ITEMS})`)

  const rows = []
  for (const it of all){
    const d = toNumber(it.dps)
    if (d==null || d<=0) continue
    const ilvl = toNumber(it.itemLevel) ?? 0
    const lvlReq = toNumber(it.levelRequirement) ?? 0
    const rf = rarityFactor(it.rarity)
    const mid = midpointFor(it)
    if (mid==null) continue
    const hand = (it.dps * (it.speed/1000) > mid) ? 2 : 1
    rows.push({ d, ilvl, lvlReq, rf, hand, id: it.id })
  }
  console.log(`Rows usable for regression: ${rows.length}`)
  if (!rows.length) return

  const ylog = rows.map(r=>Math.log(r.d))
  const X = rows.map(r=>[1, r.ilvl, r.lvlReq, r.rf, (r.hand===2?1:0)])
  const beta = solveNormalEquations(X, ylog)
  function rsqLog(predLog){ const n=predLog.length; const y = ylog; const mean = y.reduce((a,b)=>a+b,0)/n; let ssTot=0, ssRes=0; for (let i=0;i<n;i++){ ssTot+=Math.pow(y[i]-mean,2); ssRes+=Math.pow(y[i]-predLog[i],2) } return ssTot===0?0:1-(ssRes/ssTot) }
  if (!beta) { console.log('Regression failed'); return }
  const predLog = rows.map(r=> beta[0] + beta[1]*r.ilvl + beta[2]*r.lvlReq + beta[3]*r.rf + beta[4]* (r.hand===2?1:0) )
  const r2 = rsqLog(predLog)
  console.log('\nLog-linear DPS regression: log(dps) ~ ilvl + lvlReq + rarity + hand')
  console.log(`R^2 (log-scale) = ${r2.toFixed(4)}`)
  console.log(`log-coefs: intercept=${beta[0].toFixed(4)}, ilvl=${beta[1].toFixed(6)}, lvlReq=${beta[2].toFixed(6)}, rarity=${beta[3].toFixed(6)}, hand=${beta[4].toFixed(6)}`)

  console.log('\nDone')
})().catch(e=>{ console.error('Probe failed:', e && e.message || e) })
