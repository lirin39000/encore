export interface Show {
  id: number
  title: string
  performers: string | null
  price: string | null
  price_min: number | null
  show_time: string | null
  weekday: number | null // 0=周一 ... 6=周日，跟后端 Python datetime.weekday() 对齐
  site_name: string | null
  city_name: string | null
  sold_out: number | null
  poster_url: string | null
  venue_id: number | null
}

export interface ShowListResponse {
  page: number
  page_size: number
  total: number
  results: Show[]
}

export interface VenueReview {
  id: number
  rating: number
  text: string
  created_at: string
  nickname: string
}

export interface VenueDetail {
  id: number
  name: string
  city_name: string
  lat: number | null
  lng: number | null
  formatted_address: string | null
  rating_avg: number | null
  review_count: number
  upcoming_shows: Show[]
}
