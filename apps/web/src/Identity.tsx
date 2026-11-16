import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bug,
  FlaskConical,
  Gem,
  Plus,
  Users,
  Sparkles,
  Check,
} from "lucide-react";
import { Dialog, useConfirmation } from "./UI";

export type Identity = {
  id: number;
  name: string;
  verified?: boolean;
  plus?: boolean;
  nameFont?: string;
  nameEffect?: string;
  profileAccent?: string;
  collectibleNumber?: string | null;
};
export function VerifiedBadge() {
  return (
    <svg
      className="verified-badge"
      viewBox="0 0 24 24"
      role="img"
      aria-label="Подтверждён владельцем nimb"
    >
      <title>Подтверждён владельцем nimb</title>
      <path
        fill="currentColor"
        d="m12 1.5 2.6 2.2 3.4.1.7 3.3 2.8 2-1.3 3.2.6 3.4-3.1 1.4-1.6 3-3.3-.7-3.1 1.4-2.1-2.7-3.3-.6-.2-3.4-2.2-2.6 2.2-2.6.2-3.4 3.3-.6L12 1.5Z"
      />
      <path
        d="m7.7 11.8 2.8 2.8 5.8-6"
        fill="none"
        stroke="#15202c"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function BadgeIcon({ id, size = 22 }: { id: string; size?: number }) {
  const Icon = (
    {
      bug_hunter: Bug,
      nimb_team: Users,
      beta_tester: FlaskConical,
      plus: Plus,
    } as const
  )[id as "plus"];
  return Icon ? <Icon size={size} /> : <Gem size={size} />;
}
export function UserName({ user }: { user: Identity }) {
  const custom = user.id === 1 || user.plus;
  return (
    <span className="user-name">
      <span
        className={`name-text font-${custom ? user.nameFont || "default" : "default"} effect-${custom ? user.nameEffect || "none" : "none"}`}
      >
        {user.name}
      </span>
      {user.verified && <VerifiedBadge />}
      {user.plus && (
        <span className="plus-inline" title="nimb Plus" aria-label="nimb Plus">
          <Plus size={12} strokeWidth={3} />
        </span>
      )}
    </span>
  );
}
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch("/api" + path, {
    credentials: "include",
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await res.json();
  if (!res.ok) throw new Error(value.error || "Ошибка запроса");
  return value;
}
const options = [
  {
    id: "verified",
    name: "Верификация",
    description: "Белая галочка рядом с именем.",
  },
  {
    id: "bug_hunter",
    name: "Bug Hunter",
    description: "За найденные баги и полезные отчёты.",
  },
  {
    id: "nimb_team",
    name: "Nimb team",
    description: "Для участников команды nimb.",
  },
  {
    id: "beta_tester",
    name: "Beta tester",
    description: "За помощь в тестировании.",
  },
  { id: "plus", name: "Plus", description: "Значок и персонализация профиля." },
];
export function IdentityManager({
  userId,
  onClose,
}: {
  userId: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { ask, dialog } = useConfirmation();
  const query = useQuery({
    queryKey: ["identity", userId],
    queryFn: () =>
      request<{
        user: Identity & { username: string; badges: { badge: string }[] };
        history: {
          id: number;
          kind: string;
          enabled: boolean;
          createdAt: string;
        }[];
      }>(`/admin/users/${userId}/identity`),
  });
  const action = useMutation({
    mutationFn: (body: { kind: string; enabled: boolean }) =>
      request(`/admin/users/${userId}/identity`, "POST", body),
    onSuccess: async () => {
      await Promise.all(
        ["identity", "admin", "me", "badges", "profile", "chats", "posts"].map(
          (key) => qc.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  return (
    <>
      <Dialog title="Значки и привилегии" onClose={onClose}>
        <div className="identity-manager">
          <p className="muted">
            {query.data
              ? `@${query.data.user.username} · ID ${userId}`
              : "Загрузка пользователя…"}
          </p>
          <p>Выдавать и отзывать привилегии может только владелец nimb.</p>
          {query.isError && <p className="error">{query.error.message}</p>}
          {query.data &&
            options.map((option) => {
              const u = query.data.user;
              const enabled =
                option.id === "verified"
                  ? u.verified
                  : option.id === "plus"
                    ? u.plus
                    : u.badges.some((b) => b.badge === option.id);
              return (
                <div
                  className={`identity-option badge-${option.id}`}
                  key={option.id}
                >
                  <span className="identity-symbol">
                    {option.id === "verified" ? (
                      <VerifiedBadge />
                    ) : (
                      <BadgeIcon id={option.id} />
                    )}
                  </span>
                  <div>
                    <strong>{option.name}</strong>
                    <small>{option.description}</small>
                  </div>
                  <button
                    className={enabled ? "outline" : "primary"}
                    disabled={action.isPending}
                    onClick={async () => {
                      if (
                        await ask({
                          title: `${enabled ? "Отозвать" : "Выдать"} ${option.name}?`,
                          description: `Пользователь @${u.username}. ${option.id === "plus" && enabled ? "Персональное оформление будет сброшено." : "Изменение сразу появится в профиле."}`,
                          label: enabled ? "Отозвать" : "Выдать",
                        })
                      )
                        action.mutate({ kind: option.id, enabled: !enabled });
                    }}
                  >
                    {enabled ? "Отозвать" : "Выдать"}
                  </button>
                </div>
              );
            })}
          {action.isError && <p className="error">{action.error.message}</p>}
          {query.data && query.data.history.length > 0 && (
            <div className="identity-history">
              <h3>История выдачи</h3>
              {query.data.history.map((e) => (
                <div key={e.id}>
                  <span>
                    {options.find((o) => o.id === e.kind)?.name} ·{" "}
                    {e.enabled ? "выдан" : "отозван"}
                  </span>
                  <small>{new Date(e.createdAt).toLocaleString("ru-RU")}</small>
                </div>
              ))}
            </div>
          )}
        </div>
      </Dialog>
      {dialog}
    </>
  );
}
export function IdentitySettings({ user }: { user: Identity }) {
  const qc = useQueryClient();
  const [font, setFont] = useState(user.nameFont || "default");
  const [effect, setEffect] = useState(user.nameEffect || "none");
  const [accent, setAccent] = useState(user.profileAccent || "gold");
  const save = useMutation({
    mutationFn: () =>
      request("/me/appearance", "PATCH", {
        nameFont: font,
        nameEffect: effect,
        profileAccent: accent,
      }),
    onSuccess: () => {
      ["me", "profile", "chats", "posts"].forEach((key) =>
        qc.invalidateQueries({ queryKey: [key] }),
      );
    },
  });
  const allowed = user.id === 1 || user.plus;
  return (
    <section className="setting-detail plus-settings">
      <div className="plus-heading">
        <span className="plus-emblem">
          <Plus size={30} />
        </span>
        <div>
          <span className="eyebrow">ВАШ ХАРАКТЕР</span>
          <h2>nimb Plus</h2>
        </div>
      </div>
      <p>
        Имя, которое запоминают. Выберите свой шрифт, свечение и цвет профиля.
      </p>
      {!allowed ? (
        <div className="plus-locked">
          <Sparkles size={24} />
          <h3>Чуть больше вас</h3>
          <p>
            Plus подключает владелец nimb. Подписка открывает оформление имени и
            обложки, а рядом с ником появляется значок Plus.
          </p>
        </div>
      ) : (
        <form
          className="preference-form"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className={`identity-preview accent-${accent}`}>
            <span className="preview-orbit" />
            <UserName user={{ ...user, nameFont: font, nameEffect: effect }} />
            <small>Так ваше имя увидят другие</small>
          </div>
          <label>
            Шрифт имени
            <select
              value={font}
              onChange={(e) => {
                setFont(e.target.value);
                save.reset();
              }}
            >
              <option value="default">Как в приложении</option>
              <option value="inter">Inter · лаконичный</option>
              <option value="rubik">Rubik · округлый</option>
              <option value="serif">Serif · классический</option>
              <option value="mono">Mono · технический</option>
            </select>
          </label>
          <label>
            Эффект имени
            <select
              value={effect}
              onChange={(e) => {
                setEffect(e.target.value);
                save.reset();
              }}
            >
              <option value="none">Без эффекта</option>
              <option value="gold">Золотой перелив</option>
              <option value="aurora">Северное сияние</option>
              {user.id === 1 && (
                <option value="rainbow">Радуга · владелец</option>
              )}
            </select>
          </label>
          <fieldset className="accent-picker">
            <legend>Цвет профиля</legend>
            {[
              ["gold", "Шампань"],
              ["violet", "Лаванда"],
              ["ocean", "Океан"],
              ["rose", "Роза"],
              ["mint", "Мята"],
            ].map(([value, label]) => (
              <button
                type="button"
                className={`accent-${value}`}
                key={value}
                aria-label={label}
                aria-pressed={accent === value}
                title={label}
                onClick={() => {
                  setAccent(value);
                  save.reset();
                }}
              >
                {accent === value && <Check size={20} />}
              </button>
            ))}
          </fieldset>
          <button className="primary" disabled={save.isPending}>
            {save.isPending ? "Сохраняем…" : "Сохранить оформление"}
          </button>
          {save.isSuccess && <p role="status">Оформление сохранено.</p>}
          {save.isError && <p className="error">{save.error.message}</p>}
        </form>
      )}
    </section>
  );
}
