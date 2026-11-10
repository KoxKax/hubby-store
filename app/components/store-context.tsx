import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useFetcher, useRouteLoaderData } from "react-router";
import { experienceOf } from "../content/experience";
import { findVariant } from "../content/fixtures";
import { parseSavedList, savedProductIds } from "../domain/browser-lists";
import {
  type CartLine,
  normalizeCart,
  planCartAddition,
} from "../domain/demo-cart";
import type { loader as rootLoader } from "../root";
import { useContent } from "./content-context";

interface StoreState {
  lines: CartLine[];
  ready: boolean;
  notice: string;
  favorites: string[];
  recentlyViewed: string[];
  markViewed: (id: string) => void;
  add: (variantId: string, quantity?: number) => boolean;
  setQuantity: (variantId: string, quantity: number) => void;
  toggleFavorite: (productId: string) => void;
}
const StoreContext = createContext<StoreState | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const content = useContent();
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const activity = useFetcher();
  const [lines, setLines] = useState<CartLine[]>([]);
  const currentLines = useRef<CartLine[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);
  const markViewed = useCallback(
    (id: string) =>
      setRecentlyViewed((current) =>
        !content.products.some((product) => product.id === id) ||
        current[0] === id
          ? current
          : [id, ...current.filter((x) => x !== id)].slice(0, 20),
      ),
    [content.products],
  );
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    try {
      const restored = normalizeCart(
        parseSavedList(localStorage.getItem("hubby-demo-cart-v1")),
        content,
      );
      currentLines.current = restored;
      setLines(restored);
      setRecentlyViewed(
        savedProductIds(
          parseSavedList(localStorage.getItem("hubby-demo-recent-v1")),
          content.products,
        ),
      );
      setFavorites(
        savedProductIds(
          parseSavedList(localStorage.getItem("hubby-demo-favorites-v1")),
          content.products,
        ),
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
    const result = planCartAddition(
      currentLines.current,
      variantId,
      quantity,
      content,
    );
    if (result.reason === "unpriced") {
      setNotice("Gói này chưa có giá niêm yết. Bạn hỏi Hubby trước nhé.");
      return false;
    }
    if (result.reason === "unavailable" || !found) {
      setNotice("Gói này hiện đã hết hàng.");
      return false;
    }
    if (!result.added) {
      setNotice(
        result.reason === "invalid"
          ? "Chọn số lượng nguyên từ 1 trở lên."
          : "Giỏ hàng đã đạt số lượng tối đa của gói này.",
      );
      return false;
    }
    currentLines.current = result.lines;
    setLines(result.lines);
    setNotice(
      result.added < quantity
        ? `Đã thêm ${result.added} gói ${found.product.name}; giỏ hàng đã đạt số lượng tối đa.`
        : `Đã thêm ${found.product.name} vào giỏ hàng.`,
    );
    if (experienceOf(content).activityNotifications !== false)
      activity.submit(
        { csrf: root?.csrf ?? "", key: crypto.randomUUID(), variantId },
        { method: "post", action: "/activity" },
      );
    return true;
  }
  function setQuantity(variantId: string, quantity: number) {
    const next = normalizeCart(
      currentLines.current.map((line) =>
        line.variantId === variantId ? { ...line, quantity } : line,
      ),
      content,
    );
    currentLines.current = next;
    setLines(next);
  }
  function toggleFavorite(productId: string) {
    if (!content.products.some((product) => product.id === productId)) return;
    setFavorites((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId].slice(-20),
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
