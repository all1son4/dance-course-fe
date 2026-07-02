type DatabaseConnectionKind = "pooled" | "unpooled";

type DeploymentEnvironment = "development" | "production";

const STANDARD_POOLED_DATABASE_URL_NAMES = ["DATABASE_URL", "POSTGRES_URL"];

const STANDARD_UNPOOLED_DATABASE_URL_NAMES = [
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
];

const DEV_POOLED_DATABASE_URL_NAMES = [
  "DATABASE_DEV_DATABASE_URL",
  "DATABASE_DEV_POSTGRES_URL",
  "DATABASE_DEV",
  "DATABASE_URL_DEV",
  "DATABASE_DEV_URL",
  "POSTGRES_DEV",
  "POSTGRES_URL_DEV",
  "POSTGRES_DEV_URL",
];

const DEV_UNPOOLED_DATABASE_URL_NAMES = [
  "DATABASE_DEV_DATABASE_URL_UNPOOLED",
  "DATABASE_DEV_POSTGRES_URL_NON_POOLING",
  "DATABASE_DEV_POSTGRES_PRISMA_URL",
  "DATABASE_DEV_UNPOOLED",
  "DATABASE_UNPOOLED_DEV",
  "DATABASE_URL_DEV_UNPOOLED",
  "DATABASE_URL_UNPOOLED_DEV",
  "DATABASE_DEV_URL_UNPOOLED",
  "POSTGRES_DEV_NON_POOLING",
  "POSTGRES_URL_DEV_NON_POOLING",
  "POSTGRES_URL_NON_POOLING_DEV",
  "POSTGRES_DEV_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL_DEV",
];

const PROD_POOLED_DATABASE_URL_NAMES = [
  "DATABASE_PROD_DATABASE_URL",
  "DATABASE_PROD_POSTGRES_URL",
  "DATABASE_PROD",
  "DATABASE_URL_PROD",
  "DATABASE_PROD_URL",
  "POSTGRES_PROD",
  "POSTGRES_URL_PROD",
  "POSTGRES_PROD_URL",
];

const PROD_UNPOOLED_DATABASE_URL_NAMES = [
  "DATABASE_PROD_DATABASE_URL_UNPOOLED",
  "DATABASE_PROD_POSTGRES_URL_NON_POOLING",
  "DATABASE_PROD_POSTGRES_PRISMA_URL",
  "DATABASE_PROD_UNPOOLED",
  "DATABASE_UNPOOLED_PROD",
  "DATABASE_URL_PROD_UNPOOLED",
  "DATABASE_URL_UNPOOLED_PROD",
  "DATABASE_PROD_URL_UNPOOLED",
  "POSTGRES_PROD_NON_POOLING",
  "POSTGRES_URL_PROD_NON_POOLING",
  "POSTGRES_URL_NON_POOLING_PROD",
  "POSTGRES_PROD_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL_PROD",
];

const trimEnv = (name: string) => process.env[name]?.trim() ?? "";

const pickFirstEnv = (names: string[]) => {
  for (const name of names) {
    const value = trimEnv(name);

    if (value) {
      return {
        name,
        value,
      };
    }
  }

  return null;
};

const getDeploymentEnvironment = (): DeploymentEnvironment => {
  const explicitEnvironment = (
    trimEnv("DATABASE_ENV") ||
    trimEnv("DB_ENV") ||
    trimEnv("VERCEL_ENV")
  ).toLowerCase();

  if (explicitEnvironment === "production" || explicitEnvironment === "prod") {
    return "production";
  }

  if (
    explicitEnvironment === "development" ||
    explicitEnvironment === "dev" ||
    explicitEnvironment === "preview"
  ) {
    return "development";
  }

  return process.env.NODE_ENV === "production" ? "production" : "development";
};

const getEnvironmentSpecificNames = (kind: DatabaseConnectionKind) => {
  const deploymentEnvironment = getDeploymentEnvironment();
  const devNames =
    kind === "unpooled" ? DEV_UNPOOLED_DATABASE_URL_NAMES : DEV_POOLED_DATABASE_URL_NAMES;
  const prodNames =
    kind === "unpooled"
      ? PROD_UNPOOLED_DATABASE_URL_NAMES
      : PROD_POOLED_DATABASE_URL_NAMES;

  return deploymentEnvironment === "production" ? prodNames : devNames;
};

const getStandardNames = (kind: DatabaseConnectionKind) =>
  kind === "unpooled"
    ? STANDARD_UNPOOLED_DATABASE_URL_NAMES
    : STANDARD_POOLED_DATABASE_URL_NAMES;

export const getDatabaseUrlFromEnv = (kind: DatabaseConnectionKind = "pooled") =>
  pickFirstEnv([...getEnvironmentSpecificNames(kind), ...getStandardNames(kind)])
    ?.value ?? "";

export const getDatabaseEnvSelection = (kind: DatabaseConnectionKind = "pooled") => {
  const deploymentEnvironment = getDeploymentEnvironment();
  const selected = pickFirstEnv([
    ...getEnvironmentSpecificNames(kind),
    ...getStandardNames(kind),
  ]);

  return {
    deploymentEnvironment,
    kind,
    variableName: selected?.name ?? null,
  };
};

export const getRequiredDatabaseUrlFromEnv = ({
  kind = "pooled",
  purpose,
}: {
  kind?: DatabaseConnectionKind;
  purpose: string;
}) => {
  const databaseUrl = getDatabaseUrlFromEnv(kind);

  if (!databaseUrl) {
    throw new Error(
      [
        `Missing database URL for ${purpose}.`,
        "Supported pooled names: DATABASE_URL, DATABASE_DEV, DATABASE_PROD.",
        "Supported unpooled names: DATABASE_URL_UNPOOLED, DATABASE_DEV_UNPOOLED, DATABASE_PROD_UNPOOLED.",
      ].join(" "),
    );
  }

  return databaseUrl;
};
