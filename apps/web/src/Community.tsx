import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Hash, Users } from "lucide-react";
import { Dialog, useConfirmation } from "./UI";

type User = {
  id: number;
  username: string;
  name: string;
  bio: string;
  createdAt: string;
};
export type CommunityChat = {
  id: number;
  kind: string;
  title: string;
  description: string;
  media?: { hasAvatar: boolean; hasBanner: boolean; version: number } | null;
  members: { user: User; role: string; lastReadId: number }[];
};

async function request<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Ошибка запроса");
  return data;
}

export function CommunityDialog({
  close,
  open,
}: {
  close: () => void;
  open: (chat: CommunityChat) => void;
}) {
  const invite = new URLSearchParams(location.search).get("invite");
  const [mode, setMode] = useState<"create" | "join">(
    invite ? "join" : "create",
  );
  const [kind, setKind] = useState("group");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [token, setToken] = useState(invite || "");
  const qc = useQueryClient();
  const action = useMutation({
    mutationFn: () => {
      if (mode === "create")
        return request<{ chat: CommunityChat }>("/communities", "POST", {
          title,
          description,
          kind,
        });
      let value = token.trim();
      try {
        value = new URL(value).searchParams.get("invite") || value;
      } catch {}
      return request<{ chat: CommunityChat }>("/communities/join", "POST", {
        token: value,
      });
    },
    onSuccess: ({ chat }) => {
      qc.invalidateQueries({ queryKey: ["chats"] });
      history.replaceState(null, "", location.pathname);
      open(chat);
      close();
    },
  });
  return (
    <Dialog
      title={mode === "create" ? "Создать пространство" : "Вступить по ссылке"}
      className="edit-modal community-editor"
      onClose={close}
    >
      <div className="feed-tabs" aria-label="Сообщества">
        {(
          [
            ["create", "Создать"],
            ["join", "Вступить"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            aria-pressed={mode === value}
            className={mode === value ? "active" : ""}
            disabled={action.isPending}
            onClick={() => {
              action.reset();
              setMode(value);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          action.mutate();
        }}
      >
        {mode === "create" ? (
          <>
            <label>
              Тип
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                <option value="group">Группа</option>
                <option value="channel">Канал</option>
              </select>
            </label>
            <label>
              Название
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={80}
                required
              />
            </label>
            <label>
              Описание
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
              />
            </label>
          </>
        ) : (
          <label>
            Ссылка или код приглашения
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required
            />
          </label>
        )}
        {action.isError && (
          <p role="alert" className="error">
            {action.error.message}
          </p>
        )}
        <button className="primary" disabled={action.isPending}>
          {action.isPending
            ? "Подождите…"
            : mode === "create"
              ? "Создать"
              : "Вступить"}
        </button>
      </form>
    </Dialog>
  );
}

const roleName = (role?: string) =>
  role === "owner"
    ? "владелец"
    : role === "admin"
      ? "администратор"
      : "участник";

export function CommunityInfo({
  chat,
  me,
  close,
  update,
}: {
  chat: CommunityChat;
  me: User;
  close: () => void;
  update: (chat: CommunityChat) => void;
}) {
  const qc = useQueryClient();
  const { ask, dialog } = useConfirmation();
  const [invite, setInvite] = useState("");
  const [title, setTitle] = useState(chat.title);
  const [description, setDescription] = useState(chat.description);
  const [mediaError, setMediaError] = useState("");
  const [mediaBusy, setMediaBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const myRole = chat.members.find((member) => member.user.id === me.id)?.role;
  const admin = myRole === "owner" || myRole === "admin";
  const channel = chat.kind === "channel";
  const base = `/communities/${chat.id}`;
  async function updateMedia(kind: "avatar" | "banner", file?: File) {
    setMediaError("");
    setMediaBusy(true);
    setNotice("");
    try {
      const body = file ? new FormData() : undefined;
      if (file) body!.append("file", file);
      const response = await fetch(`/api${base}/media/${kind}`, {
        method: file ? "PUT" : "DELETE",
        credentials: "include",
        body,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Не удалось изменить изображение");
      await qc.invalidateQueries({ queryKey: ["chats"] });
      setNotice("Изображение обновлено");
    } catch (error) {
      setMediaError((error as Error).message);
    } finally {
      setMediaBusy(false);
    }
  }
  const action = useMutation({
    mutationFn: ({
      path,
      method,
      body,
    }: {
      path: string;
      method: string;
      body?: unknown;
    }) =>
      request<{ invite?: string; chat?: CommunityChat }>(path, method, body),
    onMutate: () => {
      setNotice("");
    },
    onSuccess: (data) => {
      if (data.invite) setInvite(data.invite);
      if (data.chat) update(data.chat);
      setNotice(data.invite ? "Ссылка готова" : "Изменения сохранены");
      qc.invalidateQueries({ queryKey: ["chats"] });
    },
  });
  return (
    <Dialog
      title={channel ? "О канале" : "О группе"}
      className="community-profile"
      onClose={close}
      showTitle={false}
    >
      {chat.media?.hasBanner && (
        <div
          className="community-cover"
          style={{
            backgroundImage: `url(/api${base}/media/banner?v=${chat.media.version})`,
          }}
        />
      )}
      <header className="community-hero">
        <div className="community-avatar">
          {chat.media?.hasAvatar ? (
            <img
              src={`/api${base}/media/avatar?v=${chat.media.version}`}
              alt=""
            />
          ) : channel ? (
            <Hash size={25} aria-hidden="true" />
          ) : (
            <Users size={25} aria-hidden="true" />
          )}
        </div>
        <div>
          <h2>{chat.title}</h2>
          <p>
            {channel ? "Канал" : "Группа"} · {chat.members.length} участников
          </p>
        </div>
      </header>
      <div className="community-content">
        {chat.description && (
          <p className="community-description">{chat.description}</p>
        )}
        <p className="community-role">Ваша роль · {roleName(myRole)}</p>
        {admin && (
          <section className="community-section">
            <h3>Управление</h3>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                action.mutate({
                  path: base,
                  method: "PATCH",
                  body: { title, description },
                });
              }}
            >
              <label>
                Название
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={80}
                  required
                />
              </label>
              <label>
                Описание
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={500}
                />
              </label>
              <button className="primary" disabled={action.isPending}>
                Сохранить
              </button>
            </form>
            <div className="community-image-tools">
              {(["avatar", "banner"] as const).map((kind) => (
                <div className="media-editor-row" key={kind}>
                  <label className="outline">
                    {kind === "avatar"
                      ? "Загрузить аватар"
                      : "Загрузить баннер"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={mediaBusy}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void updateMedia(kind, file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {(kind === "avatar"
                    ? chat.media?.hasAvatar
                    : chat.media?.hasBanner) && (
                    <button
                      type="button"
                      disabled={mediaBusy}
                      onClick={() => void updateMedia(kind)}
                    >
                      {kind === "avatar" ? "Удалить аватар" : "Удалить баннер"}
                    </button>
                  )}
                </div>
              ))}
            </div>
            {mediaError && (
              <p className="error" role="alert">
                {mediaError}
              </p>
            )}
            <button
              className="outline"
              disabled={action.isPending}
              onClick={() =>
                action.mutate({
                  path: `${base}/invite`,
                  method: "POST",
                  body: {},
                })
              }
            >
              Создать ссылку приглашения
            </button>
            {invite && (
              <div className="invite-box">
                <input
                  readOnly
                  value={invite}
                  aria-label="Ссылка приглашения"
                />
                <small>Новая ссылка отменяет предыдущую.</small>
              </div>
            )}
          </section>
        )}
        <section className="community-members community-section">
          <h3>
            Участники <span>{chat.members.length}</span>
          </h3>
          {chat.members.map((member) => (
            <div key={member.user.id}>
              <span>
                <strong>{member.user.name}</strong>
                <small>
                  @{member.user.username} · {roleName(member.role)}
                </small>
              </span>
              {myRole === "owner" && member.role !== "owner" && (
                <button
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      path: `${base}/members/${member.user.id}`,
                      method: "PATCH",
                      body: {
                        role: member.role === "admin" ? "member" : "admin",
                      },
                    })
                  }
                >
                  {member.role === "admin" ? "Снять роль" : "Назначить админом"}
                </button>
              )}
              {admin &&
                member.role !== "owner" &&
                (myRole === "owner" || member.role === "member") && (
                  <button
                    disabled={action.isPending}
                    onClick={async () => {
                      if (
                        await ask({
                          title: "Удалить участника?",
                          description: member.user.name,
                          label: "Удалить",
                          danger: true,
                        })
                      )
                        action.mutate({
                          path: `${base}/members/${member.user.id}`,
                          method: "DELETE",
                        });
                    }}
                  >
                    Удалить
                  </button>
                )}
            </div>
          ))}
        </section>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {action.isError && (
          <p className="error" role="alert">
            {action.error.message}
          </p>
        )}
      </div>
      {dialog}
    </Dialog>
  );
}
