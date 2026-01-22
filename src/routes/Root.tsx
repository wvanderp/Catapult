import { Outlet } from '@tanstack/react-router'
import { Header } from '../components/Header'
import { SettingsSidebar } from '../components/SettingsSidebar'
import { Footer } from '../components/Footer'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

/**
 * Root component serves as the main layout wrapper for the application.
 * Includes the header, settings sidebar, router outlet, footer, and dev tools.
 *
 * @returns The root layout component
 */
export function Root() {
  return (
    <div className="min-h-screen bg-zinc-900 font-sans text-gray-300 flex flex-col">
      <Header />
      <div className="flex-grow">
        <Outlet />
      </div>
      <Footer />
      <SettingsSidebar />
      <TanStackRouterDevtools />
    </div>
  )
}
