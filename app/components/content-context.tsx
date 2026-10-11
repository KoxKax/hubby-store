import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { getStorefrontContent } from "../content/fixtures";
import type { StorefrontContent } from "../content/types";
import {
  createWorkspace,
  LOCAL_CMS_KEY,
  type LocalWorkspace,
  parseWorkspace,
  publishLocal,
  restoreLocal,
  saveLocalDraft,
} from "../domain/cms";

interface ContentState {
  content: StorefrontContent;
  workspace: LocalWorkspace | null;
  ready: boolean;
  commitDraft: (snapshot: unknown, version: number) => void;
  publish: (id: string) => void;
  restore: (id: string) => void;
}
const ContentContext = createContext<ContentState | null>(null);
export function ContentProvider({
  initial,
  sandbox,
  children,
}: {
  initial: StorefrontContent;
  sandbox: boolean;
  children: ReactNode;
}) {
  const [workspace, setWorkspace] = useState<LocalWorkspace | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (sandbox) {
      let restored = createWorkspace(initial);
      try {
        const raw = localStorage.getItem(LOCAL_CMS_KEY);
        if (raw) restored = parseWorkspace(JSON.parse(raw));
      } catch {
        /* Invalid sandbox is ignored, never trusted as authentication. */
      }
      setWorkspace(restored);
    }
    setReady(true);
  }, [initial, sandbox]);
  function commit(next: LocalWorkspace) {
    if (!sandbox) throw new Error("Sandbox bị tắt");
    localStorage.setItem(LOCAL_CMS_KEY, JSON.stringify(next));
    setWorkspace(next);
  }
  const content =
    workspace?.revisions.find((r) => r.id === workspace.publishedId)
      ?.snapshot ?? initial;
  return (
    <ContentContext.Provider
      value={{
        content,
        workspace,
        ready,
        commitDraft: (snapshot, version) => {
          if (!workspace) throw new Error("CMS chưa sẵn sàng");
          commit(saveLocalDraft(workspace, snapshot, version));
        },
        publish: (id) => {
          if (workspace) commit(publishLocal(workspace, id));
        },
        restore: (id) => {
          if (workspace) commit(restoreLocal(workspace, id));
        },
      }}
    >
      {children}
    </ContentContext.Provider>
  );
}
export function useCms() {
  const value = useContext(ContentContext);
  if (!value) throw new Error("ContentProvider missing");
  return value;
}
export function useContent() {
  return useContext(ContentContext)?.content ?? getStorefrontContent();
}
export function PreviewContent({
  content,
  children,
}: {
  content: StorefrontContent;
  children: ReactNode;
}) {
  const cms = useCms();
  return (
    <ContentContext.Provider value={{ ...cms, content }}>
      {children}
    </ContentContext.Provider>
  );
}
