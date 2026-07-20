// 通过 apiProxy 云函数访问后端。
//
// 为什么不直接 wx.request 打后端：Railway 在美国，国内网络直连经常连不上
// (网页版在国内实测过要科学上网)。云函数跑在腾讯的国内机房，小程序调云函数一定通，
// 云函数再服务器对服务器地请求 Railway，稳定得多。
//
// 身份不用在这里管：云函数会把微信验证过的 openid 和共享密钥加进请求头，
// 后端据此认人。这边传的任何认证头都会被云函数丢掉，传了也没用。

function call(path, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'apiProxy',
      data: { path, method, body },
      success: (res) => {
        const result = res.result || {}
        if (result.statusCode === 0) {
          // 云函数自己没连上后端，跟"后端返回了错误"不是一回事，分开报
          reject(new Error(result.error || '网络连接失败'))
          return
        }
        if (result.statusCode >= 400) {
          const detail = result.data && result.data.detail
          reject(new Error(detail || `请求失败: ${result.statusCode}`))
          return
        }
        resolve(result.data)
      },
      fail: (err) => reject(new Error(err.errMsg || '云函数调用失败')),
    })
  })
}

module.exports = {
  apiGet: (path) => call(path, 'GET'),
  apiPost: (path, body) => call(path, 'POST', body),
  apiPut: (path, body) => call(path, 'PUT', body),
  apiDelete: (path) => call(path, 'DELETE'),
}
