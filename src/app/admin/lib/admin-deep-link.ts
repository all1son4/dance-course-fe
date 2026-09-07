import { ADMIN_FEATURES } from "./admin.constants";
import type { AdminFeatureId } from "./admin.types";

export type AdminDeepLink = {
  purchasesSearch: string;
  view: AdminFeatureId | "";
};

/**
 * The purchase alert links straight at a sale: `?view=purchases&q=<payment intent>`.
 * An unknown view is ignored so a stale link still opens a working workspace.
 */
export const readAdminDeepLink = (searchParams: {
  get: (name: string) => string | null;
}): AdminDeepLink => {
  const view = searchParams.get("view")?.trim() ?? "";

  return {
    purchasesSearch: searchParams.get("q")?.trim() ?? "",
    view: ADMIN_FEATURES.some((feature) => feature.id === view)
      ? (view as AdminFeatureId)
      : "",
  };
};
