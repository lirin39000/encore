// 小程序在国内网络下直连 Railway(美国)的后端经常连不上——之前网页版在国内实测过
// 需要科学上网才能加载。云函数跑在腾讯的国内机房，小程序调用云函数肯定能连上；
// 云函数这边再由服务器对服务器的方式去请求 Railway，数据中心之间的连接通常比
// "国内手机直连国外服务器"稳定得多。这个云函数就是个纯粹的转发中转站，
// 不存任何数据，后端接口逻辑完全没变，还是同一套 Railway + Supabase。
const https = require('https')
const cloud = require('wx-server-sdk')

cloud.init()

const BACKEND_HOST = 'encore-production-9222.up.railway.app'

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
  const proxySecret = process.env.WX_PROXY_SECRET

  // 部署自检。排查 401 时要区分三种情况：云函数还是旧代码、环境变量没配、openid 拿不到。
  // 只回报"有没有"，不回报密钥本身。旧版本没有这个分支，会把 __diag 当成后端路径去请求
  // 然后拿到 404——所以这个入口本身就能证明部署有没有生效
  if (path === '__diag') {
    return {
      statusCode: 200,
      data: {
        version: 'with-openid-auth',
        hasOpenid: Boolean(OPENID),
        hasSecret: Boolean(proxySecret),
        secretLength: proxySecret ? proxySecret.length : 0,
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
