import { TabNavigation } from './TabNavigation';

interface TabLayoutProperties {
  children: React.ReactNode;
}

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
