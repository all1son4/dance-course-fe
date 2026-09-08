/**
 * One shape for every admin API call.
 *
 * `errorCode` is always the payload's own code, so a call site can branch on it
 * without repeating the parse. A failed request or an unparsable body reports
 * `network_error`, which lets each action keep its own "Ошибка сети..." wording
 * in the same lookup table as its server-side error texts.
 */
export type AdminJsonResult<TData> = {
  data: TData;
  errorCode: string;
  ok: boolean;
  unauthorized: boolean;
};

type AdminJsonRequestOptions = {
  body?: unknown;
  method?: "DELETE" | "GET" | "PATCH" | "POST";
};

export const ADMIN_NETWORK_ERROR_CODE = "network_error";

export const requestAdminJson = async <TData>(
  endpoint: string,
  { body, method = "GET" }: AdminJsonRequestOptions = {},
): Promise<AdminJsonResult<TData>> => {
  try {
    const response = await fetch(endpoint, {
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      method,
    });
    const data = (await response.json()) as TData & { errorCode?: string };
    const errorCode = data?.errorCode ?? "";

    return {
      data,
      errorCode,
      ok: response.ok,
      unauthorized: errorCode === "unauthorized",
    };
  } catch {
    return {
      data: {} as TData,
      errorCode: ADMIN_NETWORK_ERROR_CODE,
      ok: false,
      unauthorized: false,
    };
  }
};
