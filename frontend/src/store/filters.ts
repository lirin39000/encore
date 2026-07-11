import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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

export const useFiltersStore = create<FiltersState>()(
  persist(
    (set) => ({
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
    }),
    {
      // 只存"城市/档期/价位"这三个真正的筛选条件，不存 scope/sortBy 这类跟当前浏览行为更相关的状态
      name: 'encore-filters',
      partialize: (s) => ({ cityNames: s.cityNames, freeWeekdays: s.freeWeekdays, maxPrice: s.maxPrice }),
    },
  ),
)
