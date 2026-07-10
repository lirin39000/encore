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
  return useMutation({
    mutationFn: (artistName: string) => apiPost('/me/followed-artists', { artist_name: artistName }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'followed-artists'] }),
  })
}

export function useRemoveFollowedArtist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (artistName: string) => apiDelete(`/me/followed-artists/${encodeURIComponent(artistName)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'followed-artists'] }),
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
  return useMutation({
    mutationFn: ({ showId, isFavorite }: { showId: number; isFavorite: boolean }) =>
      isFavorite ? apiDelete(`/me/favorites/${showId}`) : apiPost(`/me/favorites/${showId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'favorites'] }),
  })
}
