import {
  type ActionFunctionArgs,
  data,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import type { Activity } from "../domain/engagement";
import { secureForm } from "../server/form-security.server";
import { localCall, localEnabled } from "../server/local-shop.server";
export async function loader({ request, context }: LoaderFunctionArgs) {
  // Unconfigured online mode must not masquerade as a live event source.
  if (!localEnabled(request, context)) return { events: [] as Activity[] };
  try {
    return await localCall<{ events: Activity[] }>(request, context, {
      action: "activity_list",
    });
  } catch (error) {
    // Optional social activity must not bring down shopping on a missing/expired session.
    if (error instanceof Response && [401, 503].includes(error.status))
      return { events: [] as Activity[] };
    throw error;
  }
}
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const form = await secureForm(request, 2000);
    const input = z
      .object({ key: z.uuid(), variantId: z.string().max(80) })
      .strict()
      .parse({ key: form.get("key"), variantId: form.get("variantId") });
    return await localCall<{ ok: boolean }>(request, context, {
      action: "activity_cart",
      ...input,
    });
  } catch (error) {
    return data(
      { error: "Chưa ghi nhận được hoạt động." },
      { status: error instanceof Response ? error.status : 400 },
    );
  }
}
