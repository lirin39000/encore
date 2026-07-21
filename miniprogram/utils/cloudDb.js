// 微信云数据库客户端单次 .get() 最多返回 20 条，不管 .limit() 写多大都会被砍到 20。
// 想一次拿全一个集合（关注艺人、收藏等）时必须自己翻页：每次拿 20 条，循环到拿完为止。
//
// makeQuery 是个"每次都返回一条新查询"的函数，比如：
//   getAll(() => db.collection('followed_artists').orderBy('created_at', 'desc'))
// 每轮在它后面接 .skip().limit().get()，所以传函数而不是查询对象，避免复用同一个对象出问题。

const PAGE = 20 // 微信客户端硬上限，写大了也没用

async function getAll(makeQuery) {
  const all = []
  let skip = 0
  // 加个保险上限，万一某个集合特别大，避免真出问题时无限翻页（20*100=2000 条足够个人数据）
  for (let i = 0; i < 100; i++) {
    const res = await makeQuery().skip(skip).limit(PAGE).get()
    all.push(...res.data)
    if (res.data.length < PAGE) break
    skip += PAGE
  }
  return all
}

module.exports = { getAll }
