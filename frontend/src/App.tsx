import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { theme, fontSerif } from './theme/theme'
import Home from './pages/Home'
import Venue from './pages/Venue'
import Mine from './pages/Mine'
import BottomNav from './components/BottomNav'
import LoginModal from './components/LoginModal'
import { useAuthStore } from './store/auth'

const queryClient = new QueryClient()

function App() {
  const loginModalOpen = useAuthStore((s) => s.loginModalOpen)
  const closeLoginModal = useAuthStore((s) => s.closeLoginModal)

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div
          style={{
            minHeight: '100vh',
            background: theme.bg,
            color: theme.text,
            fontFamily: fontSerif,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ flex: 1, overflowX: 'hidden' }}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/venue/:id" element={<Venue />} />
              <Route path="/mine" element={<Mine />} />
            </Routes>
          </div>
          <BottomNav />
        </div>
        {loginModalOpen && <LoginModal onClose={closeLoginModal} />}
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
