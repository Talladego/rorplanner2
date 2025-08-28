/*
  Fit log(dps) = b0 + b1*ilvl + b2*levelRequirement + b3*rarity + b4*renown + b5*hand
  Derive hand using baseDamage midpoint from src/lib/baseDamageModel.json
  Usage: node scripts/regress-on-dps-with-renown.js
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

function pearson(xs, ys){ if (!xs.length || xs.length !== ys.length) return null; const n=xs.length; const mx=xs.reduce((a,b)=>a+b,0)/n; const my=ys.reduce((a,b)=>a+b,0)/n; let num=0, denx=0, deny=0; for(let i=0;i<n;i++){ const dx=xs[i]-mx; const dy=ys[i]-my; num+=dx*dy; denx+=dx*dx; deny+=dy*dy } if (denx<=0||deny<=0) return 0; return num/Math.sqrt(denx*deny) }

function solveNormalEquations(X,y){ const n=X.length; if (!n) return null; const p=X[0].length; const XT_X=Array.from({length:p}, ()=>Array(p).fill(0)); const XT_y=Array(p).fill(0); for(let i=0;i<n;i++){ const xi=X[i]; for(let a=0;a<p;a++){ XT_y[a]+=xi[a]*y[i]; for(let b=0;b<p;b++) XT_X[a][b]+=xi[a]*xi[b] } } const A=XT_X.map(r=>r.slice()); const B=XT_y.slice(); // gaussian
  for(let i=0;i<p;i++){ let piv=i; for(let j=i;j<p;j++) if (Math.abs(A[j][i])>Math.abs(A[piv][i])) piv=j; if (Math.abs(A[piv][i])<1e-12) return null; if (piv!==i){ const tmp=A[i]; A[i]=A[piv]; A[piv]=tmp; const tb=B[i]; B[i]=B[piv]; B[piv]=tb } const div=A[i][i]; for(let c=i;c<p;c++) A[i][c]/=div; B[i]/=div; for(let r=0;r<p;r++){ if (r===i) continue; const fac=A[r][i]; for(let c=i;c<p;c++) A[r][c]-=fac*A[i][c]; B[r]-=fac*B[i] } } return B }

(async ()=>{
  console.log('Starting regression with renown...')
  let after=null,total=0,pages=0
  const all=[]
  while(total<MAX_ITEMS){ const conn=await fetchPage(after); if (!conn) break; const nodes=conn.nodes||[]; for(const n of nodes){ all.push(n); total++; if (total>=MAX_ITEMS) break } pages++; console.log(`Page ${pages}: fetched ${nodes.length} nodes (cumulative ${all.length})`); const pi=conn.pageInfo||{}; if (!pi.hasNextPage) break; after=pi.endCursor }
  console.log(`Fetched ${all.length} items`)

  const rows=[]
  for(const it of all){ const d=toNumber(it.dps); if (d==null||d<=0) continue; const ilvl=toNumber(it.itemLevel)||0; const lvlReq=toNumber(it.levelRequirement)||0; const ren=toNumber(it.renownRankRequirement)||0; const rf = (it.rarity? { COMMON:0, UNCOMMON:1, RARE:2, VERY_RARE:3, MYTHIC:4 }[String(it.rarity)]:0) || 0; const mid = midpointFor(it); const speed=toNumber(it.speed); let hand=0; if (mid!=null && speed!=null && speed>0){ const base = d*(speed/1000); hand = base>mid?1:0 } rows.push({ d, ilvl, lvlReq, rf, ren, hand }) }
  console.log(`Usable rows: ${rows.length}`)
  const y = rows.map(r=>Math.log(r.d))
  const X = rows.map(r=>[1, r.ilvl, r.lvlReq, r.rf, r.ren, r.hand])
  const beta = solveNormalEquations(X,y)
  if (!beta) { console.error('Regression failed'); return }
  console.log('Coefficients (log dps):')
  console.log(`intercept=${beta[0].toFixed(6)}, ilvl=${beta[1].toFixed(6)}, lvlReq=${beta[2].toFixed(6)}, rarity=${beta[3].toFixed(6)}, renown=${beta[4].toFixed(6)}, hand=${beta[5].toFixed(6)}`)
  const fs = require('fs'); fs.writeFileSync(path.resolve(__dirname,'..','tmp','coefs-renown.json'), JSON.stringify({ intercept: beta[0], ilvl: beta[1], lvlReq: beta[2], rarity: beta[3], renown: beta[4], hand: beta[5] }, null, 2))
  console.log('Wrote tmp/coefs-renown.json')
})().catch(e=>{ console.error('Probe failed:', e && e.message || e) })
