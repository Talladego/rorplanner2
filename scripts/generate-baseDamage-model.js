/*
  Full sweep probe: fetch MAIN_HAND + EITHER_HAND items, compute baseDamage (dps * speed/1000),
  group by itemLevel||rarity, run simple 1D k=2 clustering per group to estimate 1H/2H centroids,
  and write a JSON model to src/lib/baseDamageModel.json

  Safety: caps total items fetched to avoid runaway runs. Set MAX_ITEMS env to override.
*/

const fs = require('fs')
const endpoint = 'https://production-api.waremu.com/graphql/'
const FIRST = 50
const MAX_ITEMS = Number(process.env.MAX_ITEMS || 5000)
const MIN_SAMPLES = 8

function toNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : null }
function baseDamage(it) { const d = toNumber(it.dps); const s = toNumber(it.speed); if (d==null||s==null||s<=0) return null; return d*(s/1000) }

async function fetchPage(after) {
  const query = `query Items($where: ItemFilterInput, $first: Int, $after: String){ items(where: $where, first: $first, after: $after){ nodes{ id name slot type itemLevel dps speed rarity } pageInfo{ hasNextPage endCursor } } }`
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

function kmeans1d(values, k=2, maxIter=100) {
  // values: array of numbers
  if (!values.length) return null
  if (k <= 1 || values.length === 1) return { centroids: [mean(values)], clusters: [values] }
  // initialize centroids at min and max
  let a = Math.min(...values)
  let b = Math.max(...values)
  let centroids = [a, b]
  let clusters = null
  for (let iter=0; iter<maxIter; iter++) {
    const c0 = [], c1 = []
    for (const v of values) {
      const d0 = Math.abs(v - centroids[0])
      const d1 = Math.abs(v - centroids[1])
      if (d0 <= d1) c0.push(v); else c1.push(v)
    }
    const n0 = c0.length, n1 = c1.length
    if (n0 === 0 || n1 === 0) break
    const nc0 = mean(c0), nc1 = mean(c1)
    if (Math.abs(nc0 - centroids[0]) < 1e-6 && Math.abs(nc1 - centroids[1]) < 1e-6) { clusters = [c0, c1]; break }
    centroids = [nc0, nc1]
    clusters = [c0, c1]
  }
  // sort centroids so centroids[0] <= centroids[1]
  if (centroids[0] > centroids[1]) {
    centroids = [centroids[1], centroids[0]]
    clusters = clusters ? [clusters[1], clusters[0]] : clusters
  }
  return { centroids, clusters }
}

function mean(arr) { if (!arr.length) return null; return arr.reduce((a,b)=>a+b,0)/arr.length }
function stddev(arr) { if (!arr.length) return 0; const m = mean(arr); return Math.sqrt(arr.reduce((s,v)=>s+(v-m)*(v-m),0)/arr.length) }

(async ()=>{
  try {
    console.log('Starting full sweep probe (MAIN_HAND + EITHER_HAND)')
    let after = null
    let total = 0
    let pages = 0
    const all = []
    while (total < MAX_ITEMS) {
      const conn = await fetchPage(after)
      if (!conn) break
      const nodes = conn.nodes || []
      for (const n of nodes) {
        all.push(n)
        total += 1
        if (total >= MAX_ITEMS) break
      }
      pages += 1
      console.log(`Page ${pages}: fetched ${nodes.length} nodes (cumulative ${all.length})`)
      const pi = conn.pageInfo || {}
      if (!pi.hasNextPage) break
      after = pi.endCursor
    }
    console.log(`Fetched ${all.length} items total across ${pages} pages (cap ${MAX_ITEMS})`)

    // group by itemLevel||rarity
    const groups = {}
    for (const it of all) {
      const ilvl = it.itemLevel ?? 0
      const rar = it.rarity ?? 'UNKNOWN'
      const key = `${ilvl}||${rar}`
      const base = baseDamage(it)
      if (!groups[key]) groups[key] = { itemLevel: ilvl, rarity: rar, bases: [], items: [] }
      if (base != null) groups[key].bases.push(base)
      groups[key].items.push({ id: it.id, name: it.name, type: it.type, dps: it.dps, speed: it.speed, base })
    }

    const model = { generatedAt: (new Date()).toISOString(), totalItems: all.length, groups: {} }
    for (const k of Object.keys(groups)) {
      const g = groups[k]
      const n = g.bases.length
      const entry = { n, one: null, two: null, ratio: null, mean: null, min: null, max: null, stddev: null, confidence: 'low' }
      if (n) {
        entry.min = Math.min(...g.bases)
        entry.max = Math.max(...g.bases)
        entry.mean = mean(g.bases)
        entry.stddev = stddev(g.bases)
        if (n >= MIN_SAMPLES) {
          const kres = kmeans1d(g.bases, 2)
          if (kres && kres.centroids && kres.centroids.length === 2) {
            entry.one = Number(kres.centroids[0])
            entry.two = Number(kres.centroids[1])
            entry.ratio = entry.one>0 ? entry.two / entry.one : null
            entry.confidence = (Math.abs(entry.two - entry.one) > Math.max(1, entry.one*0.25)) ? 'high' : 'medium'
          }
        }
        // fallback: if clustering didn't run or failed, split by median
        if (entry.one == null) {
          const sorted = g.bases.slice().sort((a,b)=>a-b)
          const mid = Math.floor(sorted.length/2)
          const lower = sorted.slice(0, Math.max(1, mid))
          const upper = sorted.slice(mid)
          entry.one = mean(lower)
          entry.two = mean(upper)
          entry.ratio = entry.one>0 ? entry.two / entry.one : null
          entry.confidence = n >= MIN_SAMPLES ? 'medium' : 'low'
        }
      }
      model.groups[k] = entry
    }

    const outPath = 'src/lib/baseDamageModel.json'
    fs.writeFileSync(outPath, JSON.stringify(model, null, 2))
    console.log(`Wrote model to ${outPath}. Groups: ${Object.keys(model.groups).length}`)
    // print sample of groups
    const sampleKeys = Object.keys(model.groups).slice(0,20)
    console.log('\nSample groups:')
    for (const sk of sampleKeys) {
      const e = model.groups[sk]
      console.log(`${sk} n=${e.n} one=${e.one?e.one.toFixed(3):'-'} two=${e.two?e.two.toFixed(3):'-'} ratio=${e.ratio?e.ratio.toFixed(3):'-'} conf=${e.confidence}`)
    }
    console.log('\nDone')
  } catch (e) {
    console.error('Sweep failed:', e && e.message ? e.message : e)
  }
})()
