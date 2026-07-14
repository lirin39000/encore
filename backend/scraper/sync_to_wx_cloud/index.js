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

async function main() {
  const records = JSON.parse(fs.readFileSync(EXPORT_PATH, 'utf-8'))
  console.log(`读到 ${records.length} 条记录，开始同步到云数据库 shows 集合...`)

  const { okCount, failures } = await runPool(records, upsertOne, CONCURRENCY)

  console.log(`同步完成：成功 ${okCount}，失败 ${failures.length}`)
  if (failures.length > 0) {
    console.log('失败示例(最多显示5条):', failures.slice(0, 5))
  }
}

main().catch((e) => {
  console.error('同步脚本出错:', e)
  process.exit(1)
})
