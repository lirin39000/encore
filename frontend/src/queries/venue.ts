import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '../api/client'
import type { VenueDetail, VenueReview } from '../api/types'

export function useVenueDetail(venueId: number) {
  return useQuery({
    queryKey: ['venue', venueId],
    queryFn: () => apiGet<VenueDetail>(`/venues/${venueId}`),
    enabled: !!venueId,
  })
}

export function useVenueReviews(venueId: number) {
  return useQuery({
    queryKey: ['venue-reviews', venueId],
    queryFn: () => apiGet<{ results: VenueReview[] }>(`/venues/${venueId}/reviews`),
    enabled: !!venueId,
  })
}

export function useSubmitVenueReview(venueId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { rating: number; text: string }) => apiPost(`/venues/${venueId}/reviews`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['venue-reviews', venueId] })
      qc.invalidateQueries({ queryKey: ['venue', venueId] })
    },
  })
}
