/*
  Compare itemLevel vs levelRequirement as predictors for weapon baseDamage.
  Pages the API (MAIN_HAND + EITHER_HAND), collects items with dps & speed,
  computes Pearson correlations and R^2 for simple regressions and a small
  multiple regression (base ~ itemLevel + levelRequirement).

  Usage: node scripts/compare-ilvl-vs-levelreq.js
*/
const endpoint = 'https://production-api.waremu.com/graphql/'
const FIRST = 50
const MAX_ITEMS = Number(process.env.MAX_ITEMS || 5000)

function toNumber(v){ const n = Number(v); return Number.isFinite(n) ? n : null }
function baseDamage(it){ const d = toNumber(it.dps); const s = toNumber(it.speed); if (d==null||s==null||s<=0) return null; return d*(s/1000) }

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

function pearson(xs, ys){
  if (!xs.length || xs.length !== ys.length) return null
  const n = xs.length
  const mx = xs.reduce((a,b)=>a+b,0)/n
  const my = ys.reduce((a,b)=>a+b,0)/n
  let num = 0, denx = 0, deny = 0
  for (let i=0;i<n;i++){ const dx = xs[i]-mx; const dy = ys[i]-my; num += dx*dy; denx += dx*dx; deny += dy*dy }
  if (denx<=0 || deny<=0) return 0
  return num / Math.sqrt(denx*deny)
}

function linearRegressionRSquared(xs, ys){
  // simple linear regression y ~ x
  if (!xs.length || xs.length !== ys.length) return { r2: null }
  const n = xs.length
  const mx = xs.reduce((a,b)=>a+b,0)/n
  const my = ys.reduce((a,b)=>a+b,0)/n
  let ssTot = 0
  for (let i=0;i<n;i++){ const dy = ys[i]-my; ssTot += dy*dy }
  // compute slope & intercept
  let num = 0, den = 0
  for (let i=0;i<n;i++){ const dx = xs[i]-mx; const dy = ys[i]-my; num += dx*dy; den += dx*dx }
  if (den === 0) return { r2: 0 }
  const slope = num/den
  const intercept = my - slope*mx
  let ssRes = 0
  for (let i=0;i<n;i++){ const pred = intercept + slope*xs[i]; const e = ys[i]-pred; ssRes += e*e }
  const r2 = ssTot === 0 ? 0 : 1 - (ssRes/ssTot)
  return { r2, slope, intercept }
}

function multipleRegressionRSquared(x1s, x2s, ys){
  // model y = b0 + b1*x1 + b2*x2
  const n = ys.length
  if (!n || x1s.length !== n || x2s.length !== n) return { r2: null }
  // build matrices for normal equations: solve (X^T X) beta = X^T y
  let S00 = n, S10=0, S20=0, S11=0, S21=0, S22=0, Y0=0, Y1=0, Y2=0
  for (let i=0;i<n;i++){
    const x0 = 1
    const x1 = x1s[i]
    const x2 = x2s[i]
    const y = ys[i]
    S10 += x1; S20 += x2; S11 += x1*x1; S21 += x2*x1; S22 += x2*x2
    Y0 += y; Y1 += x1*y; Y2 += x2*y
  }
  // matrix
  // [S00 S10 S20] [b0] = [Y0]
  // [S10 S11 S21] [b1]   [Y1]
  // [S20 S21 S22] [b2]   [Y2]
  // solve 3x3 linear system
  const A = [[S00,S10,S20],[S10,S11,S21],[S20,S21,S22]]
  const B = [Y0,Y1,Y2]
  // compute inverse using Cramer's rule or gaussian elimination
  function solve3(A,B){
    const m = A.map(r=>r.slice())
    const b = B.slice()
    // gaussian elimination
    for (let i=0;i<3;i++){
      // pivot
      let piv = i
      for (let j=i;j<3;j++) if (Math.abs(m[j][i]) > Math.abs(m[piv][i])) piv = j
      if (Math.abs(m[piv][i]) < 1e-12) return null
      if (piv !== i){ const tmp = m[i]; m[i]=m[piv]; m[piv]=tmp; const tb=b[i]; b[i]=b[piv]; b[piv]=tb }
      // normalize
      const div = m[i][i]
      for (let j=i;j<3;j++) m[i][j] /= div
      b[i] /= div
      for (let r=0;r<3;r++){
        if (r===i) continue
        const fac = m[r][i]
        for (let c=i;c<3;c++) m[r][c] -= fac*m[i][c]
        b[r] -= fac*b[i]
      }
    }
    return b
  }
  const sol = solve3(A,B)
  if (!sol) return { r2: 0 }
  const [b0,b1,b2] = sol
  const my = ys.reduce((a,b)=>a+b,0)/n
  let ssTot = 0, ssRes = 0
  for (let i=0;i<n;i++){
    const pred = b0 + b1*x1s[i] + b2*x2s[i]
    const dy = ys[i]-my; ssTot += dy*dy
    const e = ys[i]-pred; ssRes += e*e
  }
  const r2 = ssTot === 0 ? 0 : 1 - (ssRes/ssTot)
  return { r2, b0, b1, b2 }
}

(async ()=>{
  try {
    console.log('Starting comparison probe...')
    let after = null
    let total = 0
    let pages = 0
    const all = []
    while (total < MAX_ITEMS) {
      const conn = await fetchPage(after)
      if (!conn) break
      const nodes = conn.nodes || []
      for (const n of nodes) { all.push(n); total++; if (total>=MAX_ITEMS) break }
      pages++
      console.log(`Page ${pages}: fetched ${nodes.length} nodes (cumulative ${all.length})`)
      const pi = conn.pageInfo || {}
      if (!pi.hasNextPage) break
      after = pi.endCursor
    }
    console.log(`Fetched ${all.length} items total (cap ${MAX_ITEMS})`)

    // build arrays
    const rows = []
    for (const it of all) {
      const base = baseDamage(it)
      const ilvl = toNumber(it.itemLevel) ?? null
      const lvlReq = toNumber(it.levelRequirement) ?? null
      if (base == null) continue
      rows.push({ base, ilvl, lvlReq, rarity: it.rarity ?? 'UNKNOWN' })
    }
    console.log(`Usable rows (have base): ${rows.length}`)
    if (!rows.length) return

    // overall correlations
    const bases = rows.map(r=>r.base)
    const ilvls = rows.map(r=>r.ilvl)
    const lvlReqs = rows.map(r=>r.lvlReq)
    const corrIlvl = pearson(ilvls, bases)
    const corrLvlReq = pearson(lvlReqs, bases)
    const lr1 = linearRegressionRSquared(ilvls, bases)
    const lr2 = linearRegressionRSquared(lvlReqs, bases)
    const mr = multipleRegressionRSquared(ilvls, lvlReqs, bases)

    console.log('\nOverall stats:')
    console.log(`Pearson(base, itemLevel) = ${corrIlvl.toFixed(3)}`)
    console.log(`Pearson(base, levelRequirement) = ${corrLvlReq.toFixed(3)}`)
    console.log(`R^2 base~itemLevel = ${lr1.r2 != null ? lr1.r2.toFixed(3) : '-'}; slope=${lr1.slope?lr1.slope.toFixed(3):'-'}`)
    console.log(`R^2 base~levelRequirement = ${lr2.r2 != null ? lr2.r2.toFixed(3) : '-'}; slope=${lr2.slope?lr2.slope.toFixed(3):'-'}`)
    console.log(`R^2 multiple (itemLevel + levelRequirement) = ${mr.r2 != null ? mr.r2.toFixed(3) : '-'}; b1=${mr.b1?mr.b1.toFixed(3):'-'} b2=${mr.b2?mr.b2.toFixed(3):'-'}`)

    // per-rarity groups
    const byR = {}
    for (const r of rows) {
      const k = r.rarity || 'UNKNOWN'
      if (!byR[k]) byR[k] = []
      byR[k].push(r)
    }
    console.log('\nPer-rarity summary:')
    for (const k of Object.keys(byR)){
      const g = byR[k]
      const gb = g.map(x=>x.base), gi = g.map(x=>x.ilvl), gl = g.map(x=>x.lvlReq)
      const corrI = pearson(gi, gb) || 0
      const corrL = pearson(gl, gb) || 0
      const lrI = linearRegressionRSquared(gi, gb)
      const lrL = linearRegressionRSquared(gl, gb)
      console.log(`${k}: n=${g.length} corr(base,itemLevel)=${corrI.toFixed(3)} r2(ilvl)=${lrI.r2!=null?lrI.r2.toFixed(3):'-'} corr(base,levelReq)=${corrL.toFixed(3)} r2(lvlReq)=${lrL.r2!=null?lrL.r2.toFixed(3):'-'}`)
    }

    console.log('\nDone')
  } catch (e) {
    console.error('Probe failed:', e && e.message ? e.message : e)
  }
})()
