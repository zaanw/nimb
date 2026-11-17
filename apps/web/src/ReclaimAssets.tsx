import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, Coins } from "lucide-react";
import { Dialog, useConfirmation } from "./UI";

type Kind = "currency" | "username";
type Record = {
  id: number;
  kind: Kind;
  value: string;
  reason: string;
  balanceBefore: number;
  balanceAfter: number;
  replacementUsername: string | null;
  createdAt: string;
};
type Snapshot = {
  user: {
    id: number;
    name: string;
    username: string;
    collectibleNumber: string | null;
    nimbBalance: number;
    purchasedUsernames: { username: string; price: number }[];
  };
  history: Record[];
};
type Result = { balance: number; replacementUsername: string | null };
const display = (name: string) => (name.startsWith("+") ? name : "@" + name);
const number = (value: number) => value.toLocaleString("ru-RU");
async function api<T>(userId: number, body?: unknown): Promise<T> {
  const r = await fetch(`/api/admin/users/${userId}/reclaims`, {
    method: body ? "POST" : "GET",
    credentials: "include",
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Не удалось выполнить действие");
  return data;
}
export function ReclaimAssets({
  userId,
  kind,
  onClose,
}: {
  userId: number;
  kind: Kind;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { ask, dialog } = useConfirmation();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState("");
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["admin", "reclaims", userId],
    queryFn: () => api<Snapshot>(userId),
  });
  const mutation = useMutation({
    mutationFn: (body: unknown) => api<Result>(userId, body),
    onSuccess: async (result) => {
      setNotice(
        kind === "currency"
          ? `Нимбики списаны. Осталось ${number(result.balance)} N.`
          : `Адрес ${display(username)} отозван.${result.replacementUsername ? ` Новый логин: @${result.replacementUsername}.` : ""}`,
      );
      setRequestId(crypto.randomUUID());
      setAmount("");
      setUsername("");
      setReason("");
      await Promise.all(
        [
          "admin",
          "wallet",
          "me",
          "account",
          "identifiers",
          "profile",
          "checkpoints",
        ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
      );
    },
  });
  const user = query.data?.user;
  const names = user
    ? [
        ...new Set([
          user.username,
          ...(user.collectibleNumber ? [user.collectibleNumber] : []),
          ...user.purchasedUsernames.map((n) => n.username),
        ]),
      ]
    : [];
  const busy = confirming || mutation.isPending;
  const valid =
    !!user &&
    reason.trim().length >= 3 &&
    (kind === "currency"
      ? /^\d+$/.test(amount) &&
        Number.isSafeInteger(Number(amount)) &&
        Number(amount) > 0 &&
        Number(amount) <= user.nimbBalance
      : names.includes(username));
  async function submit() {
    if (!valid || busy || !user) return;
    const body = {
      requestId,
      reason: reason.trim(),
      kind,
      ...(kind === "currency"
        ? { amount: Number(amount), expectedBalance: user.nimbBalance }
        : { username }),
    };
    setConfirming(true);
    try {
      const ok = await ask({
        title: kind === "currency" ? "Подтвердить списание?" : "Забрать адрес?",
        description:
          kind === "currency"
            ? `У @${user.username} будет списано ${number(Number(amount))} N. Баланс: ${number(user.nimbBalance)} → ${number(user.nimbBalance - Number(amount))} N. Причина: ${reason.trim()}.`
            : `${display(username)} будет удалён у @${user.username} и станет доступен другим. Возврата нимбиков нет.${username === user.username ? " Это основной логин: вместо него будет создан технический. Для следующего входа понадобится новый логин или email." : username === user.collectibleNumber ? " Активный номер будет отключён." : ""} Причина: ${reason.trim()}.`,
        label: kind === "currency" ? "Списать" : "Забрать адрес",
        danger: true,
      });
      if (ok) mutation.mutate(body);
    } finally {
      setConfirming(false);
    }
  }
  return (
    <>
      <Dialog
        title={
          kind === "currency" ? "Списать нимбики" : "Забрать юзернейм или номер"
        }
        onClose={() => {
          if (!busy) onClose();
        }}
      >
        <div className="reclaim-panel">
          {query.isLoading && <p>Загружаем данные…</p>}
          {query.isError && (
            <div className="control-error" role="alert">
              {query.error.message}
              <button onClick={() => query.refetch()}>Повторить</button>
            </div>
          )}
          {user && (
            <>
              <div className="reclaim-person">
                <span>
                  {kind === "currency" ? (
                    <Coins size={19} />
                  ) : (
                    <AtSign size={19} />
                  )}{" "}
                  {user.name}
                </span>
                <small>
                  @{user.username} · ID {user.id}
                </small>
              </div>
              <p className="reclaim-help">
                Перед действием сохраняется точка для отката. Причина останется
                в истории операций.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <fieldset disabled={busy}>
                  {kind === "currency" ? (
                    <>
                      <div className="reclaim-balance">
                        На балансе <strong>{number(user.nimbBalance)} N</strong>
                      </div>
                      <label>
                        Сумма списания
                        <input
                          aria-label="Сумма списания"
                          type="text"
                          inputMode="numeric"
                          value={amount}
                          onChange={(e) => {
                            setAmount(e.target.value);
                            setNotice("");
                            mutation.reset();
                          }}
                          placeholder="Например, 500"
                          autoComplete="off"
                        />
                      </label>
                      <button
                        className="reclaim-all outline"
                        type="button"
                        disabled={!user.nimbBalance}
                        onClick={() => {
                          setAmount(String(user.nimbBalance));
                          mutation.reset();
                        }}
                      >
                        Весь баланс
                      </button>
                      {amount &&
                        (!/^\d+$/.test(amount) ||
                          Number(amount) <= 0 ||
                          Number(amount) > user.nimbBalance) && (
                          <p className="reclaim-invalid">
                            Введите целое число от 1 до{" "}
                            {number(user.nimbBalance)}.
                          </p>
                        )}
                      {valid && (
                        <p className="reclaim-preview">
                          Останется: {number(user.nimbBalance - Number(amount))}{" "}
                          N
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <label>
                        Юзернейм или номер
                        <select
                          aria-label="Юзернейм или номер"
                          value={username}
                          onChange={(e) => {
                            setUsername(e.target.value);
                            setNotice("");
                            mutation.reset();
                          }}
                        >
                          <option value="">Выберите адрес</option>
                          {names.map((name) => (
                            <option key={name} value={name}>
                              {display(name)}
                              {name === user.username
                                ? " · основной логин"
                                : name === user.collectibleNumber
                                  ? " · активный номер"
                                  : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="reclaim-help">
                        Отозванный адрес освобождается для других пользователей.
                        Нимбики за покупку не возвращаются.
                      </p>
                      {username === user.username && (
                        <p className="reclaim-warning">
                          Основной логин изменится на технический. Новый логин
                          появится после отзыва; вход по email и текущие сеансы
                          сохранятся.
                        </p>
                      )}
                    </>
                  )}
                  <label>
                    Причина
                    <textarea
                      aria-label="Причина"
                      rows={3}
                      minLength={3}
                      maxLength={300}
                      value={reason}
                      onChange={(e) => {
                        setReason(e.target.value);
                        mutation.reset();
                      }}
                      placeholder="Почему нужно забрать адрес или списать нимбики"
                    />
                  </label>
                  {mutation.isError && (
                    <div className="control-error" role="alert">
                      {mutation.error.message}
                      <button type="button" onClick={() => query.refetch()}>
                        Обновить данные
                      </button>
                    </div>
                  )}
                  <div className="dialog-actions">
                    <button type="button" className="outline" onClick={onClose}>
                      Отмена
                    </button>
                    <button
                      className="primary danger-button"
                      disabled={!valid || busy}
                    >
                      {mutation.isPending
                        ? "Сохраняем…"
                        : kind === "currency"
                          ? "Списать нимбики"
                          : "Забрать адрес"}
                    </button>
                  </div>
                </fieldset>
              </form>
              {notice && (
                <p role="status" className="reclaim-notice">
                  {notice}
                </p>
              )}
              <h3>Последние отзывы и списания</h3>
              {!query.data!.history.length && (
                <p className="reclaim-help">Операций пока нет.</p>
              )}
              {query.data!.history.map((record) => (
                <article className="reclaim-record" key={record.id}>
                  <header>
                    <strong>
                      {record.kind === "currency"
                        ? `−${number(Number(record.value))} N`
                        : display(record.value)}
                    </strong>
                    <time>
                      {new Date(record.createdAt).toLocaleString("ru-RU")}
                    </time>
                  </header>
                  <p>{record.reason}</p>
                  {record.kind === "currency" && (
                    <small>
                      Баланс: {number(record.balanceBefore)} →{" "}
                      {number(record.balanceAfter)} N
                    </small>
                  )}
                  {record.replacementUsername && (
                    <small>Новый логин: @{record.replacementUsername}</small>
                  )}
                </article>
              ))}
            </>
          )}
        </div>
      </Dialog>
      {dialog}
    </>
  );
}
