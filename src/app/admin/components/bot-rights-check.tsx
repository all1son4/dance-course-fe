import { ShieldCheck } from "lucide-react";
import { useState } from "react";

import { ADMIN_API_ENDPOINTS } from "../lib/admin.constants";
import { requestAdminJson } from "../lib/admin-request";
import { AdminButton, Badge, Muted, Row } from "../ui/primitives";

type BotRights = {
  canBan: boolean;
  canInvite: boolean;
  canPin: boolean;
  isAdmin: boolean;
};

/**
 * Asks Telegram what the bot may do in one chat. Every chat the site hands out
 * links to needs invite and remove rights; cohort chats also need pin, for the
 * closure post.
 */
export const BotRightsCheck = ({
  chatId,
  needsPin = false,
  onUnauthorized,
}: {
  chatId: string;
  needsPin?: boolean;
  onUnauthorized: () => void;
}) => {
  const [rights, setRights] = useState<BotRights | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    setError("");
    const result = await requestAdminJson<BotRights>(
      ADMIN_API_ENDPOINTS.telegramBotRights,
      {
        body: { chatId },
        method: "POST",
      },
    );
    setChecking(false);
    if (result.unauthorized) return onUnauthorized();
    if (!result.ok) {
      setRights(null);
      setError(
        result.errorCode === "rate_limited"
          ? "Слишком часто. Подожди минуту."
          : result.errorCode === "telegram_chat_not_registered"
            ? "Бот не знает этот чат: добавь бота и отправь в чате /register_chat."
            : "Telegram не ответил. Попробуй ещё раз.",
      );
      return;
    }
    setRights(result.data);
  };

  const flags = rights
    ? [
        { ok: rights.isAdmin, yes: "Администратор", no: "Не администратор" },
        { ok: rights.canInvite, yes: "Приглашает", no: "Не может приглашать" },
        { ok: rights.canBan, yes: "Удаляет", no: "Не может удалять" },
        ...(needsPin
          ? [{ ok: rights.canPin, yes: "Закрепляет", no: "Не может закреплять" }]
          : []),
      ]
    : [];
  const allGood = flags.length > 0 && flags.every((flag) => flag.ok);

  return (
    <Row $gap={8}>
      <AdminButton
        size="sm"
        icon={<ShieldCheck aria-hidden />}
        loading={checking}
        onClick={() => void check()}
      >
        {rights ? "Проверить ещё раз" : "Проверить права бота"}
      </AdminButton>
      {allGood && <Badge $tone="success">Бот может всё нужное</Badge>}
      {rights &&
        !allGood &&
        flags.map((flag) => (
          <Badge key={flag.yes} $tone={flag.ok ? "success" : "danger"}>
            {flag.ok ? flag.yes : flag.no}
          </Badge>
        ))}
      {rights && !allGood && (
        <Muted>
          Открой чат в Telegram → Управление → Администраторы → бот и включи: добавление
          участников, блокировку{needsPin ? ", закрепление сообщений" : ""}.
        </Muted>
      )}
      {error && <Muted>{error}</Muted>}
    </Row>
  );
};
