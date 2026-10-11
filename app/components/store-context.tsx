import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useFetcher, useRouteLoaderData } from "react-router";
import { experienceOf } from "../content/experience";
import { findVariant } from "../content/fixtures";
import { type CartLine, normalizeCart } from "../domain/demo-cart";
import type { loader as rootLoader } from "../root";
import { useContent } from "./content-context";

interface StoreState {
  lines: CartLine[];
  ready: boolean;
  notice: string;
  favorites: string[];
  recentlyViewed: string[];
  markViewed: (id: string) => void;
  add: (variantId: string, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  toggleFavorite: (productId: string) => void;
}
const StoreContext = createContext<StoreState | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const content = useContent();
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const activity = useFetcher();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);
  const markViewed = useCallback(
    (id: string) =>
      setRecentlyViewed((current) =>
        current[0] === id
          ? current
          : [id, ...current.filter((x) => x !== id)].slice(0, 20),
      ),
    [],
  );
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    try {
      setLines(
        normalizeCart(
          JSON.parse(localStorage.getItem("hubby-demo-cart-v1") ?? "[]"),
          content,
        ),
      );
      const saved: unknown = JSON.parse(
        localStorage.getItem("hubby-demo-favorites-v1") ?? "[]",
      );
      const viewed: unknown = JSON.parse(
        localStorage.getItem("hubby-demo-recent-v1") ?? "[]",
      );
      if (Array.isArray(viewed))
        setRecentlyViewed(
          viewed
            .filter(
              (id): id is string =>
                typeof id === "string" &&
                content.products.some((p) => p.id === id),
            )
            .slice(0, 20),
        );
      if (Array.isArray(saved))
        setFavorites(
          saved
            .filter(
              (id): id is string =>
                typeof id === "string" &&
                content.products.some((product) => product.id === id),
            )
            .slice(0, 20),
        );
    } catch {
      /* Invalid or inaccessible browser storage starts an empty demo cart. */
    }
    setReady(true);
  }, [content]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem("hubby-demo-cart-v1", JSON.stringify(lines));
      localStorage.setItem(
        "hubby-demo-recent-v1",
        JSON.stringify(recentlyViewed),
      );
      localStorage.setItem(
        "hubby-demo-favorites-v1",
        JSON.stringify(favorites),
      );
    } catch {
      /* Cart still works in memory when browser storage is unavailable. */
    }
  }, [lines, favorites, recentlyViewed, ready]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  function add(variantId: string, quantity = 1) {
    const found = findVariant(variantId, content);
    if (!found || found.variant.stock < 1) {
      setNotice("Gói này hiện đã hết hàng.");
      return;
    }
    setLines((current) =>
      normalizeCart([...current, { variantId, quantity }], content),
    );
    setNotice(`Đã thêm ${found.product.name} vào giỏ hàng.`);
    if (quantity > 0 && experienceOf(content).activityNotifications !== false)
      activity.submit(
        { csrf: root?.csrf ?? "", key: crypto.randomUUID(), variantId },
        { method: "post", action: "/activity" },
      );
  }
  function setQuantity(variantId: string, quantity: number) {
    setLines((current) =>
      normalizeCart(
        current.map((line) =>
          line.variantId === variantId ? { ...line, quantity } : line,
        ),
        content,
      ),
    );
  }
  function toggleFavorite(productId: string) {
    setFavorites((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }
  return (
    <StoreContext.Provider
      value={{
        lines,
        ready,
        notice,
        favorites,
        recentlyViewed,
        markViewed,
        add,
        setQuantity,
        toggleFavorite,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const state = useContext(StoreContext);
  if (!state) throw new Error("StoreProvider missing");
  return state;
}
