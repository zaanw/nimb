import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  AtSign,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Coins,
  Gift,
  History,
  LoaderCircle,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  ShieldOff,
  Users,
  X,
} from "lucide-react";
import { Dialog, useConfirmation } from "./UI";
import "./admin.css";

type User = {
  id: number;
  name: string;
  username: string;
  suspended: boolean;
  isAdmin: boolean;
  createdAt: string;
  nimbBalance: number;
  hasAvatar?: boolean;
  mediaVersion?: number;
};
type UserDetail = User & {
  purchasedUsernames: { username: string }[];
  _count: { gifts: number; purchasedUsernames: number };
};
type UserPage = {
  users: User[];
  total: number;
  page: number;
  pageSize: number;
};
type Report = {
  id: number;
  reason: string;
  createdAt: string;
  reporter: User;
  reported: User;
};
type GiftTemplate = {
  id: string;
  name: string;
  icon: string;
  rarity: string;
  color: string;
};
type Operation = {
  id: string;
  kind: GrantKind;
  label: string;
  value: string;
  createdAt: string;
  user: Pick<User, "id" | "username" | "name">;
  actor: Pick<User, "id" | "username" | "name"> | null;
};
type GrantKind = "currency" | "gift" | "username";
const actions = {
  currency: {
    title: "Выдать нимбики",
    description: "Пополнить баланс пользователя",
    icon: Coins,
    button: "Начислить нимбики",
  },
  gift: {
    title: "Отправить подарок",
    description: "Добавить подарок в профиль",
    icon: Gift,
    button: "Отправить подарок",
  },
  username: {
    title: "Выдать юзернейм",
    description: "Закрепить особенный номер",
    icon: AtSign,
    button: "Выдать юзернейм",
  },
};
const number = (n: number) => n.toLocaleString("ru-RU");
const date = (d: string) =>
  new Date(d).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch("/api/admin" + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Не удалось выполнить действие");
  return data;
}
function useDebounced(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 250);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}
function Portrait({ user }: { user: User }) {
  return (
    <span className="control-avatar">
      {user.hasAvatar ? (
        <img
          src={`/api/users/${user.id}/media/avatar?v=${user.mediaVersion || 0}`}
          alt=""
        />
      ) : (
        user.name.trim().slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
function Status({ user }: { user: User }) {
  return (
    <span
      className={`control-status ${user.suspended ? "restricted" : user.isAdmin ? "owner" : ""}`}
    >
      <i />
      {user.suspended
        ? "Ограничен"
        : user.isAdmin
          ? "Администратор"
          : "Активен"}
    </span>
  );
}
function Empty({
  title,
  children,
  icon = <Search size={25} />,
}: {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="control-empty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Failure({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="control-error" role="alert">
      <span>{message}</span>
      {retry && <button onClick={retry}>Повторить</button>}
    </div>
  );
}
function Operations({
  events,
  compact = false,
}: {
  events: Operation[];
  compact?: boolean;
}) {
  return (
    <div className={`control-operations ${compact ? "compact" : ""}`}>
      {events.map((event) => {
        const Icon = actions[event.kind].icon;
        return (
          <div className="control-operation" key={event.id}>
            <span className={`control-symbol ${event.kind}`}>
              <Icon size={18} />
            </span>
            <div className="control-operation-person">
              <strong>{event.label}</strong>
              <span>
                @{event.user.username}
                {!compact && event.actor
                  ? ` · от @${event.actor.username}`
                  : ""}
              </span>
            </div>
            <div className="control-operation-value">
              <strong
                className={event.kind === "currency" ? "currency-text" : ""}
              >
                {event.value}
              </strong>
              <time dateTime={event.createdAt}>
                {date(event.createdAt)} ·{" "}
                {new Date(event.createdAt).toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
          </div>
        );
      })}
    </div>
  );
}
function GrantDialog({
  kind,
  initialUser,
  gifts,
  onClose,
  onDone,
}: {
  kind: GrantKind;
  initialUser?: User;
  gifts: GiftTemplate[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [user, setUser] = useState(initialUser);
  const [search, setSearch] = useState("");
  const [picking, setPicking] = useState(!initialUser);
  const [value, setValue] = useState(
    kind === "currency" ? "1000" : kind === "gift" ? gifts[0]?.id || "" : "",
  );
  const [review, setReview] = useState(false);
  const [validation, setValidation] = useState("");
  const debounced = useDebounced(search);
  const recipients = useQuery({
    queryKey: ["admin", "recipient", debounced],
    queryFn: () =>
      request<UserPage>("/users?q=" + encodeURIComponent(debounced)),
    enabled: picking,
  });
  const config = actions[kind],
    Icon = config.icon;
  const chosenGift = gifts.find((g) => g.id === value);
  const mutation = useMutation({
    mutationFn: () =>
      request<{ balance?: number }>(
        `/users/${user!.id}/${kind === "gift" ? "gifts" : kind}`,
        kind === "currency"
          ? { amount: Number(value) }
          : kind === "gift"
            ? { template: value }
            : { username: value },
      ),
    onSuccess: () =>
      onDone(
        kind === "currency"
          ? `${number(Number(value))} нимбиков начислено @${user!.username}`
          : kind === "gift"
            ? `Подарок «${chosenGift?.name}» отправлен @${user!.username}`
            : `@${value} добавлен в коллекцию @${user!.username}`,
      ),
  });
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mutation.isPending || !user || picking) return;
    if (
      kind === "currency" &&
      (!Number.isInteger(Number(value)) ||
        Number(value) < 1 ||
        Number(value) > 1000000)
    ) {
      setValidation("Введите целое число от 1 до 1 000 000.");
      return;
    }
    if (kind === "username" && !/^[1-9][0-9]{0,5}$/.test(value)) {
      setValidation("От 1 до 6 цифр, без нуля в начале.");
      return;
    }
    if (kind === "gift" && !chosenGift) {
      setValidation("Выберите подарок.");
      return;
    }
    setValidation("");
    if (review) mutation.mutate();
    else setReview(true);
  }
  return (
    <Dialog
      title={review ? "Подтвердить выдачу" : config.title}
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
    >
      <form className="control-grant-dialog" onSubmit={submit}>
        <p className="control-dialog-intro">
          {review
            ? "Проверьте получателя и награду перед отправкой."
            : "Выберите получателя и настройте награду."}
        </p>
        <div className="control-field-label">Получатель</div>
        {user && !picking ? (
          <div className="control-recipient">
            <Portrait user={user} />
            <span>
              <strong>{user.name}</strong>
              <small>
                @{user.username} · ID {user.id}
              </small>
            </span>
            {!review && (
              <button
                type="button"
                onClick={() => {
                  setPicking(true);
                  setValidation("");
                }}
              >
                Изменить
              </button>
            )}
          </div>
        ) : (
          <div className="control-recipient-picker">
            <label className="control-search">
              <Search size={17} />
              <input
                aria-label="Найти получателя"
                placeholder="Имя, @юзернейм или ID"
                maxLength={50}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="control-recipient-options">
              {recipients.isLoading && <p>Ищем пользователей…</p>}
              {recipients.isError && (
                <Failure
                  message={recipients.error.message}
                  retry={() => recipients.refetch()}
                />
              )}
              {recipients.data?.users.length === 0 && <p>Никого не нашли.</p>}
              {recipients.data?.users.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => {
                    setUser(u);
                    setPicking(false);
                  }}
                >
                  <Portrait user={u} />
                  <span>
                    <strong>{u.name}</strong>
                    <small>
                      @{u.username} · ID {u.id}
                    </small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ))}
            </div>
          </div>
        )}
        {review ? (
          <div className={`control-review ${kind}`}>
            <span className={`control-symbol ${kind}`}>
              <Icon size={26} />
            </span>
            <strong>
              {kind === "currency"
                ? `+${number(Number(value))}`
                : kind === "username"
                  ? `@${value}`
                  : chosenGift?.icon}
            </strong>
            <span>
              {kind === "currency"
                ? "нимбиков на баланс"
                : kind === "username"
                  ? "в коллекцию юзернеймов"
                  : chosenGift?.name}
            </span>
            <p>
              {kind === "username"
                ? "Бесплатно. Пользователь сам сможет выбрать это имя в кошельке. Текущий юзернейм сохранится."
                : kind === "currency"
                  ? `Текущий баланс: ${number(user?.nimbBalance || 0)} нимбиков.`
                  : "Подарок появится в профиле получателя."}
            </p>
          </div>
        ) : (
          <>
            {kind === "currency" && (
              <>
                <label className="control-field">
                  Количество нимбиков
                  <div className="control-amount-input">
                    <Coins size={21} />
                    <input
                      autoFocus
                      aria-label="Количество нимбиков"
                      type="number"
                      min="1"
                      max="1000000"
                      step="1"
                      required
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    />
                    <span>N</span>
                  </div>
                </label>
                <div className="control-presets">
                  {[100, 500, 1000, 5000].map((n) => (
                    <button
                      type="button"
                      className={Number(value) === n ? "active" : ""}
                      key={n}
                      onClick={() => setValue(String(n))}
                    >
                      {number(n)}
                    </button>
                  ))}
                </div>
                <p className="control-field-help">
                  От 1 до 1 000 000 за одну операцию.
                </p>
              </>
            )}
            {kind === "gift" && (
              <>
                <div className="control-field-label">Коллекция подарков</div>
                <div
                  className="control-gift-picker"
                  role="group"
                  aria-label="Выберите подарок"
                >
                  {gifts.map((g) => (
                    <button
                      type="button"
                      aria-pressed={value === g.id}
                      className={`control-gift ${g.color} ${value === g.id ? "selected" : ""}`}
                      key={g.id}
                      onClick={() => setValue(g.id)}
                    >
                      <span>{g.icon}</span>
                      <strong>{g.name}</strong>
                      <small>{g.rarity}</small>
                      {value === g.id && <Check size={14} />}
                    </button>
                  ))}
                </div>
                {!gifts.length && (
                  <p className="control-field-help">
                    Каталог не загрузился. Закройте окно и обновите панель.
                  </p>
                )}
              </>
            )}
            {kind === "username" && (
              <>
                <label className="control-field">
                  Числовой юзернейм
                  <div className="control-amount-input">
                    <AtSign size={23} />
                    <input
                      autoFocus
                      aria-label="Числовой юзернейм"
                      placeholder="777"
                      inputMode="numeric"
                      pattern="[1-9][0-9]{0,5}"
                      maxLength={6}
                      required
                      value={value}
                      onChange={(e) =>
                        setValue(e.target.value.replace(/^@/, ""))
                      }
                    />
                  </div>
                </label>
                <div className="control-presets">
                  {["2", "77", "777"].map((n) => (
                    <button type="button" key={n} onClick={() => setValue(n)}>
                      Например, @{n}
                    </button>
                  ))}
                </div>
                <p className="control-field-help">
                  Имя добавится в коллекцию бесплатно. Занятые юзернеймы выдать
                  нельзя. ID аккаунта не изменится.
                </p>
              </>
            )}
          </>
        )}
        {validation && <Failure message={validation} />}
        {mutation.isError && <Failure message={mutation.error.message} />}
        <div className="control-dialog-footer">
          <button
            className="control-button"
            type="button"
            disabled={mutation.isPending}
            onClick={() =>
              review ? (setReview(false), mutation.reset()) : onClose()
            }
          >
            {review ? "Назад" : "Отмена"}
          </button>
          <button
            className="control-button solid"
            type="submit"
            disabled={
              mutation.isPending ||
              !user ||
              picking ||
              (kind === "gift" && !chosenGift)
            }
          >
            {mutation.isPending ? (
              <>
                <LoaderCircle size={16} className="control-spin" />
                Отправляем…
              </>
            ) : review ? (
              <>
                <Check size={17} />
                {config.button}
              </>
            ) : (
              <>
                Продолжить
                <ArrowUpRight size={17} />
              </>
            )}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
export function Admin() {
  const [tab, setTab] = useState<"users" | "reports" | "activity">("users");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [grant, setGrant] = useState<{ kind: GrantKind; user?: User } | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const debounced = useDebounced(search);
  const qc = useQueryClient();
  const { ask, dialog } = useConfirmation();
  const overview = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () =>
      request<{
        users: number;
        communities: number;
        openReports: number;
        newUsers: number;
        totalBalance: number;
        gifts: number;
      }>("/overview"),
  });
  const users = useQuery({
    queryKey: ["admin", "users", debounced, status, page],
    queryFn: () =>
      request<UserPage>(
        `/users?q=${encodeURIComponent(debounced)}&status=${status}&page=${page}`,
      ),
  });
  const activeId = selectedId ?? users.data?.users[0]?.id;
  const detail = useQuery({
    queryKey: ["admin", "detail", activeId],
    queryFn: () => request<{ user: UserDetail }>(`/users/${activeId}`),
    enabled: !!activeId,
  });
  const selected =
    detail.data?.user ?? users.data?.users.find((u) => u.id === activeId);
  const reports = useQuery({
    queryKey: ["admin", "reports"],
    queryFn: () => request<{ reports: Report[] }>("/reports"),
  });
  const activity = useQuery({
    queryKey: ["admin", "activity"],
    queryFn: () => request<{ events: Operation[] }>("/activity"),
  });
  const catalog = useQuery({
    queryKey: ["gift-catalog"],
    queryFn: async () => {
      const r = await fetch("/api/catalog/gifts", { credentials: "include" });
      if (!r.ok) throw new Error("Не удалось загрузить подарки");
      return r.json() as Promise<{ templates: GiftTemplate[] }>;
    },
  });
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      request(path, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
  });
  async function restrict(user: User) {
    if (
      await ask({
        title: user.suspended ? "Восстановить доступ?" : "Ограничить доступ?",
        description: user.suspended
          ? `@${user.username} снова сможет войти в nimb.`
          : `@${user.username} будет отключён от nimb и не сможет войти до снятия ограничения. Переписки и данные сохранятся.`,
        label: user.suspended ? "Восстановить" : "Ограничить доступ",
        danger: !user.suspended,
      })
    ) {
      action.mutate(
        {
          path: `/users/${user.id}/suspension`,
          body: { suspended: !user.suspended },
        },
        {
          onSuccess: () =>
            setNotice(
              user.suspended
                ? `Доступ @${user.username} восстановлен`
                : `Доступ @${user.username} ограничен`,
            ),
        },
      );
    }
  }
  async function done(message: string) {
    setGrant(null);
    setNotice(message);
    await Promise.all(
      ["admin", "wallet", "account", "me", "gifts"].map((key) =>
        qc.invalidateQueries({ queryKey: [key] }),
      ),
    );
  }
  function selectUser(id: number) {
    setSelectedId(id);
    if (window.innerWidth < 1100)
      document
        .getElementById("control-inspector")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const refreshing =
    overview.isFetching ||
    users.isFetching ||
    activity.isFetching ||
    reports.isFetching;
  return (
    <section className="admin-console">
      <header className="control-heading">
        <div className="control-heading-art" aria-hidden="true">
          <svg viewBox="0 0 400 240" fill="none">
            <defs>
              <linearGradient
                id="admin-orbit"
                x1="90"
                y1="24"
                x2="290"
                y2="225"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#f3d7a7" />
                <stop offset=".45" stopColor="#a18b68" />
                <stop offset="1" stopColor="#3c5360" />
              </linearGradient>
              <linearGradient
                id="admin-medal"
                x1="159"
                y1="65"
                x2="249"
                y2="187"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#41525a" />
                <stop offset=".55" stopColor="#25343e" />
                <stop offset="1" stopColor="#151e26" />
              </linearGradient>
            </defs>
            <ellipse
              cx="210"
              cy="124"
              rx="158"
              ry="59"
              transform="rotate(-31 210 124)"
              stroke="url(#admin-orbit)"
              strokeOpacity=".5"
            />
            <ellipse
              cx="210"
              cy="124"
              rx="143"
              ry="85"
              transform="rotate(34 210 124)"
              stroke="#76919f"
              strokeOpacity=".2"
            />
            <circle
              cx="210"
              cy="124"
              r="94"
              stroke="#d0b484"
              strokeOpacity=".12"
              strokeDasharray="2 8"
            />
            <circle
              cx="210"
              cy="124"
              r="64"
              fill="url(#admin-medal)"
              stroke="url(#admin-orbit)"
            />
            <circle
              cx="210"
              cy="124"
              r="57"
              stroke="#e6cdab"
              strokeOpacity=".1"
            />
            <path
              d="M188 146V102M188 123c0-17 8-25 21-25s22 8 22 22v26"
              stroke="#ead6b8"
              strokeWidth="9"
              strokeLinecap="round"
            />
            <circle cx="244" cy="94" r="4.5" fill="#ebca93" />
            <circle cx="330" cy="52" r="4" fill="#e3bf87" />
            <circle cx="83" cy="119" r="3" fill="#7b9aaa" />
            <circle cx="286" cy="209" r="2" fill="#bca77f" />
          </svg>
        </div>
        <div className="control-heading-copy">
          <div className="control-breadcrumb">
            <Shield size={13} />
            NIMB<span>/</span>УПРАВЛЕНИЕ
          </div>
          <h1>
            Админ-панель<span>.</span>
          </h1>
          <p>Люди, награды и всё, что происходит в nimb.</p>
        </div>
        <button
          className="control-button"
          disabled={refreshing}
          onClick={() => {
            action.reset();
            qc.invalidateQueries({ queryKey: ["admin"] });
            qc.invalidateQueries({ queryKey: ["gift-catalog"] });
          }}
        >
          <RefreshCw size={16} className={refreshing ? "control-spin" : ""} />
          <span>Обновить</span>
        </button>
      </header>
      {notice && (
        <div className="control-toast" role="status">
          <CheckCheck size={20} />
          <span>{notice}</span>
          <button aria-label="Скрыть уведомление" onClick={() => setNotice("")}>
            <X size={17} />
          </button>
        </div>
      )}
      {overview.isError && (
        <Failure
          message={overview.error.message}
          retry={() => overview.refetch()}
        />
      )}
      <div className="control-metrics">
        <div>
          <span>
            <Users size={17} />
            Пользователи
          </span>
          <strong>{overview.data ? number(overview.data.users) : "—"}</strong>
          <small>
            {overview.data
              ? `+${number(overview.data.newUsers)} за 7 дней`
              : "Загружаем данные"}
          </small>
        </div>
        <div className="gold-metric">
          <span>
            <Coins size={17} />
            Нимбики в обороте
          </span>
          <strong>
            {overview.data ? number(overview.data.totalBalance) : "—"}
            <em>N</em>
          </strong>
          <small>Сумма балансов пользователей</small>
        </div>
        <div>
          <span>
            <Gift size={17} />
            Подарки
          </span>
          <strong>{overview.data ? number(overview.data.gifts) : "—"}</strong>
          <small>В коллекциях пользователей</small>
        </div>
        <button onClick={() => setTab("reports")}>
          <span>
            <ShieldCheck size={17} />
            Открытые жалобы
            <ArrowUpRight size={14} />
          </span>
          <strong>
            {overview.data ? number(overview.data.openReports) : "—"}
          </strong>
          <small>
            {overview.data?.openReports
              ? "Ожидают рассмотрения"
              : "Новые обращения появятся здесь"}
          </small>
        </button>
      </div>
      <div className="control-shortcuts">
        {(Object.keys(actions) as GrantKind[]).map((kind) => {
          const item = actions[kind],
            Icon = item.icon;
          return (
            <button
              key={kind}
              onClick={() => setGrant({ kind, user: selected })}
            >
              <span className={`control-symbol ${kind}`}>
                <Icon size={22} />
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>
              <ArrowUpRight size={18} />
            </button>
          );
        })}
      </div>
      <nav className="control-tabs" aria-label="Разделы админ-панели">
        {(
          [
            {
              id: "users",
              label: "Пользователи",
              icon: Users,
              count: overview.data?.users,
            },
            {
              id: "reports",
              label: "Жалобы",
              icon: ShieldCheck,
              count: overview.data?.openReports,
            },
            { id: "activity", label: "История операций", icon: History },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            aria-current={tab === item.id ? "page" : undefined}
            className={tab === item.id ? "active" : ""}
            onClick={() => setTab(item.id)}
          >
            <item.icon size={16} />
            {item.label}
            {"count" in item && <span>{item.count ?? "—"}</span>}
          </button>
        ))}
      </nav>
      {action.isError && <Failure message={action.error.message} />}
      {tab === "users" && (
        <div className="control-workspace">
          <div className="control-main-column">
            <section className="control-panel">
              <div className="control-panel-heading">
                <div>
                  <h2>Пользователи</h2>
                  <p>Награды и управление аккаунтами</p>
                </div>
                <span className="control-count">
                  {users.data?.total ?? "—"}
                </span>
              </div>
              <div className="control-toolbar">
                <label className="control-search">
                  <Search size={17} />
                  <input
                    aria-label="Найти пользователя"
                    placeholder="Имя, @юзернейм или ID"
                    maxLength={50}
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                      setSelectedId(null);
                    }}
                  />
                  {search && (
                    <button
                      aria-label="Очистить поиск"
                      onClick={() => {
                        setSearch("");
                        setPage(1);
                      }}
                    >
                      <X size={15} />
                    </button>
                  )}
                </label>
                <select
                  aria-label="Статус пользователей"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                    setSelectedId(null);
                  }}
                >
                  <option value="all">Все статусы</option>
                  <option value="active">Активные</option>
                  <option value="suspended">Ограниченные</option>
                </select>
              </div>
              {users.isLoading && (
                <div className="control-loading">
                  <LoaderCircle className="control-spin" size={22} />
                  Загружаем пользователей…
                </div>
              )}
              {users.isError && (
                <Failure
                  message={users.error.message}
                  retry={() => users.refetch()}
                />
              )}
              {users.data?.users.length === 0 && (
                <Empty title="Никого не нашли">
                  Попробуйте другое имя или измените фильтр.
                </Empty>
              )}
              {!!users.data?.users.length && (
                <div className="control-user-table">
                  <div className="control-table-labels">
                    <span>Пользователь</span>
                    <span>Баланс</span>
                    <span>Быстрые действия</span>
                  </div>
                  {users.data.users.map((user) => (
                    <article
                      className={`control-user-row ${user.id === activeId ? "selected" : ""}`}
                      key={user.id}
                    >
                      <button
                        className="control-user-info"
                        aria-label={`Управлять @${user.username}`}
                        aria-pressed={activeId === user.id}
                        onClick={() => selectUser(user.id)}
                      >
                        <Portrait user={user} />
                        <span>
                          <strong>
                            {user.name}
                            {user.isAdmin && <ShieldCheck size={12} />}
                          </strong>
                          <small>
                            @{user.username} <span>· ID {user.id}</span>
                          </small>
                          <Status user={user} />
                        </span>
                      </button>
                      <div className="control-user-balance">
                        <strong>{number(user.nimbBalance)}</strong>
                        <small>нимбиков</small>
                      </div>
                      <div className="control-row-actions">
                        {(Object.keys(actions) as GrantKind[]).map((kind) => {
                          const Icon = actions[kind].icon;
                          return (
                            <button
                              key={kind}
                              title={`${actions[kind].title} · @${user.username}`}
                              aria-label={`${actions[kind].title} пользователю @${user.username}`}
                              onClick={() => setGrant({ kind, user })}
                            >
                              <Icon size={16} />
                              <span>
                                {kind === "currency"
                                  ? "Нимбики"
                                  : kind === "gift"
                                    ? "Подарок"
                                    : "Юзернейм"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {users.data && users.data.total > 0 && (
                <footer className="control-pagination">
                  <span>
                    {(page - 1) * 20 + 1}–
                    {Math.min(page * 20, users.data.total)} из{" "}
                    {number(users.data.total)}
                  </span>
                  <div>
                    <button
                      aria-label="Предыдущая страница"
                      disabled={page === 1}
                      onClick={() => {
                        setPage(page - 1);
                        setSelectedId(null);
                      }}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span>{page}</span>
                    <button
                      aria-label="Следующая страница"
                      disabled={page * 20 >= users.data.total}
                      onClick={() => {
                        setPage(page + 1);
                        setSelectedId(null);
                      }}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </footer>
              )}
            </section>
            <section className="control-panel">
              <div className="control-panel-heading">
                <div>
                  <h2>Последние операции</h2>
                  <p>Начисления, подарки и юзернеймы</p>
                </div>
                <button
                  className="control-text-link"
                  onClick={() => setTab("activity")}
                >
                  Все
                  <ArrowUpRight size={14} />
                </button>
              </div>
              {activity.isLoading ? (
                <div className="control-loading">Загружаем историю…</div>
              ) : activity.isError ? (
                <Failure
                  message={activity.error.message}
                  retry={() => activity.refetch()}
                />
              ) : activity.data?.events.length ? (
                <Operations events={activity.data.events.slice(0, 4)} compact />
              ) : (
                <Empty
                  title="История начинается здесь"
                  icon={<History size={25} />}
                >
                  Выдайте первую награду — операция появится в этом списке.
                </Empty>
              )}
            </section>
          </div>
          <aside
            className="control-inspector control-panel"
            id="control-inspector"
          >
            <div className="control-inspector-label">
              <span>КАРТОЧКА ПОЛЬЗОВАТЕЛЯ</span>
              <Shield size={14} />
            </div>
            {detail.isError ? (
              <Failure
                message={detail.error.message}
                retry={() => detail.refetch()}
              />
            ) : selected ? (
              <>
                <div className="control-person">
                  <Portrait user={selected} />
                  <h2>{selected.name}</h2>
                  <p>
                    @{selected.username} <span>· ID {selected.id}</span>
                  </p>
                  <Status user={selected} />
                </div>
                <div className="control-person-balance">
                  <span>
                    Баланс пользователя
                    <Coins size={17} />
                  </span>
                  <strong>
                    {number(selected.nimbBalance)}
                    <small>N</small>
                  </strong>
                  <button
                    onClick={() =>
                      setGrant({ kind: "currency", user: selected })
                    }
                  >
                    Пополнить баланс
                    <ArrowUpRight size={15} />
                  </button>
                </div>
                <div className="control-person-actions">
                  <button
                    onClick={() => setGrant({ kind: "gift", user: selected })}
                  >
                    <Gift size={18} />
                    <span>Отправить подарок</span>
                    <ChevronRight size={15} />
                  </button>
                  <button
                    onClick={() =>
                      setGrant({ kind: "username", user: selected })
                    }
                  >
                    <AtSign size={18} />
                    <span>Выдать юзернейм</span>
                    <ChevronRight size={15} />
                  </button>
                </div>
                <dl className="control-person-meta">
                  <div>
                    <dt>В nimb с</dt>
                    <dd>{date(selected.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Подарки</dt>
                    <dd>{detail.data?.user._count.gifts ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Юзернеймы</dt>
                    <dd>
                      {detail.data?.user._count.purchasedUsernames ?? "—"}
                    </dd>
                  </div>
                </dl>
                {!!detail.data?.user.purchasedUsernames.length && (
                  <div className="control-owned-names">
                    {detail.data.user.purchasedUsernames.map((n) => (
                      <span key={n.username}>@{n.username}</span>
                    ))}
                  </div>
                )}
                <div className="control-person-footer">
                  {selected.isAdmin ? (
                    <p>
                      <ShieldCheck size={15} />
                      Аккаунт администратора защищён
                    </p>
                  ) : (
                    <button
                      disabled={action.isPending}
                      onClick={() => restrict(selected)}
                    >
                      {selected.suspended ? (
                        <ShieldCheck size={16} />
                      ) : (
                        <ShieldOff size={16} />
                      )}
                      {selected.suspended
                        ? "Восстановить доступ"
                        : "Ограничить доступ"}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <Empty title="Выберите пользователя">
                Откройте аккаунт из списка, чтобы управлять им.
              </Empty>
            )}
          </aside>
        </div>
      )}
      {tab === "reports" && (
        <section className="control-panel">
          <div className="control-panel-heading">
            <div>
              <h2>Очередь обращений</h2>
              <p>Открытые жалобы пользователей · до 100 последних</p>
            </div>
            <span className="control-count">
              {overview.data?.openReports ?? "—"}
            </span>
          </div>
          {reports.isLoading && (
            <div className="control-loading">Загружаем обращения…</div>
          )}
          {reports.isError && (
            <Failure
              message={reports.error.message}
              retry={() => reports.refetch()}
            />
          )}
          {reports.data?.reports.length === 0 && (
            <Empty title="Все спокойно" icon={<ShieldCheck size={30} />}>
              Открытых жалоб нет. Если понадобится ваше внимание, обращение
              появится здесь.
            </Empty>
          )}
          {reports.data?.reports.map((r) => (
            <article className="control-report" key={r.id}>
              <div className="control-report-heading">
                <span className="control-symbol">
                  <Shield size={19} />
                </span>
                <div>
                  <strong>Жалоба на @{r.reported.username}</strong>
                  <small>
                    От @{r.reporter.username} · {date(r.createdAt)}
                  </small>
                </div>
                <span className="control-count">#{r.id}</span>
              </div>
              <p>{r.reason}</p>
              <div className="control-report-actions">
                <button
                  className="control-button solid"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate(
                      { path: `/reports/${r.id}/resolve`, body: {} },
                      { onSuccess: () => setNotice(`Жалоба №${r.id} закрыта`) },
                    )
                  }
                >
                  <Check size={16} />
                  Закрыть жалобу
                </button>
                <button
                  className="control-button danger"
                  disabled={
                    action.isPending ||
                    r.reported.suspended ||
                    r.reported.isAdmin
                  }
                  onClick={() => restrict(r.reported)}
                >
                  <ShieldOff size={16} />
                  {r.reported.suspended ? "Уже ограничен" : "Ограничить доступ"}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
      {tab === "activity" && (
        <section className="control-panel">
          <div className="control-panel-heading">
            <div>
              <h2>История операций</h2>
              <p>Последние 50 начислений, подарков и покупок юзернеймов</p>
            </div>
            <History size={19} />
          </div>
          {activity.isLoading && (
            <div className="control-loading">Загружаем операции…</div>
          )}
          {activity.isError && (
            <Failure
              message={activity.error.message}
              retry={() => activity.refetch()}
            />
          )}
          {activity.data?.events.length ? (
            <Operations events={activity.data.events} />
          ) : (
            !activity.isLoading &&
            !activity.isError && (
              <Empty
                title="Пока без операций"
                icon={<ArrowDownLeft size={26} />}
              >
                Здесь сохранится история наград и покупок.
              </Empty>
            )
          )}
        </section>
      )}
      <footer className="control-footer">
        <span>
          <ShieldCheck size={13} />
          Только для администраторов
        </span>
        <span>nimb · {overview.data?.communities ?? "—"} сообществ</span>
      </footer>
      {catalog.isError && (
        <Failure
          message={catalog.error.message}
          retry={() => catalog.refetch()}
        />
      )}
      {grant && (
        <GrantDialog
          kind={grant.kind}
          initialUser={grant.user}
          gifts={catalog.data?.templates || []}
          onClose={() => setGrant(null)}
          onDone={done}
        />
      )}
      {dialog}
    </section>
  );
}
