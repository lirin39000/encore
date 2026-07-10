import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: number
  phone: string
  nickname: string
}

interface AuthState {
  token: string | null
  user: User | null
  loginModalOpen: boolean
  login: (token: string, user: User) => void
  logout: () => void
  openLoginModal: () => void
  closeLoginModal: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      loginModalOpen: false,
      login: (token, user) => set({ token, user, loginModalOpen: false }),
      logout: () => set({ token: null, user: null }),
      openLoginModal: () => set({ loginModalOpen: true }),
      closeLoginModal: () => set({ loginModalOpen: false }),
    }),
    { name: 'encore-auth', partialize: (s) => ({ token: s.token, user: s.user }) },
  ),
)
