// 通过 apiProxy 云函数访问后端。
//
// 为什么不直接 wx.request 打后端：Railway 在美国，国内网络直连经常连不上
// (网页版在国内实测过要科学上网)。云函数跑在腾讯的国内机房，小程序调云函数一定通，
// 云函数再服务器对服务器地请求 Railway，稳定得多。
//
// 身份不用在这里管：云函数会把微信验证过的 openid 和共享密钥加进请求头，
// 后端据此认人。这边传的任何认证头都会被云函数丢掉，传了也没用。

function call(path, method = 'GET', body, _retried = false) {
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
        if (result.statusCode === 401) {
          // 后端那句"请先登录"是给网页版用的，小程序压根没有登录这回事。
          // 这里出 401 说明是配置问题(云函数没带上 openid 或密钥不匹配)，
          // 不是用户能自己解决的事，别让人对着一个做不到的提示发愣
          reject(new Error('身份识别失败，请稍后重试'))
          return
        }
        if (result.statusCode >= 400) {
          const detail = result.data && result.data.detail
          reject(new Error(detail || `请求失败: ${result.statusCode}`))
          return
        }
        resolve(result.data)
      },
      // 云函数偶发冷启动/网络抖动会报 -504003 这类错(errMsg 长这样：
      // "cloud.callFunction:fail Error: errCode: -504003")。这种是一次性的，
      // 自动重试一次通常就好了——冷启动那下过去了，第二次调的是热的函数。
      // 重试还失败才对外报错，且只给能看懂的友好文案，绝不把原始报错甩给用户
      fail: (err) => {
        if (!_retried) {
          setTimeout(() => call(path, method, body, true).then(resolve, reject), 400)
          return
        }
        console.error('apiProxy 调用失败:', err.errMsg)
        reject(new Error('网络不太稳定，请稍后重试'))
      },
    })
  })
}

module.exports = {
  apiGet: (path) => call(path, 'GET'),
  apiPost: (path, body) => call(path, 'POST', body),
  apiPut: (path, body) => call(path, 'PUT', body),
  apiDelete: (path) => call(path, 'DELETE'),
}
