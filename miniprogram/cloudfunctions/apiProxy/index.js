// 小程序在国内网络下直连 Railway(美国)的后端经常连不上——之前网页版在国内实测过
// 需要科学上网才能加载。云函数跑在腾讯的国内机房，小程序调用云函数肯定能连上；
// 云函数这边再由服务器对服务器的方式去请求 Railway，数据中心之间的连接通常比
// "国内手机直连国外服务器"稳定得多。这个云函数就是个纯粹的转发中转站，
// 不存任何数据，后端接口逻辑完全没变，还是同一套 Railway + Supabase。
const https = require('https')
const cloud = require('wx-server-sdk')

cloud.init()
const db = cloud.database()

const BACKEND_HOST = 'encore-production-9222.up.railway.app'

// 密钥存在云数据库的一条记录里，不用云函数的环境变量。
//
// 本来是想用环境变量的，但微信云开发控制台那个入口很难找、智能助手写不进去、
// 重新部署还可能把配好的值冲掉——试了几次都没成。数据库这条路稳定得多：界面好找，
// 部署不影响，改密钥就是改一条记录。
//
// 这个集合的权限必须设成"仅管理端可读写"，否则小程序端能把密钥读出来，
// 拿着它就可以绕过云函数直接冒充任意用户调后端。
const SECRET_COLLECTION = 'server_config'
const SECRET_KEY = 'wx_proxy_secret'

// 同一个函数实例只读一次。云函数实例会被复用几分钟到几十分钟，
// 每次请求都查库纯属浪费(而且这个值几乎不变)
let cachedSecret = null

async function getProxySecret() {
  if (cachedSecret !== null) return cachedSecret
  // 环境变量优先：以后微信那边的入口要是好用了，直接配上就会盖过数据库里的值
  if (process.env.WX_PROXY_SECRET) {
    cachedSecret = { value: process.env.WX_PROXY_SECRET, source: 'env' }
    return cachedSecret
  }
  try {
    const res = await db.collection(SECRET_COLLECTION).where({ key: SECRET_KEY }).limit(1).get()
    cachedSecret = res.data.length
      ? { value: String(res.data[0].value || '').trim(), source: 'db' }
      : { value: '', source: 'db-empty' }
  } catch (e) {
    // 集合不存在或没权限，都当成"没配"，让后端按未登录处理，而不是抛错
    cachedSecret = { value: '', source: 'db-error:' + (e.errCode || e.message) }
  }
  return cachedSecret
}

// 后端认身份用的两个头。云函数必须自己填，而且要丢掉调用方传来的同名头——
// event.headers 是小程序端能完全控制的内容，如果原样转发出去，任何人都能塞一个
// 别人的 openid 让云函数替他签发，密钥就形同虚设(云函数会老老实实带上正确的密钥)
const OPENID_HEADER = 'X-WX-Openid'
const SECRET_HEADER = 'X-Proxy-Secret'

function stripAuthHeaders(headers) {
  const out = {}
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase()
    if (lower === OPENID_HEADER.toLowerCase() || lower === SECRET_HEADER.toLowerCase()) continue
    out[k] = v
  }
  return out
}

exports.main = async (event) => {
  const { path = '/', method = 'GET', body, headers = {} } = event

  // 微信保证这个 openid 是真的，客户端伪造不了
  const { OPENID } = cloud.getWXContext()
  const secret = await getProxySecret()
  const proxySecret = secret.value

  // 部署自检。排查 401 时要区分三种情况：云函数还是旧代码、环境变量没配、openid 拿不到。
  // 只回报"有没有"，不回报密钥本身。旧版本没有这个分支，会把 __diag 当成后端路径去请求
  // 然后拿到 404——所以这个入口本身就能证明部署有没有生效
  if (path === '__diag') {
    return {
      statusCode: 200,
      data: {
        version: 'secret-from-db',
        hasOpenid: Boolean(OPENID),
        hasSecret: Boolean(proxySecret),
        secretLength: proxySecret ? proxySecret.length : 0,
        // 密钥是从环境变量还是数据库拿到的，以及拿失败时的原因
        secretSource: secret.source,
      },
    }
  }

  return new Promise((resolve) => {
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined

    const req = https.request(
      {
        hostname: BACKEND_HOST,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...stripAuthHeaders(headers),
          // 放在展开之后，确保覆盖而不是被覆盖
          ...(OPENID && proxySecret
            ? { [OPENID_HEADER]: OPENID, [SECRET_HEADER]: proxySecret }
            : {}),
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        },
      },
      (res) => {
        let raw = ''
        res.on('data', (chunk) => {
          raw += chunk
        })
        res.on('end', () => {
          let data
          try {
            data = JSON.parse(raw)
          } catch (e) {
            data = raw
          }
          resolve({ statusCode: res.statusCode, data })
        })
      }
    )

    req.on('error', (err) => {
      resolve({ statusCode: 0, error: err.message })
    })

    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}
