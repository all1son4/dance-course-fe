export const DOMAIN_PERSISTENCE_MODES = ["legacy", "shadow", "database"] as const;

export type DomainPersistenceMode = (typeof DOMAIN_PERSISTENCE_MODES)[number];

export const DOMAIN_PERSISTENCE_ENV = {
  paymentEvents: "DB_PAYMENT_EVENTS_MODE",
  sideEffects: "DB_SIDE_EFFECTS_MODE",
  sheetsExport: "DB_SHEETS_EXPORT_MODE",
} as const;

export type PersistenceDomain = keyof typeof DOMAIN_PERSISTENCE_ENV;

const isDomainPersistenceMode = (value: string): value is DomainPersistenceMode =>
  DOMAIN_PERSISTENCE_MODES.some((mode) => mode === value);

export const getDomainPersistenceMode = (
  domain: PersistenceDomain,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): DomainPersistenceMode => {
  const variableName = DOMAIN_PERSISTENCE_ENV[domain];
  const configuredValue = environment[variableName]?.trim().toLowerCase();

  if (!configuredValue) {
    return "legacy";
  }

  if (!isDomainPersistenceMode(configuredValue)) {
    throw new Error(
      `${variableName} must be one of: ${DOMAIN_PERSISTENCE_MODES.join(", ")}.`,
    );
  }

  return configuredValue;
};

export const getDomainPersistenceConfiguration = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
) =>
  Object.fromEntries(
    Object.keys(DOMAIN_PERSISTENCE_ENV).map((domain) => [
      domain,
      getDomainPersistenceMode(domain as PersistenceDomain, environment),
    ]),
  ) as Record<PersistenceDomain, DomainPersistenceMode>;
