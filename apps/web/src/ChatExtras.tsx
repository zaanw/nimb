import { useEffect, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Archive,
  Bookmark,
  Pin,
  Search,
  ArrowUpRight,
  Trash2,
  FileText,
} from "lucide-react";
import { Dialog, PageHeading } from "./UI";
import { UserName, type Identity } from "./Identity";

async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch("/api" + path, {
    method,
    credentials: "include",
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Не удалось сохранить");
  return d;
}
export function usePersistentDrafts(userId?: number) {
  const [state, setState] = useState<{
    userId?: number;
    drafts: Record<number, string>;
  }>({ drafts: {} });
  useEffect(() => {
    if (!userId) return;
    let drafts: Record<number, string> = {};
    try {
      const raw = JSON.parse(
        localStorage.getItem(`nimb_drafts_${userId}`) || "{}",
      );
      if (raw && typeof raw === "object")
        for (const [id, value] of Object.entries(raw).slice(-100))
          if (/^\d+$/.test(id) && typeof value === "string")
            drafts[Number(id)] = value.slice(0, 8000);
    } catch {}
    setState({ userId, drafts });
  }, [userId]);
  useEffect(() => {
    if (!userId || state.userId !== userId) return;
    try {
      localStorage.setItem(
        `nimb_drafts_${userId}`,
        JSON.stringify(state.drafts),
      );
    } catch {}
  }, [state, userId]);
  const drafts = state.userId === userId ? state.drafts : {};
  function setDrafts(
    updater: (previous: Record<number, string>) => Record<number, string>,
  ) {
    setState((previous) => ({
      userId,
      drafts: updater(previous.userId === userId ? previous.drafts : {}),
    }));
  }
  return [drafts, setDrafts] as const;
}
export function ChatTools({
  chatId,
  title,
  pinned,
  archived,
  onClose,
  onArchived,
}: {
  chatId: number;
  title: string;
  pinned: boolean;
  archived: boolean;
  onClose: () => void;
  onArchived: () => void;
}) {
  const qc = useQueryClient();
  const action = useMutation({
    mutationFn: (body: { chatPinned?: boolean; archived?: boolean }) =>
      request(`/chats/${chatId}/preferences`, "PATCH", body),
    onSuccess: async (_, body) => {
      await qc.invalidateQueries({ queryKey: ["chats"] });
      if (body.archived !== undefined) onArchived();
      onClose();
    },
  });
  return (
    <Dialog title="Действия с чатом" onClose={onClose}>
      <p className="muted">{title}</p>
      <div className="chat-actions-list">
        <button
          disabled={action.isPending}
          onClick={() => action.mutate({ chatPinned: !pinned })}
        >
          <Pin size={19} />
          <span>
            {pinned ? "Открепить чат" : "Закрепить чат"}
            <small>Только в вашем списке переписок</small>
          </span>
        </button>
        <button
          disabled={action.isPending}
          onClick={() => action.mutate({ archived: !archived })}
        >
          <Archive size={19} />
          <span>
            {archived ? "Вернуть из архива" : "Убрать в архив"}
            <small>
              Переписка сохранится, собеседник не получит уведомления
            </small>
          </span>
        </button>
      </div>
      {action.isError && (
        <p className="error" role="alert">
          {action.error.message}
        </p>
      )}
    </Dialog>
  );
}
type Saved = {
  id: number;
  savedAt: string;
  message: {
    id: number;
    chatId: number;
    text: string;
    createdAt: string;
    sender: Identity & { username: string };
    chat: { kind: string; title: string };
    attachment?: { id: number; name: string } | null;
  };
};
export function SavedMessages({
  openChat,
}: {
  openChat: (id: number) => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const saved = useInfiniteQuery({
    queryKey: ["saved", query],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      request<{ items: Saved[]; nextCursor: number | null }>(
        `/saved?q=${encodeURIComponent(query)}${pageParam ? "&before=" + pageParam : ""}`,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const remove = useMutation({
    mutationFn: (id: number) =>
      request(`/messages/${id}/saved`, "PUT", { saved: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved"] });
      qc.invalidateQueries({ queryKey: ["messages"] });
    },
  });
  const items = saved.data?.pages.flatMap((p) => p.items) || [];
  return (
    <section className="saved-screen">
      <PageHeading
        title="Избранное"
        description="Сообщения, которые вы сохранили. Видны только вам."
      />
      <label className="saved-search">
        <Search size={18} />
        <input
          aria-label="Поиск в избранном"
          placeholder="Найти сообщение"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {saved.isError && (
        <p className="error">
          {saved.error.message}
          <button className="text-action" onClick={() => saved.refetch()}>
            Повторить
          </button>
        </p>
      )}
      {remove.isError && (
        <p className="error" role="alert">
          {remove.error.message}
        </p>
      )}
      {saved.isLoading ? (
        <p className="muted">Загрузка…</p>
      ) : items.length ? (
        items.map((item) => (
          <article className="saved-card" key={item.id}>
            <header>
              <span className="saved-author">
                <UserName user={item.message.sender} />
                <small>
                  {new Date(item.message.createdAt).toLocaleDateString("ru-RU")}{" "}
                  ·{" "}
                  {item.message.chat.kind === "direct"
                    ? "Личный чат"
                    : item.message.chat.title}
                </small>
              </span>
              <button
                className="icon-button"
                aria-label="Убрать из избранного"
                disabled={remove.isPending}
                onClick={() => remove.mutate(item.message.id)}
              >
                <Trash2 size={16} />
              </button>
            </header>
            <p>{item.message.text}</p>
            {item.message.attachment && (
              <a
                className="saved-attachment"
                href={`/api/files/${item.message.attachment.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <FileText size={17} />
                {item.message.attachment.name}
              </a>
            )}
            <button
              className="text-action"
              onClick={() => openChat(item.message.chatId)}
            >
              Открыть переписку <ArrowUpRight size={14} />
            </button>
          </article>
        ))
      ) : (
        !saved.isError && (
          <div className="saved-empty">
            <Bookmark size={28} />
            <h2>
              {query ? "Ничего не найдено" : "Здесь будут важные сообщения"}
            </h2>
            <p>
              {query
                ? "Попробуйте другое слово."
                : "Откройте меню сообщения и нажмите «В избранное»."}
            </p>
          </div>
        )
      )}
      {saved.hasNextPage && (
        <button
          className="outline"
          disabled={saved.isFetchingNextPage}
          onClick={() => saved.fetchNextPage()}
        >
          {saved.isFetchingNextPage ? "Загрузка…" : "Ещё сообщения"}
        </button>
      )}
    </section>
  );
}
