import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { io, type Socket } from "socket.io-client";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Compass,
  LogOut,
  MessageCircle,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  UserRound,
  X,
  Pencil,
  SquarePen,
  Bell,
  Shield,
  Monitor,
  LockKeyhole,
  Palette,
  Type,
  Globe,
  Folder,
  Zap,
  HardDrive,
  Info,
  Gift,
  MoreHorizontal,
  CalendarDays,
  AlignJustify,
  MessagesSquare,
  CircleUserRound,
  Share2,
  UserPlus,
  Users,
  PenLine,
  Smartphone,
  Wallet as WalletIcon,
  Hash,
  AtSign,
  PanelLeft,
  ArrowUpRight,
} from "lucide-react";
import "./style.css";
import { Brand, PageHeading } from "./UI";
import { Feed, ProfileActions, ProfilePosts } from "./Social";
import {
  CommunityDialog,
  CommunityInfo,
  type CommunityChat,
} from "./Community";
import { SecuritySettings } from "./Security";
import { Auth } from "./Auth";
import { MessageBubble, type Message } from "./MessageBubble";
import { ProfileMediaEditor, PrivacySettings } from "./ProfileSettings";
import {
  Preferences,
  initializePreferences,
  MotionPreferences,
} from "./Preferences";
import { NotificationSettings, notifyMessage } from "./Notifications";
import { Collections } from "./Collections";
import { ProfileMusic, MusicEditor } from "./Music";
import { ProfileLinks, LinksEditor } from "./ProfileLinks";
import { useFolders, FolderSettings } from "./Folders";
import {
  AccountSettings,
  StorageSettings,
  AboutSettings,
  LanguageSettings,
} from "./AppSettings";
import { Admin } from "./Admin";
import { InstallApp, useInstallApp } from "./InstallApp";
import { Wallet } from "./Wallet";
initializePreferences();

type User = {
  id: number;
  username: string;
  name: string;
  bio: string;
  createdAt: string;
  bioPrivate?: boolean;
  onlineVisible?: boolean;
  online?: boolean | null;
  hasAvatar?: boolean;
  hasBanner?: boolean;
  mediaVersion?: number;
  hasMusic?: boolean;
  hasMusicCover?: boolean;
  musicTitle?: string;
  musicArtist?: string;
  musicVersion?: number;
  links?: { label: string; url: string }[];
};
type Chat = {
  id: number;
  kind: string;
  title: string;
  description: string;
  media?: { hasAvatar: boolean; hasBanner: boolean; version: number } | null;
  members: { user: User; role: string; lastReadId: number }[];
  messages?: Message[];
};
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch("/api" + path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    credentials: "include",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Ошибка запроса");
  return data;
}
const send = (method: string, body: unknown) => ({
  method,
  body: JSON.stringify(body),
});
const initials = (name: string) => name.trim().slice(0, 1).toUpperCase();
const date = (d: string) =>
  new Date(d).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
function Avatar({ user, size = "normal" }: { user: User; size?: string }) {
  return (
    <div className={"avatar " + size} aria-hidden="true">
      {user.hasAvatar ? (
        <img
          src={`/api/users/${user.id}/media/avatar?v=${user.mediaVersion || 0}`}
          alt=""
        />
      ) : (
        initials(user.name)
      )}
    </div>
  );
}
function ChatAvatar({ chat, user }: { chat: Chat; user: User }) {
  if (chat.kind === "direct" || !chat.media?.hasAvatar)
    return <Avatar user={user} />;
  return (
    <div className="avatar" aria-hidden="true">
      <img
        src={`/api/communities/${chat.id}/media/avatar?v=${chat.media.version}`}
        alt=""
      />
    </div>
  );
}
function VerifiedName({user}:{user:User}) {
  const awards=useQuery({
    queryKey:["badges",user.id],
    queryFn:()=>api<{badges:{id:string}[]}>(`/users/${user.id}/badges`),
    staleTime:60_000,
  });
  const verified=awards.data?.badges.some(b=>b.id==="verified");
  const plus=awards.data?.badges.some(b=>b.id==="plus");
  return <span className="nimb-display-name">
    <span>{user.name}</span>
    {verified&&<span className="nimb-verified" title="Проверено Nimb" aria-label="Проверено Nimb"><Check size={12} strokeWidth={3.4}/></span>}
    {plus&&<span className="nimb-plus-mark" title="Nimb Plus">✦</span>}
  </span>;
}
function App() {
  const qc = useQueryClient();
  const installApp = useInstallApp();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: User; isAdmin?: boolean }>("/me"),
    retry: false,
  });
  const [tab, setTab] = useState("chats");
  const [selected, setSelected] = useState<Chat | null>(null);
  const [walletOpen, setWalletOpen] = useState(false);
  const [profile, setProfile] = useState<User | null>(null);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [editing, setEditing] = useState(false);
  const [communityDialog, setCommunityDialog] = useState(
    !!new URLSearchParams(location.search).get("invite"),
  );
  const [communityInfo, setCommunityInfo] = useState(false);
  const [setting, setSetting] = useState("");
  const [settingsSearch, setSettingsSearch] = useState("");
  const [activeFolder, setActiveFolder] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const text = selected ? drafts[selected.id] || "" : "";
  function setText(value: string) {
    if (selected)
      setDrafts((previous) => ({ ...previous, [selected.id]: value }));
  }
  const [messageSearch, setMessageSearch] = useState("");
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const selectedRef = useRef<Chat | null>(null);
  selectedRef.current = selected;
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [typingChat, setTypingChat] = useState<number | null>(null);
  const folders = useFolders(!!me.data);
  const chats = useQuery({
    queryKey: ["chats"],
    queryFn: () => api<{ chats: Chat[] }>("/chats"),
    enabled: !!me.data,
  });
  // Restore the last section and conversation for the signed-in account only.
  const restoredFor = useRef<number | null>(null);
  const restoredChatFor = useRef<number | null>(null);
  useEffect(() => {
    const id=me.data?.user.id;
    if(!id || restoredFor.current===id)return;
    restoredFor.current=id;
    try {
      const saved=JSON.parse(localStorage.getItem(`nimb:nav:${id}`)||'{}') as {tab?:string;chatId?:number};
      if(saved.tab && ['chats','feed','profile','settings'].includes(saved.tab))setTab(saved.tab);
    } catch { /* Storage may be disabled. */ }
  },[me.data?.user.id]);
  useEffect(() => {
    const id=me.data?.user.id;
    if(!id || !chats.data || restoredChatFor.current===id)return;
    restoredChatFor.current=id;
    if(selected)return;
    try {
      const saved=JSON.parse(localStorage.getItem(`nimb:nav:${id}`)||'{}') as {chatId?:number};
      const found=chats.data.chats.find(c=>c.id===saved.chatId);
      if(found && tab==='chats')setSelected(found);
    } catch { /* Ignore invalid local state. */ }
  },[me.data?.user.id,chats.data]);
  useEffect(() => {
    const id=me.data?.user.id;
    if(!id || restoredFor.current!==id || restoredChatFor.current!==id)return;
    try {localStorage.setItem(`nimb:nav:${id}`,JSON.stringify({tab,chatId:selected?.id??null}));}
    catch { /* Private browsing may block storage. */ }
  },[me.data?.user.id,tab,selected?.id]);
  const users = useQuery({
    queryKey: ["users", search],
    queryFn: () =>
      api<{ users: User[] }>("/users?q=" + encodeURIComponent(search)),
    enabled: !!me.data && search.trim().length > 0,
  });
  const messages = useInfiniteQuery({
    queryKey: ["messages", selected?.id, messageSearch],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      api<{ messages: Message[]; nextCursor: number | null }>(
        `/chats/${selected!.id}/messages?q=${encodeURIComponent(messageSearch)}${pageParam ? "&before=" + pageParam : ""}`,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!selected && !!me.data,
  });
  const allMessages =
    messages.data?.pages
      .slice()
      .reverse()
      .flatMap((page) => page.messages) || [];
  useEffect(() => {
    if (!me.data) return;
    const socket = io({ withCredentials: true, transports: ["websocket"] });
    socketRef.current = socket;
    socket.on("connect", () => {
      qc.invalidateQueries({ queryKey: ["chats"] });
      qc.invalidateQueries({ queryKey: ["messages"] });
      qc.invalidateQueries({ queryKey: ["gifts"] });
    });
    socket.on("wallet:update", () => {
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["account"] });
    });
    socket.on("gift:new", async () => {
      await qc.cancelQueries({ queryKey: ["gifts"] });
      await qc.invalidateQueries({ queryKey: ["gifts"] });
    });
    socket.on("profile:update", (payload: { id: number }) => {
      qc.invalidateQueries({ queryKey: ["profile", payload.id] });
      qc.invalidateQueries({ queryKey: ["gifts", payload.id] });
      qc.invalidateQueries({ queryKey: ["badges", payload.id] });
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["chats"] });
      qc.invalidateQueries({ queryKey: ["posts"] });
    });
    socket.on("presence:update", (payload: { id: number }) => {
      qc.invalidateQueries({ queryKey: ["profile", payload.id] });
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["chats"] });
      if (payload.id === me.data?.user.id)
        qc.invalidateQueries({ queryKey: ["me"] });
    });
    socket.on("delivery:update", (payload: { chatId: number }) =>
      qc.invalidateQueries({ queryKey: ["messages", payload.chatId] }),
    );
    socket.on("community:update", () =>
      qc.invalidateQueries({ queryKey: ["chats"] }),
    );
    socket.on("read", () => qc.invalidateQueries({ queryKey: ["chats"] }));
    socket.on("typing", (event: { chatId: number }) => {
      setTypingChat(event.chatId);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTypingChat(null), 3000);
    });
    for (const event of [
      "message",
      "message:update",
      "message:delete",
      "message:refresh",
    ])
      socket.on(
        event,
        (
          m: { chatId: number; senderId?: number },
          ack?: (value: { received: boolean }) => void,
        ) => {
          qc.invalidateQueries({ queryKey: ["messages", m.chatId] });
          qc.invalidateQueries({ queryKey: ["chats"] });
          if (
            event === "message" &&
            m.senderId !== me.data?.user.id &&
            (document.visibilityState !== "visible" ||
              selectedRef.current?.id !== m.chatId)
          )
            notifyMessage();
          if (
            event === "message" &&
            m.senderId !== me.data?.user.id &&
            typeof ack === "function"
          )
            ack({ received: true });
        },
      );
    return () => {
      socketRef.current = null;
      socket.disconnect();
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [me.data?.user.id, qc]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data?.pages[0]?.messages.at(-1)?.id, selected?.id]);
  useEffect(() => {
    if (!me.data) return;
    const url = new URL(location.href);
    const raw = url.searchParams.get("user");
    if (!raw) return;
    const clear = () => {
      url.searchParams.delete("user");
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    };
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id < 1) {
      clear();
      setError("Ссылка на профиль недействительна");
      return;
    }
    if (id === me.data.user.id) {
      clear();
      setTab("profile");
      return;
    }
    let cancelled = false;
    api<{ user: User }>(`/users/${id}`)
      .then(({ user }) => {
        if (!cancelled) {
          clear();
          setProfile(user);
          setSelected(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          clear();
          setError("Не удалось открыть профиль");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [me.data?.user.id]);
  const openChat = useMutation({
    mutationFn: (userId: number) =>
      api<{ chat: Chat }>("/chats", send("POST", { userId })),
    onSuccess: ({ chat }) => {
      setReplyTo(null);
      setSelected(chat);
      setProfile(null);
      setTab("chats");
      setSearch("");
      setShowSearch(false);
      qc.invalidateQueries({ queryKey: ["chats"] });
    },
    onError: (e) => setError(e.message),
  });
  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`/api/chats/${selected!.id}/files`, {
        method: "POST",
        credentials: "include",
        body,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Не удалось загрузить файл");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", selected?.id] });
      qc.invalidateQueries({ queryKey: ["chats"] });
    },
    onError: (e) => setError(e.message),
  });
  const submitMessage = useMutation({
    mutationFn: (value: { chatId: number; text: string; replyToId?: number }) =>
      api<{ message: Message }>(
        `/chats/${value.chatId}/messages`,
        send("POST", {
          text: value.text,
          ...(value.replyToId ? { replyToId: value.replyToId } : {}),
        }),
      ),
    onSuccess: ({ message }, value) => {
      qc.invalidateQueries({ queryKey: ["messages", message.chatId] });
      setDrafts((previous) =>
        previous[message.chatId] === value.text
          ? { ...previous, [message.chatId]: "" }
          : previous,
      );
      setReplyTo((previous) =>
        previous?.id === value.replyToId ? null : previous,
      );
      qc.invalidateQueries({ queryKey: ["chats"] });
    },
    onError: (e) => setError(e.message),
  });
  const save = useMutation({
    mutationFn: (v: { name: string; bio: string }) =>
      api<{ user: User }>("/me", send("PATCH", v)),
    onSuccess: ({ user }) => {
      qc.setQueryData(
        ["me"],
        (old: { user: User; isAdmin?: boolean } | undefined) => ({
          ...old,
          user,
        }),
      );
      setEditing(false);
      setProfile(user);
    },
    onError: (e) => setError(e.message),
  });
  if (me.isLoading)
    return (
      <div className="loading">
        <Brand markOnly />
      </div>
    );
  if (!me.data) return <Auth />;
  const user = me.data.user;
  const selectedFolder = folders.data?.folders.find(
    (folder) => folder.id === activeFolder,
  );
  const visibleChats = (chats.data?.chats || []).filter(
    (chat) =>
      !activeFolder ||
      !selectedFolder ||
      selectedFolder.chatIds.includes(chat.id),
  );
  const currentChat = selected
    ? chats.data?.chats.find((c) => c.id === selected.id) || selected
    : null;
  const other =
    currentChat?.kind === "direct"
      ? currentChat.members.find((m) => m.user.id !== user.id)?.user
      : currentChat
        ? {
            id: 0,
            name: currentChat.title,
            username: currentChat.kind === "channel" ? "канал" : "группа",
            bio: "",
            createdAt: new Date().toISOString(),
          }
        : undefined;
  function nav(t: string) {
    window.scrollTo(0, 0);
    setWalletOpen(t === "wallet");
    setSearch("");
    setReplyTo(null);
    setMessageSearch("");
    setShowMessageSearch(false);
    setTab(t);
    setSelected(null);
    setProfile(null);
    setSetting("");
    setShowSearch(false);
    setError("");
  }
  const searchTerm = search.trim().replace(/^@/, "").toLocaleLowerCase();
  const matchingChats = searchTerm
    ? (chats.data?.chats || []).filter((chat) => {
        const otherUser = chat.members.find(
          (member) => member.user.id !== user.id,
        )?.user;
        return (
          chat.kind === "direct"
            ? `${otherUser?.name || ""} ${otherUser?.username || ""}`
            : chat.title
        )
          .toLocaleLowerCase()
          .includes(searchTerm);
      })
    : [];
  const messenger = tab === "chats" && !walletOpen;
  return (
    <div
      className={
        "shell " +
        (messenger ? "messenger-shell" : "") +
        (messenger && (selected || profile) ? " conversation-open" : "")
      }
    >
      <aside className="sidebar" aria-label="Основная навигация">
        <button
          className="side-brand"
          onClick={() => nav("chats")}
          aria-label="Nimb — чаты"
        >
          <Brand />
        </button>
        <span className="side-label">ОБЩЕНИЕ</span>
        <Nav tab={tab} nav={nav} />
        <div className="side-utilities">
          <span className="side-label">ПРОСТРАНСТВО</span>
          <button
            className={tab === "settings" ? "active" : ""}
            aria-label="Настройки"
            title="Настройки"
            onClick={() => nav("settings")}
          >
            <Settings size={20} />
            <span>Настройки</span>
          </button>
          {me.data.isAdmin && (
            <button
              className={tab === "admin" ? "active" : ""}
              aria-label="Админ-панель"
              title="Админ-панель"
              onClick={() => nav("admin")}
            >
              <Shield size={20} />
              <span>Админ-панель</span>
              <span className="owner-tag">ADMIN</span>
            </button>
          )}
        </div>
        <button className="side-bottom" onClick={() => nav("profile")}>
          <Avatar user={user} />
          <span>
            <strong>{user.name}</strong>
            <small>@{user.username}</small>
          </span>
          <ChevronRight size={16} />
        </button>
      </aside>
      <main
        className={
          "main " +
          (messenger
            ? "chat-workspace"
            : walletOpen
              ? "wallet-workspace"
              : "page-workspace") +
          (selected ? " has-chat" : "")
        }
      >
        {messenger && (
          <section className="conversation-list" aria-label="Список чатов">
            <header className="chats-heading">
              <div>
                <h1>Сообщения</h1>
                <span className="count-tag">
                  {chats.data?.chats.length ?? "…"}
                </span>
              </div>
              <button
                className="icon-button compose-new"
                aria-label="Найти пользователя"
                title="Новое сообщение"
                onClick={() => {
                  setShowSearch(true);
                  document.getElementById("people-search")?.focus();
                }}
              >
                <SquarePen size={20} />
              </button>
            </header>
            <div className="search-box chats-search">
              <Search size={17} />
              <input
                id="people-search"
                maxLength={100}
                placeholder="Поиск людей и чатов"
                aria-label="Поиск людей и чатов"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  aria-label="Очистить поиск"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="chat-list-tabs">
              <button
                className={!activeFolder ? "active" : ""}
                onClick={() => setActiveFolder(null)}
              >
                Все чаты
              </button>
              {folders.data?.folders.map((folder) => (
                <button
                  className={activeFolder === folder.id ? "active" : ""}
                  key={folder.id}
                  onClick={() => setActiveFolder(folder.id)}
                >
                  {folder.name}
                </button>
              ))}
              <button
                className="new-group-button"
                title="Создать группу или канал"
                aria-label="Создать группу или канал"
                onClick={() => setCommunityDialog(true)}
              >
                <Plus size={17} />
              </button>
            </div>
            <div className="chat-list-scroll">
              {search.trim() ? (
                <>
                  {matchingChats.length > 0 && (
                    <>
                      <div className="list-section-label">В ваших чатах</div>
                      {matchingChats.map((chat) => {
                        const person =
                          chat.kind === "direct"
                            ? chat.members.find(
                                (member) => member.user.id !== user.id,
                              )?.user
                            : {
                                id: 0,
                                name: chat.title,
                                username:
                                  chat.kind === "channel" ? "Канал" : "Группа",
                                bio: "",
                                createdAt: "",
                              };
                        if (!person) return null;
                        return (
                          <button
                            className="list-item"
                            key={chat.id}
                            onClick={() => {
                              setSelected(chat);
                              setProfile(null);
                              setSearch("");
                              setReplyTo(null);
                              setMessageSearch("");
                              setShowMessageSearch(false);
                            }}
                          >
                            <ChatAvatar chat={chat} user={person} />
                            <span className="item-copy">
                              <strong>{person.name}</strong>
                              <small>
                                {chat.kind === "direct"
                                  ? "Личная переписка"
                                  : person.username}
                              </small>
                            </span>
                            <MessageCircle size={16} />
                          </button>
                        );
                      })}
                    </>
                  )}
                  <div className="list-section-label">
                    Люди · поиск по имени и @юзернейму
                  </div>
                  {users.isLoading ? (
                    <p className="muted list-feedback">Поиск…</p>
                  ) : users.isError ? (
                    <p className="error">Не удалось выполнить поиск.</p>
                  ) : users.data?.users.length ? (
                    users.data.users.map((u) => (
                      <button
                        className="list-item"
                        key={u.id}
                        onClick={() => {
                          setSelected(null);
                          setProfile(u);
                        }}
                      >
                        <Avatar user={u} />
                        <span className="item-copy">
                          <strong>{u.name}</strong>
                          <small>@{u.username}</small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))
                  ) : (
                    <p className="muted list-feedback">
                      Никого не нашли. Попробуйте другое имя.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <button
                    className="wallet-chat list-item"
                    onClick={() => nav("wallet")}
                  >
                    <span className="wallet-chat-avatar">
                      <WalletIcon size={21} />
                    </span>
                    <span className="item-copy">
                      <strong>
                        Кошелёк Nimb <span className="bot-tag">БОТ</span>
                      </strong>
                      <small>Нимбики и ваши юзернеймы</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                  <div className="list-section-label">
                    ПЕРЕПИСКИ <span>{visibleChats.length}</span>
                  </div>
                  {chats.isLoading ? (
                    <p className="muted list-feedback">Загружаем чаты…</p>
                  ) : chats.isError ? (
                    <div className="list-feedback">
                      <p className="error">Не удалось загрузить чаты.</p>
                      <button
                        className="outline"
                        onClick={() => chats.refetch()}
                      >
                        Повторить
                      </button>
                    </div>
                  ) : visibleChats.length ? (
                    visibleChats.map((c) => {
                      const u =
                        c.kind === "direct"
                          ? c.members.find((m) => m.user.id !== user.id)?.user
                          : {
                              id: 0,
                              name: c.title,
                              username:
                                c.kind === "channel" ? "Канал" : "Группа",
                              bio: "",
                              createdAt: "",
                            };
                      if (!u) return null;
                      const latest = c.messages?.[0];
                      const ownMember = c.members.find(
                        (m) => m.user.id === user.id,
                      );
                      const unread =
                        !!latest &&
                        latest.senderId !== user.id &&
                        latest.id > (ownMember?.lastReadId || 0);
                      return (
                        <button
                          className={
                            "list-item chat-list-item " +
                            (selected?.id === c.id ? "selected" : "")
                          }
                          key={c.id}
                          aria-current={
                            selected?.id === c.id ? "true" : undefined
                          }
                          onClick={() => {
                            setSelected(c);
                            setProfile(null);
                            setReplyTo(null);
                            setMessageSearch("");
                            setShowMessageSearch(false);
                          }}
                        >
                          <span className="avatar-wrap">
                            <ChatAvatar chat={c} user={u} />
                            {"online" in u && u.online === true && (
                              <i className="presence-dot" />
                            )}
                          </span>
                          <span className="item-copy">
                            <strong>{u.name}</strong>
                            <small>
                              {typingChat === c.id
                                ? "Печатает…"
                                : latest?.text ||
                                  (latest?.attachment
                                    ? "Вложение"
                                    : "Нет сообщений")}
                            </small>
                          </span>
                          <span className="chat-item-meta">
                            {latest?.createdAt && (
                              <time>
                                {new Date(latest.createdAt).toLocaleTimeString(
                                  "ru-RU",
                                  { hour: "2-digit", minute: "2-digit" },
                                )}
                              </time>
                            )}
                            {unread && (
                              <span
                                className="unread-dot"
                                aria-label="Есть непрочитанные сообщения"
                              />
                            )}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="chat-list-empty">
                      <MessagesSquare size={25} strokeWidth={1.5} />
                      <strong>
                        {activeFolder
                          ? "В папке пока пусто"
                          : "Ваш первый разговор — впереди"}
                      </strong>
                      <p>Найдите человека по имени или @юзернейму.</p>
                      <button
                        className="text-action"
                        onClick={() =>
                          document.getElementById("people-search")?.focus()
                        }
                      >
                        Найти человека <ArrowRight size={15} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            <button
              className="create-community"
              onClick={() => setCommunityDialog(true)}
            >
              <Users size={18} />
              <span>Создать группу или канал</span>
              <Plus size={16} />
            </button>
          </section>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={
              walletOpen
                ? "wallet"
                : selected
                  ? "conversation"
                  : profile
                    ? "profile" + profile.id
                    : setting
                      ? "setting" + setting
                      : tab
            }
            className={
              "screen " +
              (messenger
                ? selected
                  ? "conversation-screen"
                  : profile
                    ? "chat-profile-screen"
                    : "conversation-placeholder"
                : "content-screen")
            }
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.18 }}
          >
            {walletOpen ? (
              <Wallet onBack={() => nav("chats")} />
            ) : selected && other ? (
              <>
                <header className="chat-header">
                  <button
                    className="icon-button"
                    onClick={() => setSelected(null)}
                    aria-label="Назад"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <button
                    className="person-button"
                    onClick={() =>
                      currentChat?.kind === "direct"
                        ? setProfile(other)
                        : setCommunityInfo(true)
                    }
                  >
                    {currentChat && (
                      <ChatAvatar chat={currentChat} user={other} />
                    )}
                    <span>
                      <strong>{other.name}</strong>
                      <small>
                        {currentChat?.kind === "direct"
                          ? `@${other.username}${other.online === true ? " · в сети" : ""}`
                          : `${currentChat?.members.length || 0} участников`}
                      </small>
                    </span>
                  </button>
                  <button
                    className="icon-button chat-close"
                    onClick={() => {
                      setShowMessageSearch(!showMessageSearch);
                      if (showMessageSearch) setMessageSearch("");
                    }}
                    aria-label={
                      showMessageSearch ? "Закрыть поиск" : "Поиск по чату"
                    }
                  >
                    {showMessageSearch ? <X size={20} /> : <Search size={20} />}
                  </button>
                </header>
                {profile && (
                  <div className="overlay" onClick={() => setProfile(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="icon-button close"
                        aria-label="Закрыть"
                        onClick={() => setProfile(null)}
                      >
                        <X size={20} />
                      </button>
                      <Profile
                        user={profile}
                        own={false}
                        onMessage={() => setProfile(null)}
                        onEdit={() => {}}
                      />
                    </div>
                  </div>
                )}
                {typingChat === selected.id && (
                  <div className="typing-indicator">Печатает…</div>
                )}
                {showMessageSearch && (
                  <div className="message-search">
                    <Search size={16} />
                    <input
                      autoFocus
                      value={messageSearch}
                      onChange={(e) => setMessageSearch(e.target.value)}
                      placeholder="Поиск по переписке"
                      aria-label="Поиск по переписке"
                    />
                  </div>
                )}
                <div className="message-area">
                  {messages.isError && (
                    <div className="chat-load-error">
                      Не удалось загрузить сообщения.{" "}
                      <button onClick={() => messages.refetch()}>
                        Повторить
                      </button>
                    </div>
                  )}
                  {!allMessages.length &&
                    !messages.isLoading &&
                    !messages.isError && (
                      <div className="conversation-start">
                        <MessageCircle size={30} strokeWidth={1.4} />
                        <strong>Нет сообщений</strong>
                        <small>Напишите первое сообщение</small>
                      </div>
                    )}
                  {messages.isLoading && (
                    <p className="muted">Загрузка сообщений…</p>
                  )}
                  {messages.hasNextPage && (
                    <button
                      className="load-earlier"
                      disabled={messages.isFetchingNextPage}
                      onClick={() => messages.fetchNextPage()}
                    >
                      {messages.isFetchingNextPage
                        ? "Загрузка…"
                        : "Загрузить ранние сообщения"}
                    </button>
                  )}
                  {allMessages.map((m, index) => (
                    <React.Fragment key={m.id}>
                      {(index === 0 ||
                        new Date(
                          allMessages[index - 1].createdAt,
                        ).toDateString() !==
                          new Date(m.createdAt).toDateString()) && (
                        <div className="message-date">
                          {new Date(m.createdAt).toLocaleDateString("ru-RU", {
                            day: "numeric",
                            month: "long",
                          })}
                        </div>
                      )}
                      <MessageBubble
                        key={m.id}
                        message={m}
                        me={user.id}
                        showViews={currentChat?.kind === "channel"}
                        read={
                          currentChat?.kind === "direct" &&
                          !!currentChat.members.find(
                            (member) =>
                              member.user.id !== user.id &&
                              member.lastReadId >= m.id,
                          )
                        }
                        sender={
                          currentChat?.kind !== "direct" &&
                          m.senderId !== user.id
                            ? currentChat?.members.find(
                                (member) => member.user.id === m.senderId,
                              )?.user.name || "Участник"
                            : undefined
                        }
                        canPin={
                          currentChat?.kind === "direct" ||
                          ["owner", "admin"].includes(
                            currentChat?.members.find(
                              (member) => member.user.id === user.id,
                            )?.role || "",
                          )
                        }
                        onReply={setReplyTo}
                        onForward={setForwardMessage}
                        onError={setError}
                      />
                    </React.Fragment>
                  ))}
                  <div ref={end} />
                </div>
                {currentChat?.kind === "channel" &&
                currentChat.members.find((m) => m.user.id === user.id)?.role ===
                  "member" ? (
                  <p className="muted">
                    Публиковать в канале могут только администраторы.
                  </p>
                ) : (
                  <div className="composer-wrap">
                    {replyTo && (
                      <div className="reply-compose">
                        Ответ: {replyTo.text}
                        <button
                          onClick={() => setReplyTo(null)}
                          aria-label="Отменить ответ"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                    <form
                      className="composer"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (text.trim() && !submitMessage.isPending)
                          submitMessage.mutate({
                            chatId: selected.id,
                            text,
                            replyToId: replyTo?.id,
                          });
                      }}
                    >
                      <label
                        className="attach-button"
                        title="Прикрепить изображение или PDF"
                      >
                        <Paperclip size={19} />
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          disabled={uploadFile.isPending}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadFile.mutate(file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <input
                        value={text}
                        maxLength={4000}
                        onChange={(e) => {
                          setText(e.target.value);
                          if (e.target.value.trim())
                            socketRef.current?.emit("typing", {
                              chatId: selected.id,
                            });
                        }}
                        placeholder="Написать сообщение..."
                        aria-label="Сообщение"
                      />
                      <button
                        disabled={!text.trim() || submitMessage.isPending}
                        aria-label="Отправить"
                      >
                        <Send size={19} />
                      </button>
                    </form>
                  </div>
                )}
              </>
            ) : profile ? (
              <>
                <button className="back-link" onClick={() => setProfile(null)}>
                  <ArrowLeft size={18} /> Назад
                </button>
                <Profile
                  user={profile}
                  own={profile.id === user.id}
                  isAdmin={profile.id === user.id && me.data.isAdmin}
                  onAdmin={() => nav("admin")}
                  onMessage={() => openChat.mutate(profile.id)}
                  onEdit={() => setEditing(true)}
                />
              </>
            ) : tab === "chats" ? (
              <div className="conversation-welcome">
                <div className="welcome-symbol">
                  <MessagesSquare size={40} strokeWidth={1.25} />
                </div>
                <span className="eyebrow">NIMB MESSENGER</span>
                <h1>
                  Всё начинается
                  <br />с «привет».
                </h1>
                <p>
                  Откройте переписку слева
                  <br />
                  или найдите человека по @юзернейму.
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    setShowSearch(true);
                    requestAnimationFrame(() =>
                      document.getElementById("people-search")?.focus(),
                    );
                  }}
                >
                  <SquarePen size={18} /> Новое сообщение
                </button>
                <div className="welcome-footnote">
                  <AtSign size={15} /> Для общения достаточно имени пользователя
                </div>
              </div>
            ) : tab === "profile" ? (
              <Profile
                user={user}
                own
                isAdmin={me.data.isAdmin}
                onAdmin={() => nav("admin")}
                onMessage={() => {}}
                onEdit={() => setEditing(true)}
              />
            ) : tab === "feed" ? (
              <Feed me={user} onOpen={setProfile} onNavigate={nav} />
            ) : tab === "admin" && me.data.isAdmin ? (
              <Admin />
            ) : (
              <>
                <header className="settings-heading">
                  <PageHeading
                    eyebrow="ПОД ВАС"
                    title="Настройки"
                    description="Ваш аккаунт. Ваши правила."
                  />
                </header>
                {setting ? (
                  <>
                    <button
                      className="back-link"
                      onClick={() => setSetting("")}
                    >
                      <ArrowLeft size={18} /> Все настройки
                    </button>
                    {setting === "Установить приложение" ? (
                      <InstallApp {...installApp} />
                    ) : setting === "Администрирование" ? (
                      <Admin />
                    ) : setting === "Аккаунт" ? (
                      <AccountSettings
                        edit={() => {
                          setSetting("");
                          setTab("profile");
                          setEditing(true);
                        }}
                      />
                    ) : setting === "Хранилище" ? (
                      <StorageSettings />
                    ) : setting === "О приложении" ? (
                      <AboutSettings />
                    ) : setting === "Язык" ? (
                      <LanguageSettings />
                    ) : setting === "Папки с чатами" ? (
                      <FolderSettings
                        chats={chats.data?.chats || []}
                        userId={user.id}
                      />
                    ) : setting === "Уведомления" ? (
                      <NotificationSettings />
                    ) : ["Шрифты", "Оформление", "Производительность"].includes(
                        setting,
                      ) ? (
                      <Preferences section={setting} />
                    ) : setting === "Конфиденциальность" ? (
                      <PrivacySettings
                        user={user}
                        onUpdate={(u) =>
                          qc.setQueryData(
                            ["me"],
                            (
                              old:
                                | { user: User; isAdmin?: boolean }
                                | undefined,
                            ) => ({ ...old, user: u }),
                          )
                        }
                      />
                    ) : ["Безопасность", "Устройства"].includes(setting) ? (
                      <SecuritySettings section={setting} />
                    ) : (
                      <div className="setting-detail">
                        <h2>{setting}</h2>
                        <p>В разработке</p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {me.data?.isAdmin && (
                      <button
                        className="admin-entry"
                        onClick={() => nav("admin")}
                      >
                        <span className="admin-entry-icon">
                          <Shield size={20} />
                        </span>
                        <span>
                          <strong>Панель администратора</strong>
                          <small>Пользователи, подарки и жалобы</small>
                        </span>
                        <ChevronRight size={19} />
                      </button>
                    )}
                    <div className="search-box settings-search">
                      <Search size={19} />
                      <input
                        placeholder="Поиск"
                        aria-label="Поиск настроек"
                        value={settingsSearch}
                        onChange={(e) => setSettingsSearch(e.target.value)}
                      />
                    </div>
                    <button
                      className="settings-profile"
                      onClick={() => nav("profile")}
                    >
                      <Avatar user={user} />
                      <span>
                        <strong>{user.name}</strong>
                        <small>@{user.username}</small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                    <div className="settings-groups">
                      {[
                        [
                          ["Аккаунт", UserRound, "blue"],
                          ["Уведомления", Bell, "red"],
                        ],
                        [
                          ["Язык", Globe, "purple"],
                          ["Конфиденциальность", Shield, "blue"],
                          ["Устройства", Monitor, "orange"],
                          ["Безопасность", LockKeyhole, "green"],
                          ["Оформление", Palette, "gray"],
                          ["Шрифты", Type, "blue"],
                        ],
                        [
                          ["Папки с чатами", Folder, "cyan"],
                          ["Производительность", Zap, "green"],
                          ["Хранилище", HardDrive, "orange"],
                          ["О приложении", Info, "purple"],
                          ["Установить приложение", Smartphone, "blue"],
                        ],
                      ].map((group, i) => {
                        const items = group.filter(([name]) =>
                          (name as string)
                            .toLowerCase()
                            .includes(settingsSearch.toLowerCase()),
                        );
                        return (
                          items.length > 0 && (
                            <section className="settings-group" key={i}>
                              <h2>
                                {
                                  [
                                    "Аккаунт",
                                    "Личное пространство",
                                    "Приложение",
                                  ][i]
                                }
                              </h2>
                              <div className="settings-list">
                                {items.map(([name, Icon, color]) => (
                                  <button
                                    key={name as string}
                                    onClick={() => setSetting(name as string)}
                                  >
                                    <span className={"setting-icon " + color}>
                                      <Icon size={20} />
                                    </span>
                                    <span>{name as string}</span>
                                    <ChevronRight size={18} />
                                  </button>
                                ))}
                              </div>
                            </section>
                          )
                        );
                      })}
                    </div>
                    <button
                      className="logout"
                      onClick={async () => {
                        await api("/logout", send("POST", {}));
                        localStorage.removeItem("nimb_push_enabled");
                        qc.clear();
                        location.reload();
                      }}
                    >
                      <LogOut size={17} /> Выйти из аккаунта
                    </button>
                  </>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
        {error && (
          <div className="toast" onClick={() => setError("")}>
            {error} <X size={15} />
          </div>
        )}
      </main>
      <div className="mobile-nav">
        <Nav tab={tab} nav={nav} mobile />
      </div>
      {forwardMessage && (
        <div className="overlay" onClick={() => setForwardMessage(null)}>
          <div
            className="modal edit-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button close"
              onClick={() => setForwardMessage(null)}
              aria-label="Закрыть"
            >
              <X size={20} />
            </button>
            <div className="small-label">ПЕРЕСЛАТЬ СООБЩЕНИЕ</div>
            <h2>Выберите чат</h2>
            <p className="muted">{forwardMessage.text}</p>
            <div className="people-list">
              {chats.data?.chats.map((c) => {
                const target =
                  c.kind === "direct"
                    ? c.members.find((m) => m.user.id !== user.id)?.user
                    : {
                        id: 0,
                        name: c.title,
                        username: c.kind === "channel" ? "Канал" : "Группа",
                        bio: "",
                        createdAt: "",
                      };
                if (!target) return null;
                return (
                  <button
                    className="list-item"
                    key={c.id}
                    onClick={async () => {
                      try {
                        await api(
                          `/messages/${forwardMessage.id}/forward`,
                          send("POST", { chatId: c.id }),
                        );
                        setForwardMessage(null);
                        setSelected(c);
                        qc.invalidateQueries({ queryKey: ["chats"] });
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    <ChatAvatar chat={c} user={target} />
                    <span className="item-copy">
                      <strong>{target.name}</strong>
                      <small>
                        {c.kind === "direct"
                          ? `@${target.username}`
                          : target.username}
                      </small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {communityDialog && (
        <CommunityDialog
          close={() => setCommunityDialog(false)}
          open={(c) => {
            setTab("chats");
            setSelected(c as Chat);
            setProfile(null);
          }}
        />
      )}
      {communityInfo && currentChat && (
        <CommunityInfo
          chat={currentChat as CommunityChat}
          me={user}
          close={() => setCommunityInfo(false)}
          update={(c) => setSelected(c as Chat)}
        />
      )}{" "}
      {editing && (
        <div className="overlay" onClick={() => setEditing(false)}>
          <div
            className="modal edit-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button close"
              aria-label="Закрыть"
              onClick={() => setEditing(false)}
            >
              <X size={20} />
            </button>
            <div className="small-label">ВАШ ПРОФИЛЬ</div>
            <h2>Редактировать</h2>
            <ProfileMediaEditor
              user={user}
              onUpdate={(u) => {
                qc.setQueryData(
                  ["me"],
                  (old: { user: User; isAdmin?: boolean } | undefined) => ({
                    ...old,
                    user: u,
                  }),
                );
                setProfile(u);
                qc.invalidateQueries({ queryKey: ["chats"] });
                qc.invalidateQueries({ queryKey: ["users"] });
              }}
            />
            <MusicEditor
              user={user}
              onUpdate={(u) => {
                qc.setQueryData(
                  ["me"],
                  (old: { user: User; isAdmin?: boolean } | undefined) => ({
                    ...old,
                    user: u,
                  }),
                );
                setProfile(u);
              }}
            />
            <LinksEditor
              user={user}
              onUpdate={(u) => {
                qc.setQueryData(
                  ["me"],
                  (old: { user: User; isAdmin?: boolean } | undefined) => ({
                    ...old,
                    user: u,
                  }),
                );
                setProfile(u);
              }}
            />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                save.mutate({
                  name: String(f.get("name")),
                  bio: String(f.get("bio")),
                });
              }}
            >
              <label>
                Имя
                <input
                  name="name"
                  defaultValue={user.name}
                  required
                  maxLength={50}
                />
              </label>
              <label>
                О себе
                <textarea
                  name="bio"
                  defaultValue={user.bio}
                  maxLength={500}
                  rows={4}
                />
              </label>
              <button className="primary" disabled={save.isPending}>
                Сохранить <Check size={18} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
function Nav({
  tab,
  nav,
  mobile = false,
}: {
  tab: string;
  nav: (t: string) => void;
  mobile?: boolean;
}) {
  const items = mobile
    ? [
        ["chats", "Чаты", MessagesSquare],
        ["feed", "Лента", AlignJustify],
        ["wallet", "Кошелёк", WalletIcon],
        ["profile", "Профиль", CircleUserRound],
        ["settings", "Настройки", Settings],
      ]
    : [
        ["chats", "Сообщения", MessagesSquare],
        ["feed", "Лента", AlignJustify],
        ["wallet", "Кошелёк", WalletIcon],
        ["profile", "Мой профиль", CircleUserRound],
      ];
  return (
    <nav aria-label={mobile ? "Разделы" : "Разделы Nimb"}>
      {items.map(([key, label, Icon]) => (
        <button
          key={key as string}
          className={tab === key ? "active" : ""}
          aria-current={tab === key ? "page" : undefined}
          aria-label={label as string}
          title={label as string}
          onClick={() => nav(key as string)}
        >
          <Icon size={21} />
          <span>{label as string}</span>
        </button>
      ))}
    </nav>
  );
}
function Profile({
  user: initial,
  own,
  onMessage,
  onEdit,
  isAdmin = false,
  onAdmin,
}: {
  user: User;
  own: boolean;
  onMessage: () => void;
  onEdit: () => void;
  isAdmin?: boolean;
  onAdmin?: () => void;
}) {
  const fetched = useQuery({
    queryKey: ["profile", initial.id],
    queryFn: () => api<{ user: User }>(`/users/${initial.id}`),
    enabled: !own && initial.id > 0,
    refetchInterval: 30000,
  });
  const user = fetched.data?.user || initial;
  const [profileTab, setProfileTab] = useState<"gifts" | "posts">("gifts");
  const [giftOpen, setGiftOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  async function share() {
    const url = new URL(location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("user", String(user.id));
    try {
      if (navigator.share)
        await navigator.share({
          title: user.name + " · nimb",
          url: url.toString(),
        });
      else {
        await navigator.clipboard.writeText(url.toString());
        setShareNotice("Ссылка скопирована");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setShareNotice("Не удалось скопировать ссылку");
    }
  }
  return (
    <div className={"profile " + (own ? "own-profile" : "other-profile")}>
      <PageHeading
        eyebrow={own ? "ЛИЧНОЕ" : "ПОЛЬЗОВАТЕЛЬ"}
        title={own ? "Мой профиль" : "Профиль"}
        action={
          <button className="outline compact-button" onClick={share}>
            <Share2 size={16} />
            <span>Поделиться</span>
          </button>
        }
      />
      <section className="profile-identity-card">
        <div
          className={
            "profile-cover " + (user.hasBanner ? "" : "profile-cover-default")
          }
          style={
            user.hasBanner
              ? {
                  backgroundImage: `url(/api/users/${user.id}/media/banner?v=${user.mediaVersion || 0})`,
                }
              : undefined
          }
        >
          {!user.hasBanner && (
            <>
              <span className="profile-cover-word">nimb</span>
              <span className="profile-cover-caption">МЕСТО ДЛЯ СВОИХ</span>
            </>
          )}
        </div>
        <div className="profile-identity">
          <Avatar user={user} size="large" />
          <div className="profile-title">
            <h1><VerifiedName user={user}/></h1>
            <span>@{user.username}</span>
            {user.online !== undefined && user.online !== null && (
              <small className="profile-status">
                {user.online ? "В сети" : "Не в сети"}
              </small>
            )}
          </div>
          <div className="profile-quick-actions">
            {own ? (
              <button className="outline compact-button" onClick={onEdit}>
                <Pencil size={16} />
                <span>Редактировать</span>
              </button>
            ) : (
              <>
                <button
                  className="icon-button"
                  aria-label="Другие действия"
                  onClick={() => setActionsOpen(!actionsOpen)}
                >
                  <MoreHorizontal size={20} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Подарить подарок"
                  onClick={() => {
                    setProfileTab("gifts");
                    setGiftOpen(true);
                  }}
                >
                  <Gift size={20} />
                </button>
                <button className="primary" onClick={onMessage}>
                  <MessageCircle size={17} /> Написать
                </button>
              </>
            )}
          </div>
        </div>
        {user.bio && <p className="profile-bio">{user.bio}</p>}
        {user.bioPrivate && !own && (
          <p className="muted profile-bio">Описание скрыто владельцем.</p>
        )}
        <div className="profile-meta">
          <span>
            <Hash size={15} /> ID {user.id}
          </span>
          <span>
            <CalendarDays size={15} /> С {date(user.createdAt)}
          </span>
        </div>
      </section>
      {shareNotice && (
        <p className="notice" role="status">
          {shareNotice}
        </p>
      )}
      {!own && actionsOpen && <ProfileActions user={user} />}
      {own && isAdmin && (
        <button className="profile-admin-link" onClick={onAdmin}>
          <Shield size={20} />
          <span>
            <strong>Админ-панель</strong>
            <small>Пользователи, нимбики и подарки</small>
          </span>
          <ArrowUpRight size={18} />
        </button>
      )}
      <div className="profile-columns">
        <aside className="profile-about">
          <section className="profile-about-card">
            <h2>О профиле</h2>
            <dl>
              <div>
                <dt>Юзернейм</dt>
                <dd>@{user.username}</dd>
              </div>
              <div>
                <dt>Номер аккаунта</dt>
                <dd>#{user.id}</dd>
              </div>
            </dl>
            <ProfileLinks user={user} />
          </section>
          <Collections userId={user.id} own={own} section="badges" />
          <ProfileMusic user={user} own={own} />
        </aside>
        <section className="profile-collection">
          <div
            className="profile-tabs"
            role="tablist"
            aria-label="Коллекция профиля"
          >
            <button
              role="tab"
              aria-selected={profileTab === "gifts"}
              className={profileTab === "gifts" ? "active" : ""}
              onClick={() => setProfileTab("gifts")}
            >
              <Gift size={17} /> Подарки
            </button>
            <button
              role="tab"
              aria-selected={profileTab === "posts"}
              className={profileTab === "posts" ? "active" : ""}
              onClick={() => setProfileTab("posts")}
            >
              <AlignJustify size={17} /> Публикации
            </button>
          </div>
          <div hidden={profileTab !== "gifts"}>
            <Collections
              userId={user.id}
              own={own}
              section="gifts"
              openCatalog={giftOpen}
              onCatalogClose={() => setGiftOpen(false)}
            />
          </div>
          {profileTab === "posts" && <ProfilePosts user={user} />}
        </section>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <MotionPreferences>
        <App />
      </MotionPreferences>
    </QueryClientProvider>
  </React.StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD)
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("/sw.js").catch(() => {}),
  );
