import { Outlet } from 'react-router-dom'
import { useLocation } from 'react-router-dom'
import PublicHeader from './PublicHeader'
import PublicFooter from './PublicFooter'

export default function PublicLayout() {
  const { pathname } = useLocation()
  const isVehiclesListingPage = pathname === '/vehicles'

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F5F5] text-[#1F2937]">
      <PublicHeader />
      <main className={`mx-auto w-full max-w-7xl flex-1 px-4 ${isVehiclesListingPage ? 'pt-6 pb-8' : 'py-8'} sm:px-6 lg:px-8`}>
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  )
}