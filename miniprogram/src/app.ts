import { PropsWithChildren } from 'react'
import Taro, { useLaunch } from '@tarojs/taro'

import './app.scss'

// TODO: 开通云开发之后，把这里换成真实的环境 ID(在云开发控制台首页能看到)
const CLOUD_ENV_ID = 'REPLACE_WITH_REAL_ENV_ID'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    Taro.cloud.init({ env: CLOUD_ENV_ID, traceUser: true })
  })

  // children 是将要会渲染的页面
  return children
}

export default App
