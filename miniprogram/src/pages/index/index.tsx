import { useState } from 'react'
import Taro, { useLoad } from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import { apiGet } from '../../api/client'
import './index.scss'

interface Show {
  id: number
  title: string
  performers: string | null
  price: string | null
  show_time: string | null
  weekday: number | null
  site_name: string | null
  city_name: string | null
  sold_out: number | null
  poster_url: string | null
}

interface ShowListResponse {
  total: number
  results: Show[]
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

export default function Index() {
  const [shows, setShows] = useState<Show[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useLoad(() => {
    apiGet<ShowListResponse>('/shows?page=1&page_size=20&scope=all&sort=time')
      .then((res) => setShows(res.results))
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false))
  })

  return (
    <View className='index'>
      {loading && <Text className='status'>加载中...</Text>}
      {error && <Text className='status'>{error}</Text>}
      {!loading && !error && shows.length === 0 && <Text className='status'>暂无演出</Text>}
      {shows.map((show) => (
        <View key={show.id} className='card'>
          {show.poster_url && <Image className='poster' src={show.poster_url} mode='aspectFill' />}
          <View className='info'>
            <Text className='title'>{show.title}</Text>
            <Text className='sub'>{show.performers || '艺人待定'}</Text>
            <Text className='sub'>
              {show.show_time}
              {show.weekday !== null ? ` 周${WEEKDAY_LABELS[show.weekday]}` : ''}
            </Text>
            <Text className='sub'>{show.site_name} · {show.city_name}</Text>
            <Text className='price'>{show.price}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}
