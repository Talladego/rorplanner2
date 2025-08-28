const fs = require('fs')
const endpoint = 'https://production-api.waremu.com/graphql/'
const FIRST = 50
const MAX_ITEMS = Number(process.env.MAX_ITEMS || 5000)

const model = JSON.parse(fs.readFileSync('src/lib/baseDamageModel.json','utf8'))
const groups = model.groups || {}

function toNumber(v){ const n = Number(v); return Number.isFinite(n)? n : null }
function baseDamage(it){ const d = toNumber(it.dps); const s = toNumber(it.speed); if (d==null||s==null||s<=0) return null; return d*(s/1000) }

async function fetchPage(after){
  const query = `query Items($where: ItemFilterInput, $first: Int, $after: String){ items(where: $where, first: $first, after: $after){ nodes{ id name slot type itemLevel dps speed rarity levelRequirement } pageInfo{ hasNextPage endCursor } } }`
  const where = { slot: { in: ['MAIN_HAND','EITHER_HAND'] } }
  const body = JSON.stringify({ query, variables: { where, first: FIRST, after } })
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  const text = await res.text(); let j
  try { j = JSON.parse(text) } catch (e) { j = null }
  if (!res.ok) { console.error('HTTP', res.status); console.error(text); throw new Error('HTTP') }
  if (j && j.errors && j.errors.length) console.error('GraphQL errors', JSON.stringify(j.errors,null,2))
  return j && j.data ? j.data.items : null
}

function mean(arr){ if(!arr.length) return null; return arr.reduce((a,b)=>a+b,0)/arr.length }
function median(arr){ if(!arr.length) return null; const s = arr.slice().sort((a,b)=>a-b); const m = Math.floor(s.length/2); return s.length%2? s[m] : (s[m-1]+s[m])/2 }
function stddev(arr){ if(!arr.length) return 0; const m=mean(arr); return Math.sqrt(arr.reduce((s,v)=>s+(v-m)*(v-m),0)/arr.length) }

(async ()=>{
  try{
    let after = null; let total=0; let pages=0; const speedByPred = { one: [], two: [] }
    while (total < MAX_ITEMS){
      const conn = await fetchPage(after)
      if (!conn) break
      const nodes = conn.nodes || []
      for (const it of nodes){
        total++
        const bd = baseDamage(it)
        const sp = toNumber(it.speed)
        if (bd==null || sp==null) continue
        const key = `${it.itemLevel || 0}||${it.rarity || 'UNKNOWN'}`
        const g = groups[key]
        if (!g || g.one==null || g.two==null) continue
        const mid = (g.one + g.two)/2
        if (bd >= mid) speedByPred.two.push(sp)
        else speedByPred.one.push(sp)
      }
      pages++
      const pi = conn.pageInfo||{}
      if (!pi.hasNextPage) break
      after = pi.endCursor
    }
    console.log(`Processed ${total} items across ${pages} pages`)
    const oneCount = speedByPred.one.length, twoCount = speedByPred.two.length
    console.log(`Predicted 1H: ${oneCount}, Predicted 2H: ${twoCount}`)
    console.log('\nSpeed stats (ms):')
    console.log(`1H mean:${mean(speedByPred.one)?.toFixed(2) ?? '-'} median:${median(speedByPred.one)?.toFixed(2) ?? '-'} stddev:${stddev(speedByPred.one)?.toFixed(2) ?? '-'}`)
    console.log(`2H mean:${mean(speedByPred.two)?.toFixed(2) ?? '-'} median:${median(speedByPred.two)?.toFixed(2) ?? '-'} stddev:${stddev(speedByPred.two)?.toFixed(2) ?? '-'}`)
    // compute percent where 1H speed < 2H speed on per-pair sampling: sample matched by itemLevel+rarity
    // build per-key stats
    const perKey = {}
    for (const k of Object.keys(groups)) perKey[k] = { one: [], two: [] }
    // re-fetch small pass to fill perKey arrays (limited to fewer items to avoid double paging)
    after = null; pages=0; total=0
    while (total < 2000){
      const conn = await fetchPage(after)
      if (!conn) break
      const nodes = conn.nodes || []
      for (const it of nodes){ total++; const bd = baseDamage(it); const sp = toNumber(it.speed); if (bd==null||sp==null) continue; const key = `${it.itemLevel||0}||${it.rarity||'UNKNOWN'}`; const g=groups[key]; if (!g||g.one==null||g.two==null) continue; const mid=(g.one+g.two)/2; if (bd>=mid) perKey[key].two.push(sp); else perKey[key].one.push(sp) }
      pages++; const pi=conn.pageInfo||{}; if(!pi.hasNextPage) break; after = conn.pageInfo.endCursor
    }
    let keysWithBoth=0, keysWhereOneFaster=0
    for (const k of Object.keys(perKey)){
      const a = perKey[k].one, b = perKey[k].two
      if (!a.length || !b.length) continue
      keysWithBoth++
      const meanOne = mean(a), meanTwo = mean(b)
      if (meanOne < meanTwo) keysWhereOneFaster++
    }
    console.log(`\nGroups with both classes sampled: ${keysWithBoth}. In ${keysWhereOneFaster} groups ( ${(keysWhereOneFaster/Math.max(1,keysWithBoth)*100).toFixed(1)}% ) mean(1H) < mean(2H)`) 
    console.log('\nDone')
  }catch(e){ console.error('Analysis failed', e && e.message ? e.message : e) }
})()
