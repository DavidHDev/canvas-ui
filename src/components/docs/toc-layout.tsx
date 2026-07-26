"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { TOCMinimap, type TOCItemType } from "./toc-minimap";

interface TOCContextValue {
  items: TOCItemType[];
  setItems: (items: TOCItemType[]) => void;
}

const TOCContext = createContext<TOCContextValue>({
  items: [],
  setItems: () => {},
});

export function useTOC() {
  return useContext(TOCContext);
}

export function TOCLayout({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<TOCItemType[]>([]);

  const contextValue = useMemo(() => ({ items, setItems }), [items, setItems]);

  return (
    <TOCContext.Provider value={contextValue}>
      <main className="flex-1 px-5 py-10 sm:px-8 lg:pt-16 lg:pr-8 lg:pl-72">
        {children}
      </main>
      {items.length > 0 && (
        <aside className="fixed right-[calc(1rem+var(--demo-sbw,0px))] top-50 z-50 hidden xl:block">
          <TOCMinimap items={items} />
        </aside>
      )}
    </TOCContext.Provider>
  );
}

export function TOCSetter({ items }: { items: TOCItemType[] }) {
  const { setItems } = useTOC();

  useEffect(() => {
    setItems(items);
    return () => setItems([]);
  }, [items, setItems]);

  return null;
}
