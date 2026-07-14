// 小程序在国内网络下直连 Railway(美国)的后端经常连不上——之前网页版在国内实测过
// 需要科学上网才能加载。云函数跑在腾讯的国内机房，小程序调用云函数肯定能连上；
// 云函数这边再由服务器对服务器的方式去请求 Railway，数据中心之间的连接通常比
// "国内手机直连国外服务器"稳定得多。这个云函数就是个纯粹的转发中转站，
// 不存任何数据，后端接口逻辑完全没变，还是同一套 Railway + Supabase。
const https = require('https')
const cloud = require('wx-server-sdk')

cloud.init()

const BACKEND_HOST = 'encore-production-9222.up.railway.app'

exports.main = async (event) => {
  const { path = '/', method = 'GET', body, headers = {} } = event

  return new Promise((resolve) => {
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined

    const req = https.request(
      {
        hostname: BACKEND_HOST,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
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
