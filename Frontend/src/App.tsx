import { AuthProvider } from './context/AuthProvider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppRouter from './routes/AppRouter'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App