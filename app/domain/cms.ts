import { z } from "zod";
import { contentSchema, validateContent } from "../content/schema";
import type { StorefrontContent } from "../content/types";

export interface CmsRevision {
  id: string;
  version: number;
  createdAt: string;
  snapshot: StorefrontContent;
}
export interface LocalWorkspace {
  schemaVersion: 1;
  headVersion: number;
  publishedId: string;
  revisions: CmsRevision[];
}
export const LOCAL_CMS_KEY = "hubby-local-cms-v2";
const workspaceSchema = z
  .object({
    schemaVersion: z.literal(1),
    headVersion: z.number().int().nonnegative(),
    publishedId: z.string().max(80),
    revisions: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            version: z.number().int().nonnegative(),
            createdAt: z.iso.datetime(),
            snapshot: contentSchema,
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
export function createWorkspace(content: StorefrontContent): LocalWorkspace {
  return {
    schemaVersion: 1,
    headVersion: 0,
    publishedId: "baseline",
    revisions: [
      {
        id: "baseline",
        version: 0,
        createdAt: "2026-10-11T00:00:00.000Z",
        snapshot: validateContent(content, true),
      },
    ],
  };
}
export function parseWorkspace(value: unknown): LocalWorkspace {
  const result = workspaceSchema.parse(value);
  if (
    !result.revisions.some((r) => r.id === result.publishedId) ||
    new Set(result.revisions.map((r) => r.id)).size !==
      result.revisions.length ||
    new Set(result.revisions.map((r) => r.version)).size !==
      result.revisions.length ||
    Math.max(...result.revisions.map((r) => r.version)) !== result.headVersion
  )
    throw new Error("Lịch sử CMS local không hợp lệ");
  return result;
}
export function saveLocalDraft(
  workspace: LocalWorkspace,
  snapshot: unknown,
  expectedVersion: number,
): LocalWorkspace {
  if (workspace.headVersion !== expectedVersion)
    throw new Error("Nội dung đã đổi. Tải lại trước khi lưu.");
  if (workspace.revisions.length >= 30)
    throw new Error(
      "Sandbox đã đạt 30 bản. Xuất nội dung trước khi bắt đầu sandbox khác.",
    );
  const version = workspace.headVersion + 1;
  const content = validateContent(snapshot, true);
  const revision = {
    id: crypto.randomUUID(),
    version,
    createdAt: new Date().toISOString(),
    snapshot: { ...content, revision: `local-${version}` },
  };
  return {
    ...workspace,
    headVersion: version,
    revisions: [...workspace.revisions, revision],
  };
}
export function publishLocal(
  workspace: LocalWorkspace,
  id: string,
): LocalWorkspace {
  if (!workspace.revisions.some((r) => r.id === id))
    throw new Error("Bản nháp không tồn tại");
  return { ...workspace, publishedId: id };
}
export function restoreLocal(
  workspace: LocalWorkspace,
  id: string,
): LocalWorkspace {
  const revision = workspace.revisions.find((r) => r.id === id);
  if (!revision) throw new Error("Phiên bản không tồn tại");
  return saveLocalDraft(workspace, revision.snapshot, workspace.headVersion);
}
