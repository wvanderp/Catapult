import { Outlet } from '@tanstack/react-router'
import { Header } from '../components/Header'
import { SettingsSidebar } from '../components/SettingsSidebar'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

/**
 * Root component serves as the main layout wrapper for the application.
 * Includes the header, settings sidebar, router outlet, and dev tools.
 *
 * @returns The root layout component
 */
export function Root() {
  return (
    <div className="min-h-screen bg-zinc-900 font-sans text-gray-300">
      <Header />
      <Outlet />
      <SettingsSidebar />
      <TanStackRouterDevtools />
    </div>
  )
}
