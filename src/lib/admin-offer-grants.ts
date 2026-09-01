import {
  type CreateAdminOfferGrantCommand,
  createAdminOfferGrantInDatabase,
} from "@/db/admin-offer-grants";
import { isSheetsExportEnabled } from "@/lib/sheets-export-outbox";

export const shouldExportAdminOfferGrantToSheets = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
) => isSheetsExportEnabled(environment);

export const createAdminOfferGrant = async (
  command: Omit<CreateAdminOfferGrantCommand, "enqueueSuccessfulCustomerExport">,
  dependencies: {
    createInDatabase?: typeof createAdminOfferGrantInDatabase;
    environment?: Readonly<Record<string, string | undefined>>;
  } = {},
) =>
  (dependencies.createInDatabase ?? createAdminOfferGrantInDatabase)({
    ...command,
    enqueueSuccessfulCustomerExport: shouldExportAdminOfferGrantToSheets(
      dependencies.environment,
    ),
  });
