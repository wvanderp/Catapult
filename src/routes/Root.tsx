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
    <div className="relative flex min-h-screen flex-col bg-zinc-950 font-sans text-zinc-300 antialiased">
      <Header />
      <main className="relative z-0 flex-grow">
        <Outlet />
      </main>
      <Footer />
      <SettingsSidebar />
      <TanStackRouterDevtools />
    </div>
  )
}

