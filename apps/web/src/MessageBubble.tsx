import { useQueryClient } from "@tanstack/react-query";
import { UserName, type Identity } from "./Identity";
import { motion } from "framer-motion";
import { useState } from "react";
import { MoreHorizontal, Check, CheckCheck, Pin, Eye } from "lucide-react";
import { useConfirmation } from "./UI";
export type Message = {
  id: number;
  chatId: number;
  senderId: number;
  text: string;
  createdAt: string;
  editedAt?: string | null;
  pinned?: boolean;
  saved?: boolean;
  forwarded?: boolean;
  viewCount?: number;
  delivered?: boolean;
  replyTo?: { id: number; text: string; senderId: number } | null;
  attachment?: { id: number; name: string; mime: string; size: number } | null;
  reactions?: { userId: number; emoji: string }[];
};
export function MessageBubble({
  message: m,
  me,
  read,
  showViews,
  sender,
  canPin,
  onReply,
  onForward,
  onError,
}: {
  message: Message;
  me: number;
  read: boolean;
  showViews: boolean;
  sender?: string | Identity;
  canPin: boolean;
  onReply: (m: Message) => void;
  onForward: (m: Message) => void;
  onError: (s: string) => void;
}) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.text);
  const [busy, setBusy] = useState(false);
  const { ask, dialog } = useConfirmation();
  async function action(path: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      const r = await fetch("/api" + path, {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Ошибка запроса");
      qc.invalidateQueries({ queryKey: ["messages", m.chatId] });
      qc.invalidateQueries({ queryKey: ["saved"] });
      setMenu(false);
      setEditing(false);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const emojis = ["❤️", "👍", "😂", "😮", "😢", "🔥"];
  const status = read ? "Прочитано" : m.delivered ? "Доставлено" : "Отправлено";
  const compact =
    !editing &&
    !sender &&
    !m.attachment &&
    !m.pinned &&
    !m.forwarded &&
    !m.replyTo &&
    !m.reactions?.length &&
    m.text.length <= 76 &&
    !m.text.includes("\n");
  return (
    <div className={"message-row " + (m.senderId === me ? "mine" : "")}>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className={compact ? "bubble bubble-compact" : "bubble"}
      >
        {sender && (
          <strong className="message-author">
            {typeof sender === "string" ? sender : <UserName user={sender} />}
          </strong>
        )}
        {m.pinned && (
          <div className="message-pin">
            <Pin size={10} /> Закреплено
          </div>
        )}
        {m.forwarded && (
          <div className="message-pin">Пересланное сообщение</div>
        )}
        {m.replyTo && <div className="reply-preview">{m.replyTo.text}</div>}
        {editing ? (
          <form
            className="message-edit"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim() && !busy)
                action(`/messages/${m.id}`, "PATCH", { text: draft });
            }}
          >
            <textarea
              aria-label="Изменить сообщение"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={4000}
            />
            <div>
              <button disabled={busy || !draft.trim()}>Сохранить</button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Отмена
              </button>
            </div>
          </form>
        ) : m.attachment ? (
          <a
            className="attachment-link"
            href={`/api/files/${m.attachment.id}`}
            target="_blank"
            rel="noreferrer"
          >
            {m.attachment.mime.startsWith("image/") && (
              <img
                src={`/api/files/${m.attachment.id}`}
                alt={m.attachment.name}
              />
            )}
            <span>
              {m.attachment.name} · {(m.attachment.size / 1024).toFixed(0)} КБ
            </span>
          </a>
        ) : (
          <div className="message-text">{m.text}</div>
        )}
        <div className="reaction-list">
          {emojis.map((emoji) => {
            const count =
              m.reactions?.filter((r) => r.emoji === emoji).length || 0;
            if (!count) return null;
            return (
              <button
                disabled={busy}
                className={
                  m.reactions?.some((r) => r.emoji === emoji && r.userId === me)
                    ? "chosen"
                    : ""
                }
                key={emoji}
                onClick={() =>
                  action(`/messages/${m.id}/reaction`, "POST", { emoji })
                }
              >
                {emoji} {count}
              </button>
            );
          })}
        </div>
        <div className="message-bottom">
          <button
            className="message-menu-toggle"
            aria-label="Действия с сообщением"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <MoreHorizontal size={15} />
          </button>
          <time dateTime={m.createdAt}>
            {showViews && (
              <>
                <Eye size={11} />
                {m.viewCount || 0}
              </>
            )}
            {m.editedAt && <span>изм.</span>}
            {new Date(m.createdAt).toLocaleTimeString("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {m.senderId === me && (
              <span title={status} aria-label={status}>
                {read || m.delivered ? (
                  <CheckCheck size={13} />
                ) : (
                  <Check size={13} />
                )}
              </span>
            )}
          </time>
        </div>
        {copied && (
          <span className="copy-feedback" role="status">
            Скопировано
          </span>
        )}
        {menu && (
          <div className="message-tools">
            <div className="message-reactions">
              {emojis.map((emoji) => (
                <button
                  key={emoji}
                  disabled={busy}
                  aria-label={"Реакция " + emoji}
                  onClick={() =>
                    action(`/messages/${m.id}/reaction`, "POST", { emoji })
                  }
                >
                  {emoji}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                onReply(m);
                setMenu(false);
              }}
            >
              Ответить
            </button>
            <button
              onClick={() => {
                onForward(m);
                setMenu(false);
              }}
            >
              Переслать
            </button>
            <button
              disabled={busy}
              onClick={() =>
                action(`/messages/${m.id}/saved`, "PUT", { saved: !m.saved })
              }
            >
              {m.saved ? "Убрать из избранного" : "В избранное"}
            </button>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(m.text);
                  setMenu(false);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  onError(
                    "Не удалось скопировать. Разрешите доступ к буферу обмена.",
                  );
                }
              }}
            >
              Копировать текст
            </button>
            {canPin && (
              <button
                disabled={busy}
                onClick={() => action(`/messages/${m.id}/pin`, "POST", {})}
              >
                {m.pinned ? "Открепить" : "Закрепить"}
              </button>
            )}
            {m.senderId === me && (
              <>
                {!m.attachment && (
                  <button
                    onClick={() => {
                      setDraft(m.text);
                      setEditing(true);
                      setMenu(false);
                    }}
                  >
                    Изменить
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await ask({
                        title: "Удалить сообщение?",
                        description:
                          "Сообщение исчезнет из переписки у всех участников.",
                        label: "Удалить",
                        danger: true,
                      })
                    )
                      action(`/messages/${m.id}`, "DELETE");
                  }}
                >
                  Удалить
                </button>
              </>
            )}
          </div>
        )}
      </motion.div>
      {dialog}
    </div>
  );
}
