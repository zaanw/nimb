import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Wallet as WalletIcon,
  AtSign,
  Hash,
  Check,
  Info,
  ArrowUpRight,
} from "lucide-react";
import { Brand, PageHeading, useConfirmation } from "./UI";
type WalletData = {
  balance: number;
  username: string;
  collectibleNumber?: string | null;
  owned: {
    username: string;
    price: number;
    purchasedAt: string;
    public?: boolean;
  }[];
};
type CheckResult = {
  username: string;
  price: number;
  available: boolean;
  owned: boolean;
};
async function request<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch("/api/wallet" + path, {
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
  if (!r.ok) throw new Error(data.error || "Ошибка запроса");
  return data;
}
const labelName = (name: string) => (name.startsWith("+") ? name : "@" + name);
export function Wallet({ onBack }: { onBack: () => void }) {
  const qc = useQueryClient();
  const { ask, dialog } = useConfirmation();
  const [name, setName] = useState("");
  const [collectionFilter, setCollectionFilter] = useState<
    "all" | "names" | "numbers"
  >("all");
  const [pendingVisibility, setPendingVisibility] = useState<{
    username: string;
    visible: boolean;
  } | null>(null);
  const [checked, setChecked] = useState<CheckResult | null>(null);
  const [notice, setNotice] = useState("");
  const wallet = useQuery({
    queryKey: ["wallet"],
    queryFn: () => request<WalletData>(""),
  });
  const check = useMutation({
    mutationFn: (username: string) =>
      request<CheckResult>("/check?username=" + encodeURIComponent(username)),
    onSuccess: (data) => {
      setChecked(data);
      setNotice("");
    },
  });
  const action = useMutation({
    mutationFn: ({ path, username }: { path: string; username: string }) =>
      request<{ ok: boolean }>(path, { username }),
    onSuccess: async () => {
      setChecked(null);
      setName("");
      setNotice("Коллекция обновлена. Всё готово.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["wallet"] }),
        qc.invalidateQueries({ queryKey: ["me"] }),
        qc.invalidateQueries({ queryKey: ["account"] }),
        qc.invalidateQueries({ queryKey: ["chats"] }),
      ]);
    },
  });
  const visibility = useMutation({
    mutationFn: async ({
      username,
      visible,
    }: {
      username: string;
      visible: boolean;
    }) => {
      const response = await fetch("/api/wallet/visibility", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, visible }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить");
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["wallet"] }),
        qc.invalidateQueries({ queryKey: ["identifiers"] }),
      ]);
    },
    onSettled: () => setPendingVisibility(null),
  });
  function checkName(e: React.FormEvent) {
    e.preventDefault();
    setChecked(null);
    setNotice("");
    const value = name.trim().toLowerCase().replace(/^@/, "");
    if (
      !/^(?:[1-9][0-9]{0,5}|[a-z][a-z0-9_]{2,23}|\+[1-9][0-9]{2,11})$/.test(
        value,
      )
    ) {
      setNotice(
        "Введите имя из 3–24 латинских символов, число из 1–6 цифр или номер: + и 3–12 цифр.",
      );
      return;
    }
    check.mutate(value);
  }
  async function buy() {
    if (!checked?.available || !wallet.data || action.isPending) return;
    const selected = checked;
    const old = wallet.data.username;
    if (
      await ask({
        title: `Купить ${labelName(selected.username)}?`,
        description: `С баланса спишется ${selected.price.toLocaleString("ru-RU")} нимбиков. ${selected.username.startsWith("+") ? "Номер появится в вашем профиле. Юзернейм останется прежним. Это внутренний номер nimb, без звонков и SMS." : `${labelName(selected.username)} станет вашим текущим именем. ${wallet.data.owned.some((n) => n.username === old) ? `@${old} останется в коллекции.` : `Прежнее имя @${old} освободится.`}`}`,
        label: selected.username.startsWith("+")
          ? "Купить номер"
          : "Купить юзернейм",
      })
    )
      action.mutate({ path: "/buy", username: selected.username });
  }
  const balance = wallet.data?.balance ?? 0;
  const owned = wallet.data?.owned || [];
  const visibleOwned = owned.filter(
    (item) =>
      collectionFilter === "all" ||
      (collectionFilter === "numbers"
        ? item.username.startsWith("+")
        : !item.username.startsWith("+")),
  );
  return (
    <div className="wallet-screen">
      <PageHeading
        eyebrow="ВАШЕ ПРОСТРАНСТВО"
        title="Кошелёк"
        description="Баланс, имена и номера nimb."
        action={
          <button
            className="icon-button"
            title="Перейти к чатам"
            aria-label="Перейти к чатам"
            onClick={onBack}
          >
            <ArrowUpRight size={20} />
          </button>
        }
      />
      <div className="wallet-grid">
        <div className="wallet-column">
          <section className="wallet-balance-card">
            <div className="wallet-balance-label">
              <span>Доступный баланс</span>
              <WalletIcon size={21} />
            </div>
            <strong className="balance-number">
              {wallet.isLoading
                ? "…"
                : wallet.isError
                  ? "—"
                  : balance.toLocaleString("ru-RU")}
            </strong>
            <span className="balance-unit">нимбиков</span>
            <div className="wallet-balance-bottom">
              <span>@{wallet.data?.username || "…"}</span>
              <Brand markOnly />
            </div>
          </section>
          {wallet.isError && (
            <div className="error">
              {wallet.error.message}{" "}
              <button className="text-action" onClick={() => wallet.refetch()}>
                Повторить
              </button>
            </div>
          )}
          <div className="wallet-note">
            <Info size={15} />
            <span>
              Нимбики — внутренняя валюта Nimb. Используйте их для покупки имён
              и коллекционных номеров.
            </span>
          </div>
          {visibility.isError && (
            <p className="error" role="alert">
              {visibility.error.message}
            </p>
          )}
          <section className="wallet-card">
            <div className="wallet-card-heading">
              <Hash size={18} />
              <h2>Моя коллекция</h2>
              <span className="count-tag">
                {wallet.data?.owned.length ?? "—"}
              </span>
            </div>
            <div
              className="wallet-collection-tabs"
              role="tablist"
              aria-label="Коллекция адресов"
            >
              {(
                [
                  ["all", "Все"],
                  ["names", "Имена"],
                  ["numbers", "Номера"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={collectionFilter === key}
                  onClick={() => setCollectionFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {wallet.isLoading ? (
              <p className="muted">Загрузка коллекции…</p>
            ) : wallet.isError ? (
              <p>Коллекция временно недоступна.</p>
            ) : wallet.data?.owned.length ? (
              <div className="wallet-ownership-grid">
                {visibleOwned.map((item) => (
                  <div className="wallet-ownership-item" key={item.username}>
                    <div className="wallet-owned">
                      <span className="wallet-owned-icon">
                        {item.username.startsWith("+") ? (
                          <Hash size={24} />
                        ) : (
                          <AtSign size={24} />
                        )}
                      </span>
                      <span>
                        <strong>{labelName(item.username)}</strong>
                        <small>
                          В коллекции с{" "}
                          {new Date(item.purchasedAt).toLocaleDateString(
                            "ru-RU",
                          )}
                        </small>
                      </span>
                      {wallet.data?.username === item.username ||
                      wallet.data?.collectibleNumber === item.username ? (
                        <span className="status-pill">
                          <Check size={11} /> Активен
                        </span>
                      ) : (
                        <button
                          className="outline"
                          disabled={action.isPending}
                          onClick={async () => {
                            if (
                              await ask({
                                title: `Выбрать ${labelName(item.username)}?`,
                                description: item.username.startsWith("+")
                                  ? "Номер появится в профиле. Имя пользователя останется прежним."
                                  : `Это станет вашим текущим именем. ${wallet.data?.owned.some((n) => n.username === wallet.data?.username) ? "Прежнее имя останется в коллекции." : "Прежнее обычное имя освободится."}`,
                                label: "Выбрать",
                              })
                            )
                              action.mutate({
                                path: "/activate",
                                username: item.username,
                              });
                          }}
                        >
                          Выбрать
                        </button>
                      )}
                    </div>
                    <label className="wallet-public-option">
                      <input
                        type="checkbox"
                        checked={
                          wallet.data?.username === item.username ||
                          wallet.data?.collectibleNumber === item.username ||
                          (pendingVisibility?.username === item.username
                            ? pendingVisibility.visible
                            : !!item.public)
                        }
                        disabled={
                          !!pendingVisibility ||
                          visibility.isPending ||
                          wallet.data?.username === item.username ||
                          wallet.data?.collectibleNumber === item.username
                        }
                        onChange={(e) => {
                          const change = {
                            username: item.username,
                            visible: e.target.checked,
                          };
                          setPendingVisibility(change);
                          visibility.mutate(change);
                        }}
                      />
                      <span>
                        {wallet.data?.username === item.username ||
                        wallet.data?.collectibleNumber === item.username
                          ? "Основной адрес · виден в профиле"
                          : "Показывать в профиле"}
                      </span>
                    </label>
                  </div>
                ))}
                {!visibleOwned.length && (
                  <p className="wallet-filter-empty">
                    В этом разделе пока нет адресов.
                  </p>
                )}
              </div>
            ) : (
              <div className="wallet-empty">
                <AtSign size={28} strokeWidth={1.3} />
                <p>
                  Коллекция пока пуста.
                  <br />
                  Первый юзернейм появится после покупки.
                </p>
              </div>
            )}
          </section>
        </div>
        <div className="wallet-column">
          <section className="wallet-card">
            <div className="wallet-card-heading">
              <AtSign size={20} />
              <h2>Купить имя или номер</h2>
            </div>
            <p>
              Буквенное имя, короткий @номер или коллекционный номер с плюсом.
              Найдите свой вариант.
            </p>
            <div className="wallet-presets">
              {["neo", "777", "+666"].map((example) => (
                <button
                  className="outline"
                  key={example}
                  disabled={check.isPending || action.isPending}
                  onClick={() => {
                    setName(example);
                    setChecked(null);
                    check.reset();
                  }}
                >
                  {labelName(example)}
                </button>
              ))}
            </div>
            <div className="wallet-price-list">
              <div>
                <span>Имена</span>
                <strong>от 1 000</strong>
                <small>нимбиков</small>
              </div>
              <div>
                <span>@номера</span>
                <strong>от 1 000</strong>
                <small>нимбиков</small>
              </div>
              <div>
                <span>+номера</span>
                <strong>от 1 000</strong>
                <small>нимбиков</small>
              </div>
            </div>
            <form className="wallet-form" onSubmit={checkName}>
              <label>
                <span aria-hidden="true">
                  {name.startsWith("+") ? "#" : "@"}
                </span>
                <input
                  aria-label="Юзернейм или номер"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setChecked(null);
                    setNotice("");
                    check.reset();
                  }}
                  disabled={check.isPending || action.isPending}
                  placeholder="neo, 777 или +666"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={24}
                />
              </label>
              <button
                className="primary"
                disabled={check.isPending || action.isPending || !name.trim()}
              >
                {check.isPending ? "Проверяем…" : "Проверить"}
              </button>
            </form>
            <p className="wallet-help">
              Имена: латиница, цифры и _. Номера: без нуля в начале. Точная цена
              появится после проверки.
            </p>
            {check.isError && <p className="error">{check.error.message}</p>}
            {checked && (
              <div className="wallet-result" role="status">
                <span>
                  <strong>{labelName(checked.username)}</strong>
                  <small>
                    {checked.owned
                      ? "Уже в вашей коллекции"
                      : checked.available
                        ? `${checked.price.toLocaleString("ru-RU")} нимбиков · Свободен`
                        : "Это имя или номер уже заняты"}
                  </small>
                  {checked.available && balance < checked.price && (
                    <small>
                      Не хватает{" "}
                      {(checked.price - balance).toLocaleString("ru-RU")}{" "}
                      нимбиков
                    </small>
                  )}
                </span>
                {checked.available && (
                  <button
                    className="primary"
                    disabled={
                      action.isPending ||
                      wallet.isError ||
                      wallet.isLoading ||
                      balance < checked.price
                    }
                    onClick={buy}
                  >
                    Купить
                  </button>
                )}
              </div>
            )}
            {notice && (
              <p className="wallet-notice" role="status">
                {notice}
              </p>
            )}
            {action.isError && <p className="error">{action.error.message}</p>}
          </section>
          <section className="context-card">
            <h2>Как это работает</h2>
            <p>
              Буквенные имена: 3 символа — 3 000 N, 4 — 2 000 N, от 5 — 1 000 N.
              @номера: 1 цифра — 10 000 N, 2 — 5 000 N, 3–6 — 1 000 N. +номера:
              3 цифры — 10 000 N, 4–6 — 5 000 N, 7–12 — 1 000 N.
            </p>
            <p>
              Купленное имя становится вашим @юзернеймом. Можно собрать
              несколько и переключаться между ними.
            </p>
            <p>
              Номер с + — коллекционный адрес в nimb. По нему можно найти ваш
              профиль; для входа используйте @юзернейм. Телефонная связь и SMS
              не предоставляются. ID аккаунта, переписки и подарки сохраняются.
            </p>
          </section>
        </div>
      </div>
      {dialog}
    </div>
  );
}
