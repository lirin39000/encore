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
// 反向同步(小程序关注艺人 -> Postgres)用。没设置时跳过那一步，不影响前面的同步
const DATABASE_URL = process.env.DATABASE_URL
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

// 反向同步：把小程序用户的关注艺人从云数据库镜像进 Postgres。
//
// 为什么要这么做：小程序没有登录，用户身份是微信的 openid，关注艺人存在云数据库里；
// 而每天的邮件推送任务读的是 Postgres。两边本来完全不相交，小程序用户订阅了邮件也
// 匹配不到任何演出。镜像之后推送任务一行都不用改，它只是发现用户变多了。
//
// 方向是单向的(云数据库 -> Postgres)，云数据库始终是小程序关注列表的唯一真相来源，
// Postgres 这份只是给推送任务读的副本，所以每次都整份替换而不是增量合并。
async function mirrorFollowedArtists() {
  if (!DATABASE_URL) {
    console.log('没有 DATABASE_URL，跳过关注艺人镜像(小程序用户不会收到邮件提醒)')
    return
  }

  const byOpenid = new Map()
  const PAGE_SIZE = 1000
  let skip = 0
  try {
    while (true) {
      const res = await db.collection('followed_artists').skip(skip).limit(PAGE_SIZE).get()
      for (const doc of res.data) {
        // 服务端 SDK 是管理员权限，读得到所有人的记录；_openid 是微信写进去的，
        // 客户端伪造不了，可以直接当身份用
        if (!doc._openid || !doc.artist_name) continue
        if (!byOpenid.has(doc._openid)) byOpenid.set(doc._openid, [])
        byOpenid.get(doc._openid).push(doc.artist_name)
      }
      if (res.data.length < PAGE_SIZE) break
      skip += PAGE_SIZE
    }
  } catch (e) {
    if (e.errCode === -502005) {
      console.log('followed_artists 集合还不存在，没有小程序用户关注过艺人，跳过')
      return
    }
    throw e
  }

  if (byOpenid.size === 0) {
    console.log('云数据库里没有小程序用户的关注记录，跳过镜像')
    return
  }

  await writeFollowsToPostgres(byOpenid)
}

// 单独拆出来是为了能脱离微信云数据库测试：本地没有腾讯云凭证时读不了云数据库，
// 但可以直接喂一个假的 openid -> 艺人名 映射进来，验证 Postgres 这半的写入逻辑
async function writeFollowsToPostgres(byOpenid) {
  const { Client } = require('pg')
  const client = new Client({
    connectionString: DATABASE_URL,
    // Supabase 强制 SSL，但用的是它自己的证书链，Node 默认验不过
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  let userCount = 0
  let rowCount = 0
  try {
    for (const [openid, names] of byOpenid) {
      const unique = [...new Set(names)]
      // 整个用户的替换放在一个事务里：万一中途失败，不会留下"关注列表被清空"的状态
      await client.query('BEGIN')
      try {
        await client.query(
          `INSERT INTO users (openid, nickname, created_at) VALUES ($1, '', $2)
           ON CONFLICT (openid) DO NOTHING`,
          [openid, new Date().toISOString()]
        )
        const { rows } = await client.query('SELECT id FROM users WHERE openid = $1', [openid])
        const userId = rows[0].id
        await client.query('DELETE FROM followed_artists WHERE user_id = $1', [userId])
        for (const name of unique) {
          await client.query(
            `INSERT INTO followed_artists (user_id, artist_name, created_at)
             VALUES ($1, $2, $3)`,
            [userId, name, new Date().toISOString()]
          )
        }
        await client.query('COMMIT')
        userCount += 1
        rowCount += unique.length
      } catch (e) {
        await client.query('ROLLBACK')
        console.error(`  镜像 openid=${openid.slice(0, 8)}... 失败，跳过: ${e.message}`)
      }
    }
  } finally {
    await client.end()
  }
  console.log(`关注艺人镜像完成：${userCount} 个小程序用户，共 ${rowCount} 条关注`)
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
  await mirrorFollowedArtists()
}

// 只有直接 `node index.js` 时才跑，被 require 进来时不跑——这样测试脚本可以单独
// 调用下面导出的函数，不会顺带触发整轮同步
if (require.main === module) {
  main().catch((e) => {
    console.error('同步脚本出错:', e)
    process.exit(1)
  })
}

module.exports = { writeFollowsToPostgres }
