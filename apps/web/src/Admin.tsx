import { PageHeading, useConfirmation } from "./UI";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Gift,
  Users,
  AlertCircle,
  MessagesSquare,
  Coins,
  Search,
  Shield,
} from "lucide-react";
type User = {
  id: number;
  name: string;
  username: string;
  suspended: boolean;
  createdAt: string;
  nimbBalance: number;
};
type Report = {
  id: number;
  reason: string;
  createdAt: string;
  reporter: User;
  reported: User;
};
type GiftTemplate = { id: string; name: string; icon: string };
async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch("/api/admin" + path, {
    method: body ? "POST" : "GET",
    credentials: "include",
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Ошибка запроса");
  return data;
}
function UserAdmin({ user, gifts }: { user: User; gifts: GiftTemplate[] }) {
  const qc = useQueryClient();
  const { ask, dialog } = useConfirmation();
  const [expanded, setExpanded] = useState(false);
  const [amount, setAmount] = useState("");
  const [gift, setGift] = useState("star");
  const [notice, setNotice] = useState("");
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      request(path, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["account"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["gifts", user.id] });
    },
  });
  async function grantCurrency(e: React.FormEvent) {
    e.preventDefault();
    setNotice("");
    const n = Number(amount);
    if (!Number.isInteger(n) || n < 1 || n > 1000000) {
      setNotice("Введите количество от 1 до 1 000 000");
      return;
    }
    if (
      !(await ask({
        title: "Выдать нимбики",
        description: `Начислить @${user.username} ${n.toLocaleString("ru-RU")} нимбиков?`,
        label: "Выдать",
      }))
    )
      return;
    action.mutate(
      { path: `/users/${user.id}/currency`, body: { amount: n } },
      {
        onSuccess: () => {
          setAmount("");
          setNotice("Нимбики выданы");
        },
      },
    );
  }
  async function grantGift(e: React.FormEvent) {
    e.preventDefault();
    setNotice("");
    const selected = gifts.find((g) => g.id === gift);
    if (
      !selected ||
      !(await ask({
        title: "Выдать подарок",
        description: `Отправить @${user.username} подарок «${selected.name}»?`,
        label: "Подарить",
      }))
    )
      return;
    action.mutate(
      { path: `/users/${user.id}/gifts`, body: { template: gift } },
      { onSuccess: () => setNotice("Подарок выдан") },
    );
  }
  return (
    <article className="admin-user">
      <button
        className="admin-user-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="admin-user-avatar">
          {user.name.trim().slice(0, 1).toUpperCase()}
        </span>
        <span className="admin-user-identity">
          <strong>{user.name}</strong>
          <small>
            @{user.username} · ID {user.id}
          </small>
        </span>
        <span
          className={
            "admin-user-status " + (user.suspended ? "is-suspended" : "")
          }
        >
          {user.suspended ? "Ограничен" : "Активен"}
        </span>
        <ChevronDown size={17} className={expanded ? "rotated" : ""} />
      </button>
      {expanded && (
        <div className="admin-user-details">
          <div className="admin-balance">
            <Coins size={17} />
            <span>Баланс</span>
            <strong>{user.nimbBalance.toLocaleString("ru-RU")} нимбиков</strong>
          </div>
          <form className="admin-grant" onSubmit={grantCurrency}>
            <label>
              Выдать нимбики
              <input
                type="number"
                min="1"
                max="1000000"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Количество"
                required
              />
            </label>
            <button disabled={action.isPending}>Выдать</button>
          </form>
          <form className="admin-grant" onSubmit={grantGift}>
            <label>
              Выдать подарок
              <select value={gift} onChange={(e) => setGift(e.target.value)}>
                {gifts.map((g) => (
                  <option value={g.id} key={g.id}>
                    {g.icon} {g.name}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={action.isPending || !gifts.length}>
              <Gift size={15} /> Подарить
            </button>
          </form>
          {notice && (
            <p className="admin-notice" role="status">
              {notice}
            </p>
          )}
          {action.isError && <p className="error">{action.error.message}</p>}
          {user.id !== 1 && (
            <button
              className="admin-restrict"
              disabled={action.isPending}
              onClick={async () => {
                setNotice("");
                if (
                  await ask({
                    title: user.suspended
                      ? "Восстановить доступ"
                      : "Ограничить доступ",
                    description: `${user.suspended ? "Восстановить" : "Ограничить"} доступ @${user.username}?`,
                    label: "Подтвердить",
                    danger: !user.suspended,
                  })
                )
                  action.mutate({
                    path: `/users/${user.id}/suspension`,
                    body: { suspended: !user.suspended },
                  });
              }}
            >
              {user.suspended ? "Восстановить доступ" : "Ограничить доступ"}
            </button>
          )}
        </div>
      )}
      {dialog}
    </article>
  );
}
export function Admin() {
  const [tab, setTab] = useState<"reports" | "users">("users");
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const { ask, dialog } = useConfirmation();
  const overview = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () =>
      request<{ users: number; communities: number; openReports: number }>(
        "/overview",
      ),
  });
  const reports = useQuery({
    queryKey: ["admin", "reports"],
    queryFn: () => request<{ reports: Report[] }>("/reports"),
  });
  const users = useQuery({
    queryKey: ["admin", "users", search],
    queryFn: () =>
      request<{ users: User[] }>("/users?q=" + encodeURIComponent(search)),
    enabled: tab === "users",
  });
  const catalog = useQuery({
    queryKey: ["gift-catalog"],
    queryFn: async () => {
      const r = await fetch("/api/catalog/gifts", { credentials: "include" });
      if (!r.ok) throw new Error("Не удалось загрузить подарки");
      return r.json() as Promise<{ templates: GiftTemplate[] }>;
    },
    enabled: tab === "users",
  });
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      request(path, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
  });
  return (
    <section className="admin-panel">
      <PageHeading
        eyebrow="УПРАВЛЕНИЕ"
        title="Админ-панель"
        description="Пользователи, награды и порядок в сообществе."
      />
      {overview.isError && <p className="error">{overview.error.message}</p>}
      <div className="admin-stats">
        <div>
          <span>
            <Users size={16} /> Пользователи
          </span>
          <strong>{overview.data?.users ?? "—"}</strong>
        </div>
        <div>
          <span>
            <MessagesSquare size={16} /> Сообщества
          </span>
          <strong>{overview.data?.communities ?? "—"}</strong>
        </div>
        <div>
          <span>
            <AlertCircle size={16} /> Жалобы
          </span>
          <strong>{overview.data?.openReports ?? "—"}</strong>
        </div>
      </div>
      <div
        className="admin-tabs"
        role="tablist"
        aria-label="Разделы администрирования"
      >
        <button
          role="tab"
          aria-selected={tab === "users"}
          className={tab === "users" ? "active" : ""}
          onClick={() => setTab("users")}
        >
          Пользователи
        </button>
        <button
          role="tab"
          aria-selected={tab === "reports"}
          className={tab === "reports" ? "active" : ""}
          onClick={() => setTab("reports")}
        >
          Жалобы
          {overview.data?.openReports ? ` · ${overview.data.openReports}` : ""}
        </button>
      </div>
      {action.isError && <p className="error">{action.error.message}</p>}
      {tab === "reports" ? (
        <div className="admin-items">
          {reports.isLoading && <p className="muted">Загрузка жалоб…</p>}
          {reports.isError && <p className="error">{reports.error.message}</p>}
          {reports.data?.reports.length === 0 && (
            <div className="admin-empty">
              <AlertCircle size={21} />
              <strong>Новых жалоб нет</strong>
              <span>Здесь появятся жалобы пользователей.</span>
            </div>
          )}
          {reports.data?.reports.map((r) => (
            <article className="admin-report" key={r.id}>
              <strong>@{r.reported.username}</strong>
              <small>
                Жалоба от @{r.reporter.username} ·{" "}
                {new Date(r.createdAt).toLocaleDateString("ru-RU")}
              </small>
              <p>{r.reason}</p>
              <div>
                <button
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      path: `/reports/${r.id}/resolve`,
                      body: {},
                    })
                  }
                >
                  Рассмотрено
                </button>
                <button
                  disabled={action.isPending || r.reported.suspended}
                  onClick={async () => {
                    if (
                      await ask({
                        title: "Ограничить доступ",
                        description: `Ограничить доступ @${r.reported.username}?`,
                        label: "Ограничить",
                        danger: true,
                      })
                    )
                      action.mutate({
                        path: `/users/${r.reported.id}/suspension`,
                        body: { suspended: true },
                      });
                  }}
                >
                  {r.reported.suspended ? "Ограничен" : "Ограничить"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <>
          <div className="search-box admin-search">
            <Search size={17} />
            <input
              placeholder="Имя, @username или ID"
              aria-label="Найти пользователя"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {users.isLoading && <p className="muted">Загрузка пользователей…</p>}
          {users.isError && <p className="error">{users.error.message}</p>}
          {catalog.isError && <p className="error">{catalog.error.message}</p>}
          {users.data?.users.length === 0 && (
            <div className="admin-empty">
              <Search size={21} />
              <strong>Никого не нашли</strong>
              <span>Попробуйте другое имя или ID.</span>
            </div>
          )}
          <div className="admin-items">
            {users.data?.users.map((u) => (
              <UserAdmin
                key={u.id}
                user={u}
                gifts={catalog.data?.templates || []}
              />
            ))}
          </div>
        </>
      )}
      {dialog}
    </section>
  );
}
