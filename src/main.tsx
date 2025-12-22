import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { RouterProvider, createRouter, createRootRoute, createRoute, redirect } from '@tanstack/react-router'
import { Root } from './routes/Root'
import { AuthCallback } from './routes/AuthCallback'
import { UploadTab, VariablesTab, FillOutTab, ReviewTab } from './components/tabs'
import { TabLayout } from './components/TabLayout'

const rootRoute = createRootRoute({
  component: Root,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/upload' })
  },
})

const uploadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/upload',
  component: function UploadPage() {
    return <TabLayout><UploadTab /></TabLayout>
  },
})

const variablesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/variables',
  component: function VariablesPage() {
    return <TabLayout><VariablesTab /></TabLayout>
  },
})

const filloutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/fillout',
  component: function FillOutPage() {
    return <TabLayout><FillOutTab /></TabLayout>
  },
})

const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/review',
  component: function ReviewPage() {
    return <TabLayout><ReviewTab /></TabLayout>
  },
})

const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/callback',
  component: AuthCallback,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  uploadRoute,
  variablesRoute,
  filloutRoute,
  reviewRoute,
  authCallbackRoute,
])

const router = createRouter({
  routeTree,
  basepath: '/commons-uploader',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.querySelector('#root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
