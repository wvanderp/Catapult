import { TabNavigation } from './TabNavigation';

interface TabLayoutProperties {
  children: React.ReactNode;
}

/**
 * TabLayout wraps page content with the tab navigation header.
 * Provides consistent layout structure with navigation and centered content.
 *
 * @param props - Component props
 * @param props.children - Content to render below the navigation
 * @returns The tab layout component
 */
export function TabLayout({ children }: TabLayoutProperties) {
  return (
    <>
      <TabNavigation />
      <main className="mx-auto max-w-5xl px-6 pb-12">
        {children}
      </main>
    </>
  );
}
