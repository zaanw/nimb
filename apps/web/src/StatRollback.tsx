import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Save, RotateCcw } from "lucide-react";
import { Dialog, useConfirmation } from "./UI";

const statNames: Record<string, string> = {
  messages: "Сообщения",
  posts: "Публикации",
  comments: "Комментарии",
  reactions: "Реакции",
  followers: "Подписчики",
  following: "Подписки",
};
const labels: Record<string, string> = {
  balance: "Нимбики",
  gifts: "Подарки",
  names: "Коллекционные адреса",
  badges: "Значки",
  verified: "Верификация",
  plus: "Plus",
  username: "Основной юзернейм",
  number: "Активный номер",
  appearance: "Оформление имени",
};
type Point = { id: number; label: string; createdAt: string };
type Preview = {
  point: Point;
  token: string;
  changes: Record<string, { before: unknown; after: unknown }> & {
    stats: { before: Record<string, number>; after: Record<string, number> };
  };
};
function value(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Включено" : "Выключено";
  if (Array.isArray(v)) return v.join(", ") || "—";
  return String(v);
}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch("/api/admin" + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Не удалось выполнить откат");
  return d;
}
export function StatRollback({
  userId,
  name,
  onClose,
}: {
  userId: number;
  name: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { ask, dialog } = useConfirmation();
  const [label, setLabel] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState("");
  const base = `/users/${userId}`;
  const points = useQuery({
    queryKey: ["checkpoints", userId],
    queryFn: () =>
      request<{ points: Point[]; stats: Record<string, number> }>(
        base + "/checkpoints",
      ),
  });
  async function refresh() {
    await Promise.all(
      [
        "checkpoints",
        "admin",
        "me",
        "wallet",
        "badges",
        "gifts",
        "identifiers",
        "chats",
        "profile",
        "users",
        "posts",
        "account",
      ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
    );
  }
  const create = useMutation({
    mutationFn: () => request(base + "/checkpoints", { label: label.trim() }),
    onSuccess: async () => {
      setLabel("");
      setNotice("Точка восстановления создана.");
      await refresh();
    },
  });
  const inspect = useMutation({
    mutationFn: (id: number) =>
      request<Preview>(base + `/checkpoints/${id}/preview`, {}),
    onSuccess: (data) => {
      setPreview(data);
      setNotice("");
    },
  });
  const clearAll = useMutation({
    mutationFn: () =>
      request<{ point: Point }>(base + "/checkpoints/reset-all", {}),
    onSuccess: async (data) => {
      await inspect.mutateAsync(data.point.id);
      await qc.invalidateQueries({ queryKey: ["checkpoints", userId] });
    },
  });
  const restore = useMutation({
    mutationFn: (data: Preview) =>
      request(base + `/checkpoints/${data.point.id}/restore`, {
        token: data.token,
      }),
    onSuccess: async () => {
      setPreview(null);
      setNotice(
        "Статы восстановлены. Предыдущее состояние сохранено отдельной точкой — откат можно отменить.",
      );
      await refresh();
    },
    onError: () => setPreview(null),
  });
  const reset = useMutation({
    mutationFn: () => request(base + "/stats/reset", {}),
    onSuccess: async () => {
      setNotice(
        "Счётчики обнулены. Предыдущее состояние сохранено в точках восстановления.",
      );
      await refresh();
    },
  });
  const busy =
    create.isPending ||
    inspect.isPending ||
    restore.isPending ||
    reset.isPending ||
    clearAll.isPending;
  return (
    <>
      <Dialog title="Откат статов" onClose={onClose}>
        <div className="stat-rollback">
          <p className="muted">
            {name} · ID {userId}
          </p>
          <p>
            Восстановление баланса, подарков, значков, Plus, верификации,
            адресов, оформления и счётчиков активности. Переписки, посты,
            подписки и пароль остаются на месте.
          </p>
          {points.data && (
            <>
              <button
                className="outline rollback-clear-all"
                disabled={busy}
                onClick={() => clearAll.mutate()}
              >
                <RotateCcw size={16} />
                Обнулить все статы
              </button>
              <p className="rollback-clear-help">
                Сначала покажем сравнение. Нимбики и счётчики обнулятся,
                подарки, значки и коллекционные адреса будут сняты, Plus и
                верификация отключатся. Купленный основной юзернейм сменится на
                временный. Переписки, посты и пароль сохранятся. Перед
                применением создаётся резервная точка.
              </p>
              <h3>Счётчики активности</h3>
              <div className="rollback-stats">
                {Object.entries(points.data.stats).map(([key, n]) => (
                  <div key={key}>
                    <span>{statNames[key] || key}</span>
                    <strong>{n.toLocaleString("ru-RU")}</strong>
                  </div>
                ))}
              </div>
              <button
                className="outline"
                disabled={busy}
                onClick={async () => {
                  if (
                    await ask({
                      title: "Обнулить счётчики?",
                      description:
                        "Счётчики сообщений, публикаций, комментариев, реакций, подписчиков и подписок начнут отсчёт с нуля. Содержимое и связи не удаляются. Перед изменением сохранится точка восстановления.",
                      label: "Обнулить счётчики",
                    })
                  )
                    reset.mutate();
                }}
              >
                Обнулить счётчики
              </button>
            </>
          )}
          <form
            className="checkpoint-create"
            onSubmit={(e) => {
              e.preventDefault();
              if (label.trim()) create.mutate();
            }}
          >
            <label>
              Сохранить текущее состояние
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Например: перед выдачей наград"
                maxLength={80}
                required
              />
            </label>
            <button className="primary" disabled={busy || !label.trim()}>
              <Save size={16} /> Сохранить точку
            </button>
          </form>
          {notice && (
            <p className="rollback-notice" role="status">
              {notice}
            </p>
          )}
          {[points, create, inspect, restore, reset, clearAll].map(
            (operation, index) =>
              operation.isError ? (
                <p className="error" role="alert" key={index}>
                  {operation.error.message}
                </p>
              ) : null,
          )}
          {preview ? (
            <section className="rollback-preview">
              <h3>Вернуть: {preview.point.label}</h3>
              <p className="muted">
                {new Date(preview.point.createdAt).toLocaleString("ru-RU")}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Что</th>
                    <th>Сейчас</th>
                    <th>После отката</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(preview.changes)
                    .filter(([key]) => key !== "stats")
                    .map(([key, change]) => (
                      <tr key={key}>
                        <th>{labels[key] || key}</th>
                        <td>{value(change.before)}</td>
                        <td>{value(change.after)}</td>
                      </tr>
                    ))}
                  {Object.entries(preview.changes.stats.before).map(
                    ([key, n]) => (
                      <tr key={key}>
                        <th>{statNames[key] || key}</th>
                        <td>{n}</td>
                        <td>{preview.changes.stats.after[key]}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
              <p>
                Перед восстановлением автоматически сохранится текущее
                состояние. Если адрес уже занял другой пользователь или статы
                изменились после просмотра, откат остановится.
              </p>
              <div className="rollback-buttons">
                <button
                  className="outline"
                  disabled={busy}
                  onClick={() => setPreview(null)}
                >
                  Отмена
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={async () => {
                    const selected = preview;
                    if (
                      await ask({
                        title: "Применить откат?",
                        description: `Вернуть статы пользователя ${name} к точке «${selected.point.label}»? Изменения показаны в таблице. Текущее состояние будет сохранено.`,
                        label: "Применить откат",
                      })
                    )
                      restore.mutate(selected);
                  }}
                >
                  <RotateCcw size={16} />
                  {restore.isPending ? "Восстанавливаем…" : "Применить откат"}
                </button>
              </div>
            </section>
          ) : (
            <>
              <h3>Точки восстановления</h3>
              <p className="muted">
                Создаются автоматически перед выдачей наград и покупками.
                Показаны последние 50 точек.
              </p>
              {points.isLoading ? (
                <p>Загрузка…</p>
              ) : points.data?.points.length ? (
                points.data.points.map((point) => (
                  <button
                    key={point.id}
                    className="checkpoint-row"
                    disabled={busy}
                    onClick={() => inspect.mutate(point.id)}
                  >
                    <History size={17} />
                    <span>
                      <strong>{point.label}</strong>
                      <small>
                        {new Date(point.createdAt).toLocaleString("ru-RU")}
                      </small>
                    </span>
                    <span>Сравнить</span>
                  </button>
                ))
              ) : (
                <p className="muted">
                  Точек пока нет. Сохраните текущее состояние или выполните
                  новую выдачу.
                </p>
              )}
            </>
          )}
        </div>
      </Dialog>
      {dialog}
    </>
  );
}
