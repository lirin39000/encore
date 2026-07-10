import { create } from 'zustand'

export type SortBy = 'time' | 'price'
export type Scope = 'followed' | 'all'

interface FiltersState {
  scope: Scope
  sortBy: SortBy
  cityNames: string[]
  freeWeekdays: number[] // 0=周一 ... 6=周日，跟后端 Python datetime.weekday() 对齐
  maxPrice: number

  setScope: (scope: Scope) => void
  setSortBy: (sortBy: SortBy) => void
  addCity: (cityName: string) => void
  removeCity: (cityName: string) => void
  clearCities: () => void
  toggleWeekday: (day: number) => void
  setMaxPrice: (price: number) => void
}

export const MAX_PRICE_CEILING = 800

export const useFiltersStore = create<FiltersState>((set) => ({
  scope: 'all',
  sortBy: 'time',
  cityNames: [],
  freeWeekdays: [],
  maxPrice: MAX_PRICE_CEILING,

  setScope: (scope) => set({ scope }),
  setSortBy: (sortBy) => set({ sortBy }),
  addCity: (cityName) =>
    set((s) => (s.cityNames.includes(cityName) ? s : { cityNames: [...s.cityNames, cityName] })),
  removeCity: (cityName) => set((s) => ({ cityNames: s.cityNames.filter((c) => c !== cityName) })),
  clearCities: () => set({ cityNames: [] }),
  toggleWeekday: (day) =>
    set((s) => ({
      freeWeekdays: s.freeWeekdays.includes(day)
        ? s.freeWeekdays.filter((d) => d !== day)
        : [...s.freeWeekdays, day],
    })),
  setMaxPrice: (price) => set({ maxPrice: price }),
}))
