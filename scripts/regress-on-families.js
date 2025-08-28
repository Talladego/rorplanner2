/*
  Fit log(dps) for specific weapon families: Fortress, Darkpromise, Bloodlord, Subjugator
  Model: log(dps) = b0 + b1*ilvl + b2*levelRequirement + b3*rarity + b4*renown + b5*hand
  Usage: node scripts/regress-on-families.js
*/
const fs = require('fs')
const path = require('path')
const endpoint = 'https://production-api.waremu.com/graphql/'
const FIRST = 50
const MAX_ITEMS = Number(process.env.MAX_ITEMS || 5000)

function toNumber(v){ const n = Number(v); return Number.isFinite(n) ? n : null }

const modelPath = path.resolve(__dirname, '..', 'src', 'lib', 'baseDamageModel.json')
let model = null
try { model = JSON.parse(fs.readFileSync(modelPath, 'utf8')) } catch (e) { console.error('failed to load baseDamageModel.json', e && e.message); model = null }
const groups = model && model.groups ? model.groups : {}
function midpointFor(it){ const key = `${it.itemLevel}||${it.rarity}`; const g = groups[key]; if (!g || g.one==null || g.two==null) return null; return (g.one + g.two)/2 }

async function fetchPage(after) {
  const query = `query Items($where: ItemFilterInput, $first: Int, $after: String){ items(where: $where, first: $first, after: $after){ nodes{ id name slot type itemLevel levelRequirement renownRankRequirement dps speed rarity } pageInfo{ hasNextPage endCursor } } }`
  const where = { slot: { in: ['MAIN_HAND','EITHER_HAND'] } }
  const body = JSON.stringify({ query, variables: { where, first: FIRST, after } })
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  const text = await res.text()
  let j
  try { j = JSON.parse(text) } catch (e) { j = null }
  if (!res.ok) { console.error('HTTP', res.status, res.statusText); console.error(text); throw new Error('HTTP') }
  if (j && j.errors && j.errors.length) console.error('GraphQLErrors', JSON.stringify(j.errors, null, 2))
  return j && j.data ? j.data.items : null
}

function solveNormalEquations(X,y){ const n=X.length; if (!n) return null; const p=X[0].length; const XT_X=Array.from({length:p}, ()=>Array(p).fill(0)); const XT_y=Array(p).fill(0); for(let i=0;i<n;i++){ const xi=X[i]; for(let a=0;a<p;a++){ XT_y[a]+=xi[a]*y[i]; for(let b=0;b<p;b++) XT_X[a][b]+=xi[a]*xi[b] } } const A=XT_X.map(r=>r.slice()); const B=XT_y.slice(); for(let i=0;i<p;i++){ let piv=i; for(let j=i;j<p;j++) if (Math.abs(A[j][i])>Math.abs(A[piv][i])) piv=j; if (Math.abs(A[piv][i])<1e-12) return null; if (piv!==i){ const tmp=A[i]; A[i]=A[piv]; A[piv]=tmp; const tb=B[i]; B[i]=B[piv]; B[piv]=tb } const div=A[i][i]; for(let c=i;c<p;c++) A[i][c]/=div; B[i]/=div; for(let r=0;r<p;r++){ if (r===i) continue; const fac=A[r][i]; for(let c=i;c<p;c++) A[r][c]-=fac*A[i][c]; B[r]-=fac*B[i] } } return B }

// Ridge solver: solves (X^T X + lambda I) beta = X^T y
function solveWithRidge(X,y,lambda){ const n=X.length; if (!n) return null; const p=X[0].length; const XT_X=Array.from({length:p}, ()=>Array(p).fill(0)); const XT_y=Array(p).fill(0); for(let i=0;i<n;i++){ const xi=X[i]; for(let a=0;a<p;a++){ XT_y[a]+=xi[a]*y[i]; for(let b=0;b<p;b++) XT_X[a][b]+=xi[a]*xi[b] } } for(let i=0;i<p;i++) XT_X[i][i] += lambda; const A=XT_X.map(r=>r.slice()); const B=XT_y.slice(); // Gaussian elimination
  for(let i=0;i<p;i++){ let piv=i; for(let j=i;j<p;j++) if (Math.abs(A[j][i])>Math.abs(A[piv][i])) piv=j; if (Math.abs(A[piv][i])<1e-18) return null; if (piv!==i){ const tmp=A[i]; A[i]=A[piv]; A[piv]=tmp; const tb=B[i]; B[i]=B[piv]; B[piv]=tb } const div=A[i][i]; for(let c=i;c<p;c++) A[i][c]/=div; B[i]/=div; for(let r=0;r<p;r++){ if (r===i) continue; const fac=A[r][i]; for(let c=i;c<p;c++) A[r][c]-=fac*A[i][c]; B[r]-=fac*B[i] } } return B }

(async ()=>{
  console.log('Starting family-specific DPS regression (Fortress|Darkpromise|Bloodlord|Subjugator)...')
  const families = ['fortress','darkpromise','bloodlord','subjugator']
  let after=null,total=0,pages=0
  const all=[]
  while(total<MAX_ITEMS){ const conn=await fetchPage(after); if (!conn) break; const nodes=conn.nodes||[]; for(const n of nodes){ all.push(n); total++; if (total>=MAX_ITEMS) break } pages++; console.log(`Page ${pages}: fetched ${nodes.length} nodes (cumulative ${all.length})`); const pi=conn.pageInfo||{}; if (!pi.hasNextPage) break; after=pi.endCursor }
  console.log(`Fetched ${all.length} items`)

  const rows = []
  for(const it of all){
    const name = String(it.name || '').toLowerCase()
    if (!families.some(f => name.includes(f))) continue
    const d = toNumber(it.dps); if (d==null||d<=0) continue
    const ilvl = toNumber(it.itemLevel)||0; const lvlReq = toNumber(it.levelRequirement)||0; const ren = toNumber(it.renownRankRequirement)||0
    const rf = (it.rarity? { COMMON:0, UNCOMMON:1, RARE:2, VERY_RARE:3, MYTHIC:4 }[String(it.rarity)]:0) || 0
    const mid = midpointFor(it); const speed = toNumber(it.speed)
    let hand = 0
    if (mid!=null && speed!=null && speed>0){ const base = d*(speed/1000); hand = base>mid?1:0 }
    rows.push({ id: it.id, name: it.name, d, ilvl, lvlReq, rf, ren, hand })
  }
  console.log(`Rows usable for regression (families): ${rows.length}`)
  if (!rows.length) return

  // Persist rows for inspection
  try{ fs.mkdirSync(path.resolve(__dirname,'..','tmp'), { recursive: true }) }catch(e){}
  fs.writeFileSync(path.resolve(__dirname,'..','tmp','rows-families.json'), JSON.stringify(rows, null, 2))

  const y = rows.map(r=>Math.log(r.d))
  const X = rows.map(r=>[1, r.ilvl, r.lvlReq, r.rf, r.ren, r.hand])
  let beta = solveNormalEquations(X,y)
  if (!beta){ console.warn('Direct normal-equation solve failed, trying ridge (lambda=1e-3)')
    beta = solveWithRidge(X,y,1e-3)
    if (!beta){ console.error('Both direct and ridge regression failed'); return }
  }

  const predLog = rows.map(r=> beta[0] + beta[1]*r.ilvl + beta[2]*r.lvlReq + beta[3]*r.rf + beta[4]*r.ren + beta[5]*r.hand )
  const n = predLog.length
  const mean = y.reduce((a,b)=>a+b,0)/n
  let ssTot=0, ssRes=0
  for(let i=0;i<n;i++){ ssTot+=Math.pow(y[i]-mean,2); ssRes+=Math.pow(y[i]-predLog[i],2) }
  const r2 = ssTot===0?0:1-(ssRes/ssTot)

  console.log('\nCoefficients (log dps) for families:')
  console.log(`intercept=${beta[0].toFixed(6)}, ilvl=${beta[1].toFixed(6)}, lvlReq=${beta[2].toFixed(6)}, rarity=${beta[3].toFixed(6)}, renown=${beta[4].toFixed(6)}, hand=${beta[5].toFixed(6)}`)
  console.log(`R^2 (log-scale) = ${r2.toFixed(4)}`)

  try{ fs.mkdirSync(path.resolve(__dirname,'..','tmp'), { recursive: true }) }catch(e){}
  fs.writeFileSync(path.resolve(__dirname,'..','tmp','coefs-families.json'), JSON.stringify({ intercept: beta[0], ilvl: beta[1], lvlReq: beta[2], rarity: beta[3], renown: beta[4], hand: beta[5], r2 }, null, 2))
  console.log('Wrote tmp/coefs-families.json')

  console.log('\nSample rows (first 10):')
  for(let i=0;i<Math.min(10, rows.length); i++){ const r=rows[i]; console.log(`${r.id} | ${r.name} | ilvl=${r.ilvl} lvlReq=${r.lvlReq} ren=${r.ren} hand=${r.hand} dps=${r.d}`) }

  console.log('\nDone')
})().catch(e=>{ console.error('Probe failed:', e && e.message || e) })
