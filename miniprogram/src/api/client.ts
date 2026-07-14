import Taro from '@tarojs/taro'

// 小程序直连 Railway 后端在国内网络下不稳定，所有请求都走 apiProxy 这个云函数中转
// (云函数在腾讯的国内机房，小程序调用它肯定能连上；云函数再去请求 Railway，
// 服务器对服务器的连接比"国内手机直连国外服务器"稳定得多)。
interface ProxyResult<T> {
  statusCode: number
  data: T
  error?: string
}

async function callProxy<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await Taro.cloud.callFunction({
    name: 'apiProxy',
    data: { path, method, body },
  })
  const result = res.result as ProxyResult<T>

  if (result.error) {
    throw new Error('网络不稳定，请稍后重试')
  }
  if (result.statusCode >= 400) {
    const data = result.data as { detail?: string; message?: string } | undefined
    throw new Error(data?.detail || data?.message || '请求失败')
  }
  return result.data
}

export const apiGet = <T>(path: string) => callProxy<T>(path, 'GET')
export const apiPost = <T>(path: string, body?: unknown) => callProxy<T>(path, 'POST', body)
export const apiDelete = <T>(path: string) => callProxy<T>(path, 'DELETE')
