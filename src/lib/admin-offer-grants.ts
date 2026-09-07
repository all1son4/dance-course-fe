import {
  type CreateAdminOfferGrantCommand,
  createAdminOfferGrantInDatabase,
} from "@/db/admin-offer-grants";

export const createAdminOfferGrant = async (
  command: CreateAdminOfferGrantCommand,
  dependencies: {
    createInDatabase?: typeof createAdminOfferGrantInDatabase;
  } = {},
) => (dependencies.createInDatabase ?? createAdminOfferGrantInDatabase)(command);
