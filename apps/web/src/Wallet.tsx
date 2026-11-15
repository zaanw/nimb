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
  owned: { username: string; price: number; purchasedAt: string }[];
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
export function Wallet({ onBack }: { onBack: () => void }) {
  const qc = useQueryClient();
  const { ask, dialog } = useConfirmation();
  const [name, setName] = useState("");
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
      setNotice("Юзернейм обновлён. Всё готово.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["wallet"] }),
        qc.invalidateQueries({ queryKey: ["me"] }),
        qc.invalidateQueries({ queryKey: ["account"] }),
        qc.invalidateQueries({ queryKey: ["chats"] }),
      ]);
    },
  });
  function checkName(e: React.FormEvent) {
    e.preventDefault();
    setChecked(null);
    setNotice("");
    const value = name.trim().replace(/^@/, "");
    if (!/^[1-9][0-9]{0,5}$/.test(value)) {
      setNotice("Введите от 1 до 6 цифр, без нуля в начале.");
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
        title: `Купить @${selected.username}?`,
        description: `С баланса спишется ${selected.price.toLocaleString("ru-RU")} нимбиков. @${selected.username} станет вашим текущим именем. ${/^\d+$/.test(old) ? `@${old} останется в коллекции.` : `Прежнее имя @${old} освободится.`}`,
        label: "Купить юзернейм",
      })
    )
      action.mutate({ path: "/buy", username: selected.username });
  }
  const balance = wallet.data?.balance ?? 0;
  return (
    <div className="wallet-screen">
      <PageHeading
        eyebrow="ВАШЕ ПРОСТРАНСТВО"
        title="Кошелёк"
        description="Нимбики, юзернеймы и немного индивидуальности."
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
              Нимбики — внутренняя валюта Nimb. Используйте их для покупки
              числовых юзернеймов.
            </span>
          </div>
          <section className="wallet-card">
            <div className="wallet-card-heading">
              <Hash size={18} />
              <h2>Мои юзернеймы</h2>
              <span className="count-tag">
                {wallet.data?.owned.length ?? "—"}
              </span>
            </div>
            {wallet.isLoading ? (
              <p className="muted">Загрузка коллекции…</p>
            ) : wallet.isError ? (
              <p>Коллекция временно недоступна.</p>
            ) : wallet.data?.owned.length ? (
              wallet.data.owned.map((item) => (
                <div className="wallet-owned" key={item.username}>
                  <span className="wallet-owned-icon">
                    <AtSign size={17} />
                  </span>
                  <span>
                    <strong>@{item.username}</strong>
                    <small>
                      В коллекции с{" "}
                      {new Date(item.purchasedAt).toLocaleDateString("ru-RU")}
                    </small>
                  </span>
                  {wallet.data?.username === item.username ? (
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
                            title: `Выбрать @${item.username}?`,
                            description: `Этот юзернейм станет вашим текущим именем. ${/^\d+$/.test(wallet.data?.username || "") ? "Прежний числовой юзернейм останется в коллекции." : "Прежнее обычное имя освободится."}`,
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
              ))
            ) : (
              <div className="wallet-empty">
                <AtSign size={28} strokeWidth={1.3} />
                <p>
                  Ваша коллекция начинается здесь.
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
              <h2>Ваше особенное имя</h2>
            </div>
            <p>
              Короткий номер вместо обычного юзернейма. Найдите свой и заберите
              его в коллекцию.
            </p>
            <div className="wallet-price-list">
              <div>
                <span>1 цифра</span>
                <strong>10 000</strong>
                <small>нимбиков</small>
              </div>
              <div>
                <span>2 цифры</span>
                <strong>5 000</strong>
                <small>нимбиков</small>
              </div>
              <div>
                <span>3–6 цифр</span>
                <strong>1 000</strong>
                <small>нимбиков</small>
              </div>
            </div>
            <form className="wallet-form" onSubmit={checkName}>
              <label>
                <span aria-hidden="true">@</span>
                <input
                  aria-label="Числовой юзернейм"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setChecked(null);
                    setNotice("");
                    check.reset();
                  }}
                  disabled={check.isPending || action.isPending}
                  placeholder="Например, 777"
                  inputMode="numeric"
                  maxLength={6}
                />
              </label>
              <button
                className="primary"
                disabled={check.isPending || action.isPending || !name.trim()}
              >
                {check.isPending ? "Проверяем…" : "Проверить"}
              </button>
            </form>
            <p className="wallet-help">От 1 до 6 цифр. Без нуля в начале.</p>
            {check.isError && <p className="error">{check.error.message}</p>}
            {checked && (
              <div className="wallet-result" role="status">
                <span>
                  <strong>@{checked.username}</strong>
                  <small>
                    {checked.owned
                      ? "Уже в вашей коллекции"
                      : checked.available
                        ? `${checked.price.toLocaleString("ru-RU")} нимбиков · Свободен`
                        : "Этот юзернейм уже занят"}
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
              Купленное имя становится вашим @юзернеймом. Можно собрать
              несколько и переключаться между ними.
            </p>
            <p>
              Числовой ID аккаунта остаётся прежним. Переписки, подарки и
              публикации сохраняются.
            </p>
          </section>
        </div>
      </div>
      {dialog}
    </div>
  );
}
