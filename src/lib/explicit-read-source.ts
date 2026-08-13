export type ExplicitReadSource = "database" | "sheets";

export type ExplicitReadResolution<T> =
  | {
      kind: "sheets";
    }
  | {
      kind: "database";
      value: T;
    };

export const resolveExplicitRead = async <T>({
  read,
  source,
}: {
  read: () => Promise<T>;
  source: ExplicitReadSource;
}): Promise<ExplicitReadResolution<T>> => {
  if (source === "sheets") {
    return { kind: "sheets" };
  }

  return {
    kind: "database",
    value: await read(),
  };
};
