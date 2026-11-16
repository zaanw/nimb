import {
  ImagePlus,
  UserRound,
  Upload,
  Trash2,
  LoaderCircle,
  Check,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
type User = {
  id: number;
  name: string;
  username: string;
  bio: string;
  createdAt: string;
  bioPrivate?: boolean;
  onlineVisible?: boolean;
  hasAvatar?: boolean;
  hasBanner?: boolean;
  mediaVersion?: number;
};
async function update<T>(
  path: string,
  method: string,
  body?: BodyInit,
  contentType?: string,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    credentials: "include",
    headers: contentType ? { "Content-Type": contentType } : {},
    body,
  });
  const data = await response
    .json()
    .catch(() => ({
      error:
        response.status === 413
          ? "Файл слишком большой. Максимум 5 МиБ."
          : "Сервер временно недоступен. Попробуйте ещё раз.",
    }));
  if (!response.ok) throw new Error(data.error || "Не удалось сохранить");
  return data;
}
export function ProfileMediaEditor({
  user,
  onUpdate,
}: {
  user: User;
  onUpdate: (user: User) => void;
}) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"avatar" | "banner" | null>(null);
  async function send(kind: "avatar" | "banner", file?: File) {
    setError("");
    setNotice("");
    if (file && file.size > 5 * 1024 * 1024) {
      setError("Файл слишком большой. Выберите изображение до 5 МиБ.");
      return;
    }
    if (
      file &&
      !/\.(jpe?g|png|webp)$/i.test(file.name) &&
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      setError(
        "Выберите JPEG, PNG или WebP. Фото HEIC сначала сохраните как JPEG.",
      );
      return;
    }
    setBusy(kind);
    try {
      let body: FormData | undefined;
      if (file) {
        body = new FormData();
        body.append("file", file);
      }
      const result = await update<{ user: User }>(
        `/me/media/${kind}`,
        file ? "PUT" : "DELETE",
        body,
      );
      onUpdate(result.user);
      setNotice(
        file
          ? kind === "avatar"
            ? "Аватар обновлён"
            : "Баннер обновлён"
          : "Изображение удалено",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="media-editor" aria-busy={!!busy}>
      <div className="media-editor-heading">
        <ImagePlus size={18} />
        <div>
          <strong>Фото профиля</strong>
          <p>JPEG, PNG или WebP · до 5 МиБ</p>
        </div>
      </div>
      {(["avatar", "banner"] as const).map((kind) => {
        const present = kind === "avatar" ? user.hasAvatar : user.hasBanner;
        return (
          <div className={"media-editor-row media-row-" + kind} key={kind}>
            <div className={"media-preview " + kind}>
              {kind === "avatar" ? <UserRound size={24}/> : <ImagePlus size={24}/>}
              {present && <img key={user.mediaVersion||0} src={`/api/users/${user.id}/media/${kind}?v=${user.mediaVersion || 0}`} alt={kind === "avatar" ? "Текущий аватар" : "Текущий баннер"} onError={e=>{e.currentTarget.style.display='none'}} onLoad={e=>{e.currentTarget.style.display='block'}}/>}
            </div>
            <div className="media-row-copy">
              <strong>{kind === "avatar" ? "Аватар" : "Обложка"}</strong>
              <small>
                {kind === "avatar"
                  ? "В чатах и рядом с вашим именем"
                  : "В верхней части профиля"}
              </small>
              <div className="media-row-controls">
                <label
                  className={"outline media-upload" + (busy ? " disabled" : "")}
                >
                  <Upload size={14} />
                  {busy === kind ? (
                    <>
                      <LoaderCircle className="media-spinner" size={14} />
                      Сохраняем…
                    </>
                  ) : present ? (
                    "Заменить"
                  ) : (
                    "Загрузить"
                  )}
                  <input
                    aria-label={
                      kind === "avatar"
                        ? "Загрузить аватар"
                        : "Загрузить баннер"
                    }
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={!!busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void send(kind, file);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                {present && (
                  <button
                    type="button"
                    className="icon-button media-delete"
                    aria-label={
                      kind === "avatar" ? "Удалить аватар" : "Удалить баннер"
                    }
                    disabled={!!busy}
                    onClick={() => void send(kind)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {error && (
        <p className="error media-status" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="media-status media-success" role="status">
          <Check size={16} />
          {notice}
        </p>
      )}
    </section>
  );
}
export function PrivacySettings({
  user,
  onUpdate,
}: {
  user: User;
  onUpdate: (user: User) => void;
}) {
  const qc = useQueryClient();
  const privacyQuery = useQuery({
    queryKey: ["privacy"],
    queryFn: async () => {
      const r = await fetch("/api/me/privacy", { credentials: "include" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Ошибка запроса");
      return d as {
        privacy: { messagesFrom: "everyone" | "followers" | "nobody" };
      };
    },
  });
  const [checked, setChecked] = useState(!!user.bioPrivate);
  const [showOnline, setShowOnline] = useState(user.onlineVisible !== false);
  useEffect(() => setChecked(!!user.bioPrivate), [user.bioPrivate]);
  useEffect(
    () => setShowOnline(user.onlineVisible !== false),
    [user.onlineVisible],
  );
  const mutation = useMutation({
    mutationFn: (privacy: {
      bioPrivate?: boolean;
      onlineVisible?: boolean;
      messagesFrom?: "everyone" | "followers" | "nobody";
    }) =>
      update<{ user: User }>(
        "/me/privacy",
        "PATCH",
        JSON.stringify(privacy),
        "application/json",
      ),
    onSuccess: (data) => {
      onUpdate(data.user);
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["chats"] });
      qc.invalidateQueries({ queryKey: ["privacy"] });
    },
    onError: () => {
      setChecked(!!user.bioPrivate);
      setShowOnline(user.onlineVisible !== false);
    },
  });
  return (
    <div className="setting-detail">
      <h2>Конфиденциальность</h2>
      <p>
        Выберите, кто видит описание «О себе» в профиле. Имя, имя пользователя,
        изображения, ссылки и публикации остаются видимыми другим пользователям.
      </p>
      <label className="privacy-option">
        <input
          type="checkbox"
          checked={checked}
          disabled={mutation.isPending}
          onChange={(e) => {
            setChecked(e.target.checked);
            mutation.mutate({ bioPrivate: e.target.checked });
          }}
        />
        <span>
          <strong>Скрыть описание</strong>
          <small>Только вы сможете видеть текст «О себе».</small>
        </span>
      </label>
      <label className="privacy-option">
        <input
          type="checkbox"
          checked={showOnline}
          disabled={mutation.isPending}
          onChange={(e) => {
            setShowOnline(e.target.checked);
            mutation.mutate({ onlineVisible: e.target.checked });
          }}
        />
        <span>
          <strong>Показывать статус онлайн</strong>
          <small>
            Другие пользователи увидят, когда приложение подключено.
          </small>
        </span>
      </label>
      <label className="privacy-select">
        Кто может писать вам лично
        <select
          value={
            mutation.isPending && mutation.variables?.messagesFrom
              ? mutation.variables.messagesFrom
              : privacyQuery.data?.privacy.messagesFrom || "everyone"
          }
          disabled={mutation.isPending || !privacyQuery.data}
          onChange={(e) =>
            mutation.mutate({
              messagesFrom: e.target.value as
                "everyone" | "followers" | "nobody",
            })
          }
        >
          <option value="everyone">Все пользователи</option>
          <option value="followers">Мои подписчики</option>
          <option value="nobody">Никто</option>
        </select>
      </label>
      {privacyQuery.isError && (
        <p className="error">{privacyQuery.error.message}</p>
      )}
      {mutation.isError && <p className="error">{mutation.error.message}</p>}
    </div>
  );
}
