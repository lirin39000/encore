import { PropsWithChildren } from 'react'
import Taro, { useLaunch } from '@tarojs/taro'

import './app.scss'

const CLOUD_ENV_ID = 'cloud1-d9gwsf1jq9b490005'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    Taro.cloud.init({ env: CLOUD_ENV_ID, traceUser: true })
  })

  // children 是将要会渲染的页面
  return children
}

export default App
