import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
type Folder = { id: number; name: string; chatIds: number[] };
type Chat = {
  id: number;
  kind: string;
  title: string;
  members: { user: { id: number; name: string } }[];
};
async function request<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch("/api" + url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Ошибка запроса");
  return data;
}
export function useFolders(enabled = true) {
  return useQuery({
    queryKey: ["folders"],
    queryFn: () => request<{ folders: Folder[] }>("/folders"),
    enabled,
  });
}
export function FolderSettings({
  chats,
  userId,
}: {
  chats: Chat[];
  userId: number;
}) {
  const qc = useQueryClient();
  const folders = useFolders();
  const [name, setName] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [pendingChoice, setPendingChoice] = useState<{
    folderId: number;
    chatId: number;
    present: boolean;
  } | null>(null);
  const action = useMutation({
    mutationFn: ({
      url,
      method,
      body,
    }: {
      url: string;
      method: string;
      body?: unknown;
    }) => request(url, method, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["folders"] }),
    onSettled: () => setPendingChoice(null),
  });
  const selected = folders.data?.folders.find((f) => f.id === open);
  return (
    <div className="setting-detail">
      <h2>Папки с чатами</h2>
      <p>
        Создайте папку и выберите, какие беседы в ней показывать. Чаты останутся
        также в общем списке.
      </p>
      <form
        className="folder-create"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) {
            action.mutate(
              { url: "/folders", method: "POST", body: { name } },
              { onSuccess: () => setName("") },
            );
          }
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          name="folder-name"
          autoComplete="off"
          placeholder="Название папки…"
          aria-label="Название папки"
        />
        <button className="outline" disabled={!name.trim() || action.isPending}>
          Создать
        </button>
      </form>
      {folders.data?.folders.map((folder) => (
        <div className="folder-row" key={folder.id}>
          <button
            onClick={() => setOpen(open === folder.id ? null : folder.id)}
          >
            {folder.name} · {folder.chatIds.length}
          </button>
          <button
            onClick={() => {
              const next = prompt("Название папки", folder.name);
              if (next?.trim())
                action.mutate({
                  url: `/folders/${folder.id}`,
                  method: "PATCH",
                  body: { name: next },
                });
            }}
          >
            Переименовать
          </button>
          <button
            onClick={() => {
              if (confirm("Удалить папку? Чаты сохранятся."))
                action.mutate({
                  url: `/folders/${folder.id}`,
                  method: "DELETE",
                });
            }}
          >
            Удалить
          </button>
        </div>
      ))}
      {selected && (
        <div className="folder-chat-list">
          <div className="small-label">ЧАТЫ В ПАПКЕ «{selected.name}»</div>
          {chats.length ? (
            chats.map((chat) => {
              const title =
                chat.kind === "direct"
                  ? chat.members.find((m) => m.user.id !== userId)?.user.name
                  : chat.title;
              return (
                <label key={chat.id}>
                  <input
                    type="checkbox"
                    checked={
                      pendingChoice?.folderId === selected.id &&
                      pendingChoice.chatId === chat.id
                        ? pendingChoice.present
                        : selected.chatIds.includes(chat.id)
                    }
                    disabled={action.isPending || !!pendingChoice}
                    onChange={(e) => {
                      const change = {
                        folderId: selected.id,
                        chatId: chat.id,
                        present: e.target.checked,
                      };
                      setPendingChoice(change);
                      action.mutate({
                        url: `/folders/${selected.id}/chats/${chat.id}`,
                        method: "PUT",
                        body: { present: change.present },
                      });
                    }}
                  />
                  {title || "Чат"}
                </label>
              );
            })
          ) : (
            <p className="muted">Сначала создайте чат.</p>
          )}
        </div>
      )}
      {folders.isError && <p className="error">{folders.error.message}</p>}
      {action.isError && (
        <p className="error" role="alert">
          {action.error.message}
        </p>
      )}
    </div>
  );
}
