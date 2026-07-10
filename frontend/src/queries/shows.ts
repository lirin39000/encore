import { useInfiniteQuery } from '@tanstack/react-query'
import { apiGet } from '../api/client'
import type { ShowListResponse } from '../api/types'
import { useFiltersStore } from '../store/filters'

const PAGE_SIZE = 30

export function useInfiniteShows(q = '') {
  const { scope, sortBy, cityNames, freeWeekdays, maxPrice } = useFiltersStore()

  const buildParams = (page: number) => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('page_size', String(PAGE_SIZE))
    params.set('scope', scope)
    params.set('sort', sortBy)
    if (maxPrice) params.set('max_price', String(maxPrice))
    if (freeWeekdays.length > 0) params.set('weekdays', freeWeekdays.join(','))
    if (q.trim()) params.set('q', q.trim())
    if (cityNames.length > 0) params.set('cities', cityNames.join(','))
    return params
  }

  return useInfiniteQuery({
    queryKey: ['shows', scope, sortBy, cityNames, freeWeekdays, maxPrice, q],
    queryFn: ({ pageParam }) => apiGet<ShowListResponse>(`/shows?${buildParams(pageParam).toString()}`),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.page_size < lastPage.total ? lastPage.page + 1 : undefined,
  })
}
