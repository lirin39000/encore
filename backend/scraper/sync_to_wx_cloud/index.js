// 把 export_shows_json.py 导出的 shows_export.json 同步进微信云开发的云数据库，
// 供小程序直接读取(不用再走"小程序 -> 云函数 -> Railway"这条连不通境外的路)。
//
// 云数据库没有内置的"整批upsert"接口，只能一条条 doc(id).set() 写；
// 用 doc(id) 而不是 add() 是为了让同一场演出反复同步时更新而不是重复插入。
// 挨个 await 会很慢(几千条)，用一个简单的并发池限制同时飞的请求数。
//
// 运行(需要环境变量 WX_CLOUD_ENV / TENCENT_SECRET_ID / TENCENT_SECRET_KEY)：
//     node index.js
const fs = require('fs')
const path = require('path')
const cloud = require('wx-server-sdk')

const ENV_ID = process.env.WX_CLOUD_ENV
const SECRET_ID = process.env.TENCENT_SECRET_ID
const SECRET_KEY = process.env.TENCENT_SECRET_KEY
const EXPORT_PATH = path.join(__dirname, '..', 'shows_export.json')
const CONCURRENCY = 20

if (!ENV_ID || !SECRET_ID || !SECRET_KEY) {
  console.error('缺少环境变量: WX_CLOUD_ENV / TENCENT_SECRET_ID / TENCENT_SECRET_KEY 都要设置')
  process.exit(1)
}

cloud.init({ env: ENV_ID, secretId: SECRET_ID, secretKey: SECRET_KEY })
const db = cloud.database()

async function upsertOne(record) {
  const id = String(record.id)
  try {
    await db.collection('shows').doc(id).set({ data: record })
    return { ok: true }
  } catch (e) {
    return { ok: false, id, message: e.message }
  }
}

async function runPool(items, worker, concurrency) {
  let idx = 0
  let okCount = 0
  const failures = []

  async function next() {
    while (idx < items.length) {
      const current = items[idx++]
      const result = await worker(current)
      if (result.ok) {
        okCount++
      } else {
        failures.push(result)
      }
      if ((okCount + failures.length) % 200 === 0) {
        console.log(`进度 ${okCount + failures.length}/${items.length}`)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, next))
  return { okCount, failures }
}

// artists 集合就是把 performers 字段(用 / 分隔多个艺人)拆开去重，
// 给"关注艺人"那个搜索建议用，不用自定义 doc id(艺人名可能带一些
// doc id 不允许的字符)，改成"先查一遍已有的名字，只 add() 没见过的"，
// 避免重复插入
async function syncArtists(records) {
  const nameSet = new Set()
  for (const r of records) {
    if (!r.performers) continue
    for (const raw of r.performers.split('/')) {
      const name = raw.trim()
      if (name) nameSet.add(name)
    }
  }

  const existing = new Set()
  const PAGE_SIZE = 1000
  let skip = 0
  try {
    while (true) {
      const res = await db.collection('artists').skip(skip).limit(PAGE_SIZE).field({ name: true }).get()
      res.data.forEach((doc) => existing.add(doc.name))
      if (res.data.length < PAGE_SIZE) break
      skip += PAGE_SIZE
    }
  } catch (e) {
    // 集合第一次同步之前根本不存在——add() 会自动建集合，但 get() 不会，
    // 查询一个还没建过的集合会直接报错。当成"目前一个艺人都没有"处理，
    // 后面照常把所有艺人名 add() 进去，集合就自然被建出来了
    if (e.errCode !== -502005) throw e
    console.log('artists 集合还不存在，当作空集合处理(add 会自动建)')
  }

  const toAdd = [...nameSet].filter((name) => !existing.has(name))
  console.log(`艺人名单：共 ${nameSet.size} 个，已有 ${existing.size} 个，新增 ${toAdd.length} 个`)

  const { okCount, failures } = await runPool(
    toAdd,
    async (name) => {
      try {
        await db.collection('artists').add({ data: { name } })
        return { ok: true }
      } catch (e) {
        return { ok: false, id: name, message: e.message }
      }
    },
    CONCURRENCY
  )
  console.log(`艺人名单同步完成：新增成功 ${okCount}，失败 ${failures.length}`)
  if (failures.length > 0) {
    console.log('失败示例(最多显示5条):', failures.slice(0, 5))
  }
}

async function main() {
  const records = JSON.parse(fs.readFileSync(EXPORT_PATH, 'utf-8'))
  console.log(`读到 ${records.length} 条记录，开始同步到云数据库 shows 集合...`)

  const { okCount, failures } = await runPool(records, upsertOne, CONCURRENCY)

  console.log(`同步完成：成功 ${okCount}，失败 ${failures.length}`)
  if (failures.length > 0) {
    console.log('失败示例(最多显示5条):', failures.slice(0, 5))
  }

  await syncArtists(records)
}

main().catch((e) => {
  console.error('同步脚本出错:', e)
  process.exit(1)
})
