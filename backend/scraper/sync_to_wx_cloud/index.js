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

  // 之前这里以为"add() 会自动建集合"，所以只在 get() 报 -502005 时忽略错误就往下走。
  // 微信云数据库并不是这样：往一个不存在的集合 add() 同样会报 -502005，集合永远建不出来
  // (artists 集合一直没出现在控制台里，就是这个原因)。改成显式创建，已存在时会报
  // -501001 集合已存在，忽略掉即可
  try {
    await db.createCollection('artists')
    console.log('artists 集合不存在，已创建')
  } catch (e) {
    if (e.errCode !== -501001) throw e
  }

  const existing = new Set()
  const PAGE_SIZE = 1000
  let skip = 0
  while (true) {
    const res = await db.collection('artists').skip(skip).limit(PAGE_SIZE).field({ name: true }).get()
    res.data.forEach((doc) => existing.add(doc.name))
    if (res.data.length < PAGE_SIZE) break
    skip += PAGE_SIZE
  }

  const toAdd = [...nameSet].filter((name) => !existing.has(name))
  console.log(`艺人名单：共 ${nameSet.size} 个，已有 ${existing.size} 个，新增 ${toAdd.length} 个`)

  if (toAdd.length === 0) return

  // 第一条仍然单独顺序写：集合刚创建出来时立刻打 20 个并发进去偶尔会撞上
  // "集合还没就绪"，先用一条探个路，失败了也能报出更清楚的错
  const [firstName, ...restNames] = toAdd
  try {
    await db.collection('artists').add({ data: { name: firstName } })
  } catch (e) {
    console.error(`写入 artists 集合失败(第一条 add 就没成功): ${e.message}`)
    throw e
  }

  const { okCount, failures } = await runPool(
    restNames,
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
  console.log(`艺人名单同步完成：新增成功 ${okCount + 1}，失败 ${failures.length}`)
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
