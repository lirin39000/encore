import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '../api/client'
import type { Show } from '../api/types'

interface FollowedArtist {
  id: number
  artist_name: string
}

export function useFollowedArtists(enabled: boolean) {
  return useQuery({
    queryKey: ['me', 'followed-artists'],
    queryFn: () => apiGet<{ results: FollowedArtist[] }>('/me/followed-artists'),
    enabled,
  })
}

export function useAddFollowedArtist() {
  const qc = useQueryClient()
  const key = ['me', 'followed-artists']
  return useMutation({
    mutationFn: (artistName: string) => apiPost('/me/followed-artists', { artist_name: artistName }),
    // 服务器在国外、数据库在另一个国家，一来一回的网络延迟躲不掉，用乐观更新让"添加"看起来是瞬间完成的：
    // 先把艺人塞进本地列表，请求真正返回后再用服务器数据校正(失败就撤回)
    onMutate: async (artistName: string) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<{ results: FollowedArtist[] }>(key)
      qc.setQueryData<{ results: FollowedArtist[] }>(key, (old) => ({
        results: [{ id: -Date.now(), artist_name: artistName }, ...(old?.results ?? [])],
      }))
      return { previous }
    },
    onError: (_err, _artistName, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useRemoveFollowedArtist() {
  const qc = useQueryClient()
  const key = ['me', 'followed-artists']
  return useMutation({
    mutationFn: (artistName: string) => apiDelete(`/me/followed-artists/${encodeURIComponent(artistName)}`),
    onMutate: async (artistName: string) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<{ results: FollowedArtist[] }>(key)
      qc.setQueryData<{ results: FollowedArtist[] }>(key, (old) => ({
        results: (old?.results ?? []).filter((a) => a.artist_name !== artistName),
      }))
      return { previous }
    },
    onError: (_err, _artistName, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useFavorites(enabled: boolean) {
  return useQuery({
    queryKey: ['me', 'favorites'],
    queryFn: () => apiGet<{ results: Show[] }>('/me/favorites'),
    enabled,
  })
}

export function useToggleFavorite() {
  const qc = useQueryClient()
  const key = ['me', 'favorites']
  return useMutation({
    mutationFn: ({ show, isFavorite }: { show: Show; isFavorite: boolean }) =>
      isFavorite ? apiDelete(`/me/favorites/${show.id}`) : apiPost(`/me/favorites/${show.id}`),
    onMutate: async ({ show, isFavorite }: { show: Show; isFavorite: boolean }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<{ results: Show[] }>(key)
      qc.setQueryData<{ results: Show[] }>(key, (old) => {
        const results = old?.results ?? []
        return { results: isFavorite ? results.filter((s) => s.id !== show.id) : [show, ...results] }
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}
