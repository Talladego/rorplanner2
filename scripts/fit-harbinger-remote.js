/*
  Fetch only items whose name contains 'Harbinger' (server-side) and fit log(dps).
  Usage: node scripts/fit-harbinger-remote.js
*/
const fs = require('fs')
const path = require('path')
const endpoint = 'https://production-api.waremu.com/graphql/'
const FIRST = 50

function toNumber(v){ const n = Number(v); return Number.isFinite(n) ? n : null }

const modelPath = path.resolve(__dirname, '..', 'src', 'lib', 'baseDamageModel.json')
let model = null
try { model = JSON.parse(fs.readFileSync(modelPath, 'utf8')) } catch (e) { console.error('failed to load baseDamageModel.json', e && e.message); model = null }
const groups = model && model.groups ? model.groups : {}
function midpointFor(it){ const key = `${it.itemLevel}||${it.rarity}`; const g = groups[key]; if (!g || g.one==null || g.two==null) return null; return (g.one + g.two)/2 }

async function fetchPage(after){
  const query = `query Items($where: ItemFilterInput, $first: Int, $after: String){ items(where: $where, first: $first, after: $after){ nodes{ id name slot type itemLevel levelRequirement renownRankRequirement dps speed rarity } pageInfo{ hasNextPage endCursor } } }`
  const where = { name: { contains: 'Harbinger' }, slot: { in: ['MAIN_HAND','EITHER_HAND'] } }
  const body = JSON.stringify({ query, variables: { where, first: FIRST, after } })
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  const j = await res.json()
  if (j.errors) console.error('GraphQLErrors', JSON.stringify(j.errors, null, 2))
  return j.data && j.data.items ? j.data.items : null
}

function solveNormalEquations(X,y){ const n=X.length; if (!n) return null; const p=X[0].length; const XT_X=Array.from({length:p}, ()=>Array(p).fill(0)); const XT_y=Array(p).fill(0); for(let i=0;i<n;i++){ const xi=X[i]; for(let a=0;a<p;a++){ XT_y[a]+=xi[a]*y[i]; for(let b=0;b<p;b++) XT_X[a][b]+=xi[a]*xi[b] } } const A=XT_X.map(r=>r.slice()); const B=XT_y.slice(); for(let i=0;i<p;i++){ let piv=i; for(let j=i;j<p;j++) if (Math.abs(A[j][i])>Math.abs(A[piv][i])) piv=j; if (Math.abs(A[piv][i])<1e-12) return null; if (piv!==i){ const tmp=A[i]; A[i]=A[piv]; A[piv]=tmp; const tb=B[i]; B[i]=B[piv]; B[piv]=tb } const div=A[i][i]; for(let c=i;c<p;c++) A[i][c]/=div; B[i]/=div; for(let r=0;r<p;r++){ if (r===i) continue; const fac=A[r][i]; for(let c=i;c<p;c++) A[r][c]-=fac*A[i][c]; B[r]-=fac*B[i] } } return B }

function solveWithRidge(X,y,lambda){ const n=X.length; if (!n) return null; const p=X[0].length; const XT_X=Array.from({length:p}, ()=>Array(p).fill(0)); const XT_y=Array(p).fill(0); for(let i=0;i<n;i++){ const xi=X[i]; for(let a=0;a<p;a++){ XT_y[a]+=xi[a]*y[i]; for(let b=0;b<p;b++) XT_X[a][b]+=xi[a]*xi[b] } } for(let i=0;i<p;i++) XT_X[i][i] += lambda; const A=XT_X.map(r=>r.slice()); const B=XT_y.slice(); for(let i=0;i<p;i++){ let piv=i; for(let j=i;j<p;j++) if (Math.abs(A[j][i])>Math.abs(A[piv][i])) piv=j; if (Math.abs(A[piv][i])<1e-18) return null; if (piv!==i){ const tmp=A[i]; A[i]=A[piv]; A[piv]=tmp; const tb=B[i]; B[i]=B[piv]; B[piv]=tb } const div=A[i][i]; for(let c=i;c<p;c++) A[i][c]/=div; B[i]/=div; for(let r=0;r<p;r++){ if (r===i) continue; const fac=A[r][i]; for(let c=i;c<p;c++) A[r][c]-=fac*A[i][c]; B[r]-=fac*B[i] } } return B }

(async ()=>{
  console.log('Fetching Harbinger items (server-side filter) and fitting...')
  let after=null, pages=0, all=[]
  while(true){ const conn = await fetchPage(after); if (!conn) break; const nodes = conn.nodes || []; all.push(...nodes); pages++; console.log(`Page ${pages}: fetched ${nodes.length} nodes (cumulative ${all.length})`); const pi = conn.pageInfo || {}; if (!pi.hasNextPage) break; after = pi.endCursor }
  console.log(`Fetched ${all.length} Harbinger items`)

  const rows = []
  for(const it of all){ const d = toNumber(it.dps); if (d==null||d<=0) continue; const ilvl = toNumber(it.itemLevel)||0; const lvlReq = toNumber(it.levelRequirement)||0; const ren = toNumber(it.renownRankRequirement)||0; const rf = (it.rarity? { COMMON:0, UNCOMMON:1, RARE:2, VERY_RARE:3, MYTHIC:4 }[String(it.rarity)]:0) || 0; const mid = midpointFor(it); const speed = toNumber(it.speed); let hand = 0; if (mid!=null && speed!=null && speed>0){ const base = d*(speed/1000); hand = base>mid?1:0 } rows.push({ id: it.id, name: it.name, d, ilvl, lvlReq, rf, ren, hand, speed }) }

  console.log(`Rows usable for regression (harbinger): ${rows.length}`)
  if (!rows.length) return
  try{ fs.mkdirSync(path.resolve(__dirname,'..','tmp'), { recursive: true }) }catch(e){}
  fs.writeFileSync(path.resolve(__dirname,'..','tmp','rows-harbinger-remote.json'), JSON.stringify(rows, null, 2))

  const y = rows.map(r=>Math.log(r.d))
  const X = rows.map(r=>[1, r.ilvl, r.lvlReq, r.rf, r.ren, r.hand])
  let beta = solveNormalEquations(X,y)
  if (!beta){ console.warn('Direct solve failed, trying ridge (lambda=1e-3)'); beta = solveWithRidge(X,y,1e-3); if (!beta){ console.error('Both solves failed'); return } }

  const predLog = rows.map(r=> beta[0] + beta[1]*r.ilvl + beta[2]*r.lvlReq + beta[3]*r.rf + beta[4]*r.ren + beta[5]*r.hand )
  const n = predLog.length
  const mean = y.reduce((a,b)=>a+b,0)/n
  let ssTot=0, ssRes=0
  for(let i=0;i<n;i++){ ssTot+=Math.pow(y[i]-mean,2); ssRes+=Math.pow(y[i]-predLog[i],2) }
  const r2 = ssTot===0?0:1-(ssRes/ssTot)

  console.log('\nCoefficients (log dps) for Harbinger (remote fetch):')
  console.log(`intercept=${beta[0].toFixed(6)}, ilvl=${beta[1].toFixed(6)}, lvlReq=${beta[2].toFixed(6)}, rarity=${beta[3].toFixed(6)}, renown=${beta[4].toFixed(6)}, hand=${beta[5].toFixed(6)}`)
  console.log(`R^2 (log-scale) = ${r2.toFixed(4)}`)

  fs.writeFileSync(path.resolve(__dirname,'..','tmp','coefs-harbinger-remote.json'), JSON.stringify({ intercept: beta[0], ilvl: beta[1], lvlReq: beta[2], rarity: beta[3], renown: beta[4], hand: beta[5], r2 }, null, 2))
  console.log('Wrote tmp/coefs-harbinger-remote.json')

  // Classification summary
  const marginLog = 0.223
  let counts = { total: n, two_high:0, two_low:0, one_high:0, one_low:0 }
  const mis = []
  for(const r of rows){ const obs = r.d; const lobs = Math.log(obs); const p1 = Math.exp(beta[0] + beta[1]*r.ilvl + beta[2]*r.lvlReq + beta[3]*r.rf + beta[4]*r.ren + beta[5]*0); const p2 = Math.exp(beta[0] + beta[1]*r.ilvl + beta[2]*r.lvlReq + beta[3]*r.rf + beta[4]*r.ren + beta[5]*1); const e1 = Math.abs(lobs - Math.log(p1)); const e2 = Math.abs(lobs - Math.log(p2)); const logDiff = e1 - e2; let isTwo=false; let conf='low'; if (logDiff > marginLog){ isTwo=true; conf='high' } else if (logDiff < -marginLog){ isTwo=false; conf='high' } else { isTwo = (logDiff>0); conf='low' } if (isTwo && conf==='high') counts.two_high++; else if (isTwo) counts.two_low++; else if (!isTwo && conf==='high') counts.one_high++; else counts.one_low++; mis.push({ id: r.id, name: r.name, observedDps: r.d, pred1: p1, pred2: p2, isTwo, conf, logDiff }) }

  console.log('\nClassification summary (Harbinger rows):', counts)
  console.log('\nSample misclassifications / borderline items:')
  mis.sort((a,b)=> Math.abs(Math.log(b.observedDps) - Math.log(a.isTwo? a.pred2 : a.pred1)) - Math.abs(Math.log(a.observedDps) - Math.log(b.isTwo? b.pred2 : b.pred1)))
  for(let i=0;i<Math.min(20, mis.length); i++){ const m=mis[i]; console.log(`${m.id} | ${m.name} | obsDps=${m.observedDps} pred1=${m.pred1?.toFixed(1)} pred2=${m.pred2?.toFixed(1)} -> isTwo=${m.isTwo} conf=${m.conf} logDiff=${m.logDiff?.toFixed(3)}`) }

  console.log('\nDone')
})().catch(e=>{ console.error('Probe failed:', e && e.message || e) })
