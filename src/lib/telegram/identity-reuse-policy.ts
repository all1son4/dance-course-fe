export type TimedAccessTelegramBinding = {
  access_expires_at: string;
  chat_id: string;
  status: string;
  telegram_user_id: string;
};

export type OnlineGroupIdentityReuseLookup =
  | {
      kind: "customer_id";
      value: string;
    }
  | {
      kind: "email_snapshot";
      value: string;
    };

const parseTimestamp = (value: string) => {
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const getReusableTimedAccessTelegramBindings = <
  TBinding extends TimedAccessTelegramBinding,
>({
  bindings,
  chatId,
  nowMs,
}: {
  bindings: readonly TBinding[];
  chatId: string;
  nowMs: number;
}): TBinding[] =>
  bindings
    .filter(
      (binding) =>
        binding.status === "active" &&
        binding.chat_id.trim() === chatId &&
        Boolean(binding.telegram_user_id.trim()) &&
        parseTimestamp(binding.access_expires_at) > nowMs,
    )
    .sort(
      (left, right) =>
        parseTimestamp(right.access_expires_at) - parseTimestamp(left.access_expires_at),
    );

export const getOnlineGroupIdentityReuseLookup = ({
  customerEmailSnapshot,
  customerId,
}: {
  customerEmailSnapshot: string | null;
  customerId: string | null;
}): OnlineGroupIdentityReuseLookup | null => {
  if (customerId) {
    return {
      kind: "customer_id",
      value: customerId,
    };
  }

  if (customerEmailSnapshot) {
    return {
      kind: "email_snapshot",
      value: customerEmailSnapshot,
    };
  }

  return null;
};
