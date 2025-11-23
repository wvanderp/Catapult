import { Outlet } from '@tanstack/react-router'
import { Header } from '../components/Header'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

export function Root() {
  return (
    <div className="min-h-screen bg-zinc-900 text-gray-300 font-sans">
      <Header />
      <Outlet />
      <TanStackRouterDevtools />
    </div>
  )
}
