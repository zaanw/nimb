import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
  Store,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Compass,
  LogOut,
  MessageCircle,
  Paperclip,
  FileText,
  PanelRight,
  Plus,
  Search,
  Smile,
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
  Bookmark,
  Archive,
  Pin,
  ArrowUpRight,
} from "lucide-react";
import "./style.css";
import { Brand, PageHeading, Dialog, LoadingRows } from "./UI";
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
import {
  NotificationSettings,
  notifyMessage,
  syncPushSubscription,
  clearPushPreference,
} from "./Notifications";
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
import { ChatTools, SavedMessages, usePersistentDrafts } from "./ChatExtras";
import { ProfileIdentifiers } from "./ProfileIdentifiers";
import { UserName, IdentitySettings, type Identity } from "./Identity";
import "./theme.css";
import "./quiet.css";
import "./design-system.css";
import "./market.css";
import "./rooms.css";
import "./panels.css";
import "./collection-surfaces.css";
import "./studio.css";
import { SettingsMenu, SettingsOverview } from "./SettingsMenu";
initializePreferences();
const Market = React.lazy(() =>
  import("./Market").then((module) => ({ default: module.Market })),
);

type User = Identity & {
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
  members: {
    user: User;
    role: string;
    lastReadId: number;
    chatPinned?: boolean;
    archived?: boolean;
  }[];
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
const desktopViewport = window.matchMedia("(min-width: 761px)");

function subscribeDesktop(onChange: () => void) {
  desktopViewport.addEventListener("change", onChange);
  return () => desktopViewport.removeEventListener("change", onChange);
}

function isDesktop() {
  return desktopViewport.matches;
}

function App() {
  const qc = useQueryClient();
  const installApp = useInstallApp();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: User; isAdmin?: boolean }>("/me"),
    retry: false,
  });
  const [restoredUser, setRestoredUser] = useState<number | null>(null);
  const [pushChatId, setPushChatId] = useState<number | null>(() => {
    const raw = new URLSearchParams(location.search).get("chat");
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  });
  const [tab, setTab] = useState("chats");
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop);
  const [workspaceTab, setWorkspaceTab] = useState("chats");
  const workspaceTrigger = useRef<HTMLElement | null>(null);
  const profileTrigger = useRef<HTMLElement | null>(null);
  const [selected, setSelected] = useState<Chat | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsToggle = useRef<HTMLButtonElement>(null);
  const composerField = useRef<HTMLTextAreaElement>(null);
  const emojiButton = useRef<HTMLButtonElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  useEffect(() => {
    setDetailsOpen(false);
    setEmojiOpen(false);
  }, [selected?.id, desktop]);
  const [walletOpen, setWalletOpen] = useState(false);
  const [profile, setProfile] = useState<User | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const [communityDialog, setCommunityDialog] = useState(
    !!new URLSearchParams(location.search).get("invite"),
  );
  const [communityInfo, setCommunityInfo] = useState(false);
  const [setting, setSetting] = useState("");
  const [settingsSearch, setSettingsSearch] = useState("");
  const [activeFolder, setActiveFolder] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = usePersistentDrafts(me.data?.user.id);
  const [chatFilter, setChatFilter] = useState<"all" | "unread" | "archive">(
    "all",
  );
  const [chatTools, setChatTools] = useState(false);
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
  const mainRef = useRef<HTMLElement>(null);
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
  useEffect(() => {
    const id = me.data?.user.id;
    if (!id || restoredUser === id) return;
    try {
      const saved = JSON.parse(
        localStorage.getItem(`nimb_navigation_${id}`) || "{}",
      );
      if (
        !location.search.includes("user=") &&
        !location.search.includes("invite=") &&
        !pushChatId
      ) {
        const requestedTab =
          new URLSearchParams(location.search).get("tab") || saved.tab;
        const next = [
          "chats",
          "feed",
          "profile",
          "settings",
          "wallet",
          "market",
          "saved",
          ...(me.data?.isAdmin ? ["admin"] : []),
        ].includes(requestedTab)
          ? requestedTab
          : "chats";
        if (next === "chats" && saved.chatId && !chats.data && !chats.isError)
          return;
        setTab(next);
        setWalletOpen(next === "wallet");
        const settings = [
          "Аккаунт",
          "Уведомления",
          "Язык",
          "Конфиденциальность",
          "Устройства",
          "Безопасность",
          "Оформление",
          "Шрифты",
          "Папки с чатами",
          "Производительность",
          "Хранилище",
          "О приложении",
          "Установить приложение",
          "nimb Plus",
        ];
        setSetting(
          next === "settings" && settings.includes(saved.setting)
            ? saved.setting
            : "",
        );
        setSelected(
          next === "chats"
            ? chats.data?.chats.find((c) => c.id === saved.chatId) || null
            : null,
        );
      }
    } catch {
      /* An unavailable or outdated storage must never prevent login. */
    }
    setRestoredUser(id);
  }, [
    me.data?.user.id,
    me.data?.isAdmin,
    chats.data,
    chats.isError,
    restoredUser,
    pushChatId,
  ]);
  useEffect(() => {
    const id = me.data?.user.id;
    if (!id || restoredUser !== id) return;
    try {
      localStorage.setItem(
        `nimb_navigation_${id}`,
        JSON.stringify({
          tab: walletOpen ? "wallet" : tab,
          setting,
          chatId: selected?.id,
        }),
      );
    } catch {}
  }, [restoredUser, me.data?.user.id, tab, setting, selected?.id, walletOpen]);
  useEffect(() => {
    if (me.data?.user.id) void syncPushSubscription();
  }, [me.data?.user.id]);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const receive = (event: MessageEvent) => {
      const id = event.data?.chatId;
      if (
        event.data?.type === "OPEN_CHAT" &&
        Number.isSafeInteger(id) &&
        id > 0
      )
        void qc
          .invalidateQueries({ queryKey: ["chats"] })
          .then(() => setPushChatId(id));
    };
    navigator.serviceWorker.addEventListener("message", receive);
    return () =>
      navigator.serviceWorker.removeEventListener("message", receive);
  }, [qc]);
  useEffect(() => {
    if (!pushChatId || !me.data || !chats.data || chats.isFetching) return;
    const chat = chats.data.chats.find((c) => c.id === pushChatId);
    const url = new URL(location.href);
    url.searchParams.delete("chat");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
    setTab("chats");
    setWalletOpen(false);
    setProfile(null);
    setSetting("");
    setReplyTo(null);
    setMessageSearch("");
    setShowMessageSearch(false);
    if (chat) setSelected(chat);
    else {
      setSelected(null);
      setError("Переписка из уведомления недоступна для этого аккаунта.");
    }
    setPushChatId(null);
  }, [pushChatId, me.data?.user.id, chats.data, chats.isFetching]);
  useEffect(() => {
    const update = () =>
      socketRef.current?.emit("push:activity", {
        chatId: tab === "chats" && !profile ? selected?.id || null : null,
        visible: document.visibilityState === "visible" && document.hasFocus(),
      });
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("nimb-socket-ready", update);
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("nimb-socket-ready", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
    };
  }, [selected?.id, tab, profile?.id]);
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
    socket.on("connect", () =>
      window.dispatchEvent(new Event("nimb-socket-ready")),
    );
    socket.on("connect", () => {
      qc.invalidateQueries({ queryKey: ["chats"] });
      qc.invalidateQueries({ queryKey: ["messages"] });
      qc.invalidateQueries({ queryKey: ["gifts"] });
    });
    socket.on("wallet:update", () => {
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["account"] });
    });
    socket.on("personal:update", () => {
      qc.invalidateQueries({ queryKey: ["chats"] });
      qc.invalidateQueries({ queryKey: ["saved"] });
      qc.invalidateQueries({ queryKey: ["messages"] });
    });
    socket.on("gift:new", async () => {
      await qc.cancelQueries({ queryKey: ["gifts"] });
      await Promise.all(
        ["gifts", "market-collection", "market-catalog"].map((key) =>
          qc.invalidateQueries({ queryKey: [key] }),
        ),
      );
    });
    socket.on("profile:update", (payload: { id: number }) => {
      if (payload.id === me.data?.user.id) {
        qc.invalidateQueries({ queryKey: ["me"] });
        qc.invalidateQueries({ queryKey: ["wallet"] });
      }
      qc.invalidateQueries({ queryKey: ["profile", payload.id] });
      qc.invalidateQueries({ queryKey: ["identifiers", payload.id] });
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
            notifyMessage(m.chatId);
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
    const area = end.current?.closest(".message-area");
    const reducedMotion =
      document.documentElement.dataset.reduceMotion === "true" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    area?.scrollTo({
      top: area.scrollHeight,
      behavior: reducedMotion ? "auto" : "smooth",
    });
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
      setWalletOpen(false);
      setSearch("");
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
      setProfile((current) => (current?.id === user.id ? user : current));
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
  const ownPreferences = (chat: Chat) =>
    chat.members.find((m) => m.user.id === user.id);
  const isUnread = (chat: Chat) =>
    !!chat.messages?.[0] &&
    chat.messages[0].senderId !== user.id &&
    chat.messages[0].id > (ownPreferences(chat)?.lastReadId || 0);
  const visibleChats = (chats.data?.chats || [])
    .filter(
      (chat) =>
        (chatFilter === "archive"
          ? ownPreferences(chat)?.archived
          : !ownPreferences(chat)?.archived) &&
        (chatFilter !== "unread" || isUnread(chat)) &&
        (!activeFolder ||
          !selectedFolder ||
          selectedFolder.chatIds.includes(chat.id)),
    )
    .sort(
      (a, b) =>
        Number(!!ownPreferences(b)?.chatPinned) -
          Number(!!ownPreferences(a)?.chatPinned) ||
        (b.messages?.[0]?.id || b.id) - (a.messages?.[0]?.id || a.id),
    );
  function selectChat(chat: Chat) {
    setSelected(chat);
    setProfile(null);
    setSearch("");
    setReplyTo(null);
    setMessageSearch("");
    setShowMessageSearch(false);
  }
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
  const accountPanel = desktop && (tab === "profile" || tab === "settings");
  const activeTab = accountPanel ? workspaceTab : tab;
  const profilePanel = desktop || selected ? profile : null;
  const workspaceBlocked = !!(accountPanel || profilePanel);

  function nav(t: string, keepWorkspace = false) {
    const openingPanel = desktop && (t === "profile" || t === "settings");
    if (openingPanel && !accountPanel) {
      workspaceTrigger.current = document.activeElement as HTMLElement | null;
      setWorkspaceTab(tab);
    }
    const url = new URL(location.href);
    url.searchParams.set("tab", t);
    for (const key of ["user", "invite", "chat"]) url.searchParams.delete(key);
    if (t !== "market" && !openingPanel)
      for (const key of ["market-view", "market-search"])
        url.searchParams.delete(key);
    history.replaceState(null, "", url);
    if (!openingPanel && !keepWorkspace) {
      if (mainRef.current) mainRef.current.scrollTop = 0;
      setSearch("");
      setReplyTo(null);
      setMessageSearch("");
      setShowMessageSearch(false);
      setSelected(null);
    }
    setWalletOpen(t === "wallet");
    setTab(t);
    setProfile(null);
    setSetting("");
    setError("");
  }
  function showProfile(user: User) {
    profileTrigger.current = document.activeElement as HTMLElement | null;
    setProfile(user);
  }

  function closeProfile() {
    setProfile(null);
    requestAnimationFrame(() => profileTrigger.current?.focus());
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
  const ownProfile = (
    <Profile
      user={user}
      own
      isAdmin={me.data.isAdmin}
      onAdmin={() => nav("admin")}
      onMessage={() => {}}
      onEdit={() => setEditing(true)}
    />
  );
  const settingsContent = (
    <div className={"settings-screen " + (setting ? "has-section" : "")}>
      <div className="settings-heading">
        <PageHeading title="Настройки" />
      </div>
      <div className="settings-layout">
        <SettingsMenu
          avatar={<Avatar user={user} />}
          name={<UserName user={user} />}
          username={user.username}
          selected={setting}
          search={settingsSearch}
          onSearch={setSettingsSearch}
          onSelect={setSetting}
          onProfile={() => nav("profile")}
          onLogout={async () => {
            await api("/logout", send("POST", {}));
            clearPushPreference();
            qc.clear();
            location.reload();
          }}
        />
        <section className="settings-content" aria-label="Содержимое настроек">
          {setting ? (
            <>
              <button className="back-link" onClick={() => setSetting("")}>
                <ArrowLeft size={18} /> Все настройки
              </button>
              {setting === "Установить приложение" ? (
                <InstallApp {...installApp} />
              ) : setting === "Администрирование" ? (
                <Admin owner={user.id === 1} />
              ) : setting === "nimb Plus" ? (
                <IdentitySettings key={`${user.id}-${user.plus}`} user={user} />
              ) : setting === "Аккаунт" ? (
                <AccountSettings
                  edit={() => {
                    nav("profile");
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
                      (old: { user: User; isAdmin?: boolean } | undefined) => ({
                        ...old,
                        user: u,
                      }),
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
              <SettingsOverview onSelect={setSetting} />
              {me.data?.isAdmin && (
                <button className="admin-entry" onClick={() => nav("admin")}>
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
            </>
          )}
        </section>
      </div>
    </div>
  );
  const showingWallet = activeTab === "wallet" || (!accountPanel && walletOpen);
  const messenger = activeTab === "chats" && !showingWallet;
  return (
    <div
      className={
        "shell studio-shell " +
        (activeTab === "market" ? "market-open " : "") +
        (messenger ? "messenger-shell" : "") +
        (messenger && (selected || (!profilePanel && profile))
          ? " conversation-open"
          : "")
      }
    >
      <a
        className="skip-link"
        href={
          messenger && !desktop && !selected && !profile
            ? "#chat-list"
            : "#main-content"
        }
        inert={workspaceBlocked}
      >
        К содержимому
      </a>
      <main
        inert={workspaceBlocked}
        ref={mainRef}
        className={
          "main " +
          (messenger
            ? "chat-workspace"
            : showingWallet
              ? "wallet-workspace"
              : "page-workspace") +
          (selected ? " has-chat" : "")
        }
      >
        <aside className="workspace-sidebar" aria-label="Боковая панель Nimb">
          <header className="sidebar-top">
            <button
              className="sidebar-brand"
              onClick={() => nav("chats")}
              aria-label="Nimb — на главную"
            >
              <Brand />
            </button>
            {messenger && (
              <button
                className="icon-button"
                aria-label="Создать группу или канал"
                title="Создать группу или канал"
                onClick={() => setCommunityDialog(true)}
              >
                <Users size={19} aria-hidden="true" />
              </button>
            )}
          </header>
          <div className="sidebar-sections">
            <Nav tab={activeTab} nav={nav} />
          </div>
          {messenger && (
            <section
              id="chat-list"
              tabIndex={-1}
              className="conversation-list"
              aria-label="Список чатов"
            >
              <header className="chats-heading">
                <div>
                  <h1>Чаты</h1>
                </div>
                <div className="chats-actions">
                  <button
                    className="icon-button chat-saved-shortcut"
                    aria-label="Открыть избранное"
                    title="Избранное"
                    onClick={() => nav("saved")}
                  >
                    <Bookmark size={18} aria-hidden="true" />
                  </button>
                  <button
                    className="icon-button mobile-create-group"
                    aria-label="Создать группу или канал"
                    title="Создать группу или канал"
                    onClick={() => setCommunityDialog(true)}
                  >
                    <Users size={19} aria-hidden="true" />
                  </button>
                  <button
                    className="icon-button compose-new"
                    aria-label="Найти пользователя"
                    title="Новое сообщение"
                    onClick={() =>
                      document.getElementById("people-search")?.focus()
                    }
                  >
                    <SquarePen size={18} aria-hidden="true" />
                  </button>
                </div>
              </header>
              <div className="search-box chats-search">
                <Search size={17} />
                <input
                  id="people-search"
                  maxLength={100}
                  name="people-search"
                  type="search"
                  autoComplete="off"
                  placeholder="Поиск"
                  aria-label="Поиск людей и чатов"
                  spellCheck={false}
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
              <div
                className="chat-list-tabs"
                hidden={!folders.data?.folders.length}
              >
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
              </div>
              <div className="chat-filters" aria-label="Фильтр переписок">
                {[
                  ["all", "Все"],
                  ["unread", "Непрочитанные"],
                  ["archive", "Архив"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={chatFilter === value ? "active" : ""}
                    aria-pressed={chatFilter === value}
                    onClick={() => setChatFilter(value as typeof chatFilter)}
                  >
                    {label}
                  </button>
                ))}
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
                                    chat.kind === "channel"
                                      ? "Канал"
                                      : "Группа",
                                  bio: "",
                                  createdAt: "",
                                };
                          if (!person) return null;
                          return (
                            <button
                              className="list-item"
                              key={chat.id}
                              onClick={() => selectChat(chat)}
                            >
                              <ChatAvatar chat={chat} user={person} />
                              <span className="item-copy">
                                <strong>
                                  <UserName user={person} />
                                </strong>
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
                            showProfile(u);
                          }}
                        >
                          <Avatar user={u} />
                          <span className="item-copy">
                            <strong>
                              <UserName user={u} />
                            </strong>
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
                    <div className="chat-shortcuts">
                      <button
                        className="wallet-chat list-item"
                        onClick={() => nav("wallet")}
                      >
                        <span className="wallet-chat-avatar">
                          <WalletIcon size={21} />
                        </span>
                        <span className="item-copy">
                          <strong>Кошелёк</strong>
                        </span>
                        <ChevronRight size={15} />
                      </button>
                      <button
                        className="saved-chat list-item"
                        onClick={() => nav("saved")}
                      >
                        <span className="saved-chat-avatar">
                          <Bookmark size={20} />
                        </span>
                        <span className="item-copy">
                          <strong>Избранное</strong>
                        </span>
                        <ChevronRight size={15} />
                      </button>
                    </div>
                    {chats.isLoading ? (
                      <LoadingRows label="Загружаем чаты…" count={5} />
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
                            onClick={() => selectChat(c)}
                          >
                            <span className="avatar-wrap">
                              <ChatAvatar chat={c} user={u} />
                              {"online" in u && u.online === true && (
                                <i className="presence-dot" />
                              )}
                            </span>
                            <span className="item-copy">
                              <strong>
                                <UserName user={u} />
                                {ownMember?.chatPinned && (
                                  <Pin
                                    className="chat-pin-indicator"
                                    size={12}
                                  />
                                )}
                              </strong>
                              <small>
                                {drafts[c.id]
                                  ? `Черновик: ${drafts[c.id]}`
                                  : typingChat === c.id
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
                                  {new Date(
                                    latest.createdAt,
                                  ).toLocaleTimeString("ru-RU", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
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
                            : chatFilter === "archive"
                              ? "Архив пуст"
                              : chatFilter === "unread"
                                ? "Всё прочитано"
                                : "Пока нет переписок"}
                        </strong>
                        <p>
                          {chatFilter === "all"
                            ? "Найдите человека по имени или @юзернейму."
                            : chatFilter === "archive"
                              ? "Здесь будут чаты, которые вы убрали в архив."
                              : "Новые сообщения появятся здесь."}
                        </p>
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
            </section>
          )}
          <footer className="sidebar-account">
            <button
              className="sidebar-profile"
              aria-label="Мой профиль"
              onClick={() => nav("profile")}
            >
              <Avatar user={user} />
              <span>
                <strong>
                  <UserName user={user} />
                </strong>
                <small>@{user.username}</small>
              </span>
            </button>
            {me.data.isAdmin && (
              <button
                className="icon-button"
                aria-label="Админ-панель"
                title="Админ-панель"
                aria-current={activeTab === "admin" ? "page" : undefined}
                onClick={() => nav("admin")}
              >
                <Shield size={18} aria-hidden="true" />
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Настройки"
              title="Настройки"
              onClick={() => nav("settings")}
            >
              <Settings size={18} aria-hidden="true" />
            </button>
          </footer>
        </aside>
        <AnimatePresence mode="wait">
          <motion.div
            id="main-content"
            tabIndex={-1}
            key={
              messenger && selected
                ? "conversation"
                : messenger && profile && !profilePanel
                  ? "profile" + profile.id
                  : activeTab
            }
            className={
              "screen " +
              (messenger
                ? selected
                  ? "conversation-screen" +
                    (detailsOpen && desktop ? " with-details" : "") +
                    (currentChat?.kind === "channel" ? " channel-thread" : "")
                  : profile && !profilePanel
                    ? "chat-profile-screen"
                    : "conversation-placeholder"
                : "content-screen")
            }
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {activeTab === "market" ? (
              <React.Suspense
                fallback={
                  <p role="status" className="page-loading">
                    Загрузка маркета…
                  </p>
                }
              >
                <Market
                  onBack={() => nav("chats")}
                  onWallet={() => nav("wallet")}
                />
              </React.Suspense>
            ) : showingWallet ? (
              <Wallet onBack={() => nav("chats")} />
            ) : activeTab === "saved" ? (
              <SavedMessages
                openChat={(id) => {
                  const chat = chats.data?.chats.find((c) => c.id === id);
                  if (chat) {
                    nav("chats");
                    setSelected(chat);
                  } else setError("Переписка недоступна");
                }}
              />
            ) : messenger && selected && other ? (
              <>
                <div className="conversation-thread">
                  <header className="chat-header">
                    <button
                      className="icon-button thread-back"
                      onClick={() => setSelected(null)}
                      aria-label="Назад"
                    >
                      <ArrowLeft size={20} />
                    </button>
                    <button
                      className="person-button"
                      onClick={() =>
                        currentChat?.kind === "direct"
                          ? showProfile(other)
                          : setCommunityInfo(true)
                      }
                    >
                      {currentChat && (
                        <ChatAvatar chat={currentChat} user={other} />
                      )}
                      <span>
                        <strong>
                          <UserName user={other} />
                        </strong>
                        <small>
                          {currentChat?.kind === "direct"
                            ? `@${other.username}${other.online === true ? " · в сети" : ""}`
                            : `${currentChat?.kind === "channel" ? "Канал" : "Группа"} · ${currentChat?.members.length || 0} участников`}
                        </small>
                      </span>
                    </button>
                    <div className="thread-actions">
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
                        {showMessageSearch ? (
                          <X size={20} />
                        ) : (
                          <Search size={20} />
                        )}
                      </button>
                      <button
                        ref={detailsToggle}
                        className="icon-button thread-details-toggle"
                        aria-label="Детали чата"
                        aria-expanded={detailsOpen && desktop}
                        aria-controls="conversation-details"
                        onClick={() => setDetailsOpen((open) => !open)}
                      >
                        <PanelRight size={19} aria-hidden="true" />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Действия с чатом"
                        onClick={() => setChatTools(true)}
                      >
                        <MoreHorizontal size={20} />
                      </button>
                    </div>
                  </header>
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
                      <LoadingRows label="Загрузка сообщений…" count={4} />
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
                                )?.user || "Участник"
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
                          latest={
                            index === allMessages.length - 1 && !messageSearch
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
                  currentChat.members.find((m) => m.user.id === user.id)
                    ?.role === "member" ? (
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
                            aria-label="Прикрепить изображение или PDF"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            disabled={uploadFile.isPending}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) uploadFile.mutate(file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        <textarea
                          ref={composerField}
                          rows={1}
                          value={text}
                          onKeyDown={(event) => {
                            if (
                              event.key === "Enter" &&
                              !event.shiftKey &&
                              !event.nativeEvent.isComposing
                            ) {
                              event.preventDefault();
                              event.currentTarget.form?.requestSubmit();
                            }
                          }}
                          maxLength={4000}
                          onChange={(e) => {
                            setText(e.target.value);
                            if (e.target.value.trim())
                              socketRef.current?.emit("typing", {
                                chatId: selected.id,
                              });
                          }}
                          name="message"
                          autoComplete="off"
                          placeholder="Написать сообщение…"
                          aria-label="Сообщение"
                        />
                        <div
                          className="emoji-control"
                          onBlur={(event) => {
                            if (
                              !event.currentTarget.contains(event.relatedTarget)
                            )
                              setEmojiOpen(false);
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Escape" || !emojiOpen) return;
                            event.stopPropagation();
                            setEmojiOpen(false);
                            emojiButton.current?.focus();
                          }}
                        >
                          <button
                            ref={emojiButton}
                            type="button"
                            className="icon-button"
                            aria-label="Эмодзи"
                            aria-expanded={emojiOpen}
                            aria-controls="composer-emoji"
                            onClick={() => setEmojiOpen((value) => !value)}
                          >
                            <Smile size={19} aria-hidden="true" />
                          </button>
                          {emojiOpen && (
                            <div
                              className="emoji-picker"
                              id="composer-emoji"
                              role="group"
                              aria-label="Выбрать эмодзи"
                            >
                              {[
                                ["😊", "Улыбка"],
                                ["❤️", "Сердце"],
                                ["👍", "Нравится"],
                                ["😂", "Смеюсь"],
                                ["🔥", "Огонь"],
                                ["🎉", "Праздник"],
                                ["✨", "Блеск"],
                                ["👋", "Привет"],
                              ].map(([emoji, label]) => (
                                <button
                                  type="button"
                                  key={emoji}
                                  aria-label={label}
                                  onClick={() => {
                                    const field = composerField.current;
                                    if (!field) return;
                                    const start = field.selectionStart;
                                    const next =
                                      text.slice(0, start) +
                                      emoji +
                                      text.slice(field.selectionEnd);
                                    if (next.length > 4000) return;
                                    setText(next);
                                    setEmojiOpen(false);
                                    field.focus();
                                    requestAnimationFrame(() =>
                                      field.setSelectionRange(
                                        start + emoji.length,
                                        start + emoji.length,
                                      ),
                                    );
                                  }}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          type="submit"
                          disabled={!text.trim() || submitMessage.isPending}
                          aria-label="Отправить"
                        >
                          <Send size={19} />
                        </button>
                      </form>
                    </div>
                  )}
                </div>
                {detailsOpen && desktop && (
                  <ConversationDetails
                    key={selected.id}
                    onClose={() => {
                      setDetailsOpen(false);
                      detailsToggle.current?.focus();
                    }}
                    chat={currentChat ?? selected}
                    user={other}
                    messages={allMessages}
                    searching={!!messageSearch}
                    onOpen={() =>
                      currentChat?.kind === "direct"
                        ? showProfile(other)
                        : setCommunityInfo(true)
                    }
                  />
                )}
              </>
            ) : messenger && profile && !profilePanel ? (
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
            ) : messenger ? (
              <section className="chat-entry">
                <header className="chat-entry-heading">
                  <h2>
                    {chatFilter === "archive"
                      ? "Архив"
                      : chatFilter === "unread"
                        ? "Непрочитанные"
                        : "Переписки"}
                  </h2>
                  <button
                    className="outline"
                    onClick={() =>
                      document.getElementById("people-search")?.focus()
                    }
                  >
                    <SquarePen size={16} aria-hidden="true" /> Новое сообщение
                  </button>
                </header>
                {chats.isLoading ? (
                  <LoadingRows label="Загружаем переписки…" count={4} />
                ) : visibleChats.length ? (
                  <div className="chat-entry-list">
                    {visibleChats.slice(0, 7).map((chat) => {
                      const person =
                        chat.kind === "direct"
                          ? chat.members.find(
                              (member) => member.user.id !== user.id,
                            )?.user
                          : null;
                      const latest = chat.messages?.[0];
                      return (
                        <button
                          key={chat.id}
                          className="chat-entry-row"
                          onClick={() => selectChat(chat)}
                        >
                          {person ? (
                            <ChatAvatar chat={chat} user={person} />
                          ) : (
                            <span className="avatar">
                              <Hash size={18} aria-hidden="true" />
                            </span>
                          )}
                          <span className="item-copy">
                            <strong>
                              {person ? <UserName user={person} /> : chat.title}
                            </strong>
                            <small>
                              {latest?.attachment
                                ? latest.attachment.name
                                : latest?.text || "Нет сообщений"}
                            </small>
                          </span>
                          {isUnread(chat) && (
                            <span
                              className="unread-dot"
                              aria-label="Есть непрочитанные сообщения"
                            />
                          )}
                          <ChevronRight size={16} aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="muted">
                    {chatFilter === "archive"
                      ? "Нет архивных чатов"
                      : chatFilter === "unread"
                        ? "Все сообщения прочитаны"
                        : "Переписки появятся после первого сообщения."}
                  </p>
                )}
              </section>
            ) : activeTab === "profile" ? (
              ownProfile
            ) : activeTab === "feed" ? (
              <Feed me={user} onOpen={showProfile} onNavigate={nav} />
            ) : activeTab === "admin" && me.data.isAdmin ? (
              <Admin owner={user.id === 1} />
            ) : (
              settingsContent
            )}
          </motion.div>
        </AnimatePresence>
        {error && (
          <div className="toast" role="alert">
            <span>{error}</span>
            <button aria-label="Скрыть ошибку" onClick={() => setError("")}>
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        )}
      </main>
      <div className="mobile-nav" inert={!!profilePanel}>
        <Nav tab={tab} nav={nav} mobile />
      </div>
      {accountPanel && (
        <Dialog
          key={tab}
          title={tab === "profile" ? "Мой профиль" : "Настройки"}
          className={
            tab === "profile"
              ? "profile-dialog workspace-dialog"
              : "settings-dialog workspace-dialog"
          }
          showTitle={false}
          onClose={() => {
            nav(workspaceTab, true);
            requestAnimationFrame(() => workspaceTrigger.current?.focus());
          }}
        >
          {tab === "profile" ? ownProfile : settingsContent}
        </Dialog>
      )}
      {profilePanel && !accountPanel && (
        <Dialog
          title={profilePanel.name}
          className="profile-dialog workspace-dialog"
          showTitle={false}
          onClose={closeProfile}
        >
          <Profile
            user={profilePanel}
            own={profilePanel.id === user.id}
            isAdmin={profilePanel.id === user.id && me.data.isAdmin}
            onAdmin={() => nav("admin")}
            onMessage={() =>
              selected ? closeProfile() : openChat.mutate(profilePanel.id)
            }
            onEdit={() => setEditing(true)}
          />
        </Dialog>
      )}
      {forwardMessage && (
        <Dialog
          title="Выберите чат"
          className="edit-modal"
          onClose={() => setForwardMessage(null)}
        >
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
                    <strong>
                      <UserName user={target} />
                    </strong>
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
        </Dialog>
      )}
      {chatTools && currentChat && other && (
        <ChatTools
          chatId={currentChat.id}
          title={other.name}
          pinned={!!ownPreferences(currentChat)?.chatPinned}
          archived={!!ownPreferences(currentChat)?.archived}
          onClose={() => setChatTools(false)}
          onArchived={() => {
            setSelected(null);
            setChatFilter(
              ownPreferences(currentChat)?.archived ? "all" : "archive",
            );
          }}
        />
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
        <Dialog
          title="Редактировать"
          className="edit-modal"
          onClose={() => setEditing(false)}
        >
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
              setProfile((current) => (current?.id === u.id ? u : current));
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
              setProfile((current) => (current?.id === u.id ? u : current));
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
              setProfile((current) => (current?.id === u.id ? u : current));
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
        </Dialog>
      )}
    </div>
  );
}
function ConversationDetails({
  chat,
  user,
  messages,
  searching,
  onOpen,
  onClose,
}: {
  chat: Chat;
  user: User;
  messages: Message[];
  searching: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<"files" | "gifts">("files");
  const files = messages
    .filter((message) => message.attachment)
    .slice(-6)
    .reverse();
  return (
    <aside
      id="conversation-details"
      className="thread-details"
      aria-label="Сведения о чате"
      onKeyDown={(event) => {
        if (
          event.key !== "Escape" ||
          !(event.target instanceof Node) ||
          !event.currentTarget.contains(event.target)
        )
          return;
        event.stopPropagation();
        onClose();
      }}
    >
      <div className="thread-panel-heading">
        <h2>О чате</h2>
        <button
          className="icon-button"
          aria-label="Закрыть сведения"
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <button className="thread-person" onClick={onOpen}>
        <ChatAvatar chat={chat} user={user} />
        <span>
          <strong>
            <UserName user={user} />
          </strong>
          <small>
            {chat.kind === "direct"
              ? "@" + user.username
              : chat.members.length + " участников"}
          </small>
        </span>
        <ChevronRight size={17} aria-hidden="true" />
      </button>
      {chat.kind !== "direct" && chat.description && (
        <p className="thread-description">{chat.description}</p>
      )}
      {chat.kind === "direct" && (
        <div className="thread-panel-sections" aria-label="Содержимое чата">
          <button
            aria-pressed={view === "files"}
            onClick={() => setView("files")}
          >
            Файлы
          </button>
          <button
            aria-pressed={view === "gifts"}
            onClick={() => setView("gifts")}
          >
            Подарки
          </button>
        </div>
      )}
      {view === "gifts" ? (
        <Collections userId={user.id} own={false} section="gifts" />
      ) : (
        <section className="thread-files">
          <h2>
            {searching ? "Файлы в результатах поиска" : "Последние файлы"}
          </h2>
          {files.length ? (
            <ul>
              {files.map(
                ({ attachment, id }) =>
                  attachment && (
                    <li key={id}>
                      <a
                        href={`/api/files/${attachment.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span className="thread-file-icon">
                          <FileText size={17} aria-hidden="true" />
                        </span>
                        <span>
                          <strong>{attachment.name}</strong>
                          <small>
                            {Math.max(1, Math.round(attachment.size / 1024))} КБ
                          </small>
                        </span>
                      </a>
                    </li>
                  ),
              )}
            </ul>
          ) : (
            <p>{searching ? "Файлы не найдены" : "Вложения появятся здесь"}</p>
          )}
        </section>
      )}
    </aside>
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
        ["market", "Маркет", Store],
        ["profile", "Профиль", CircleUserRound],
        ["settings", "Настройки", Settings],
      ]
    : [
        ["chats", "Чаты", MessagesSquare],
        ["feed", "Лента", AlignJustify],
        ["market", "Маркет", Store],
        ["wallet", "Кошелёк", WalletIcon],
        ["saved", "Избранное", Bookmark],
      ];
  return (
    <nav
      id={mobile ? undefined : "desktop-sections"}
      aria-label={mobile ? "Разделы" : "Разделы Nimb"}
    >
      {items.map(([key, label, Icon]) => (
        <button
          key={key as string}
          className={
            tab === key || (mobile && tab === "wallet" && key === "market")
              ? "active"
              : ""
          }
          aria-current={
            tab === key || (mobile && tab === "wallet" && key === "market")
              ? "page"
              : undefined
          }
          aria-label={label as string}
          title={label as string}
          onClick={() => nav(key as string)}
        >
          <Icon size={21} aria-hidden="true" />
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
  const detailsHeading = useRef<HTMLHeadingElement>(null);
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
    <div
      className={
        "profile accent-" +
        (user.plus || user.id === 1 ? user.profileAccent || "gold" : "gold") +
        " " +
        (own ? "own-profile" : "other-profile")
      }
    >
      <PageHeading
        title={own ? "Мой профиль" : "Профиль"}
        action={
          <div className="profile-heading-tools">
            <button
              className="icon-button"
              aria-label="Поделиться"
              title="Поделиться"
              onClick={share}
            >
              <Share2 size={16} aria-hidden="true" />
            </button>
            {own && (
              <button
                className="icon-button"
                aria-label="Редактировать"
                title="Редактировать"
                onClick={onEdit}
              >
                <Pencil size={17} aria-hidden="true" />
              </button>
            )}
          </div>
        }
      />
      <div className="profile-layout">
        <aside className="profile-summary">
          <section className="profile-identity-card">
            <div
              className={
                "profile-cover " +
                (user.hasBanner ? "" : "profile-cover-default")
              }
              style={
                user.hasBanner
                  ? {
                      backgroundImage: `url(/api/users/${user.id}/media/banner?v=${user.mediaVersion || 0})`,
                    }
                  : undefined
              }
            />
            <div className="profile-overview">
              <div className="profile-hero">
                <div className="profile-identity">
                  <Avatar user={user} size="large" />
                  <div className="profile-title">
                    <h2>
                      <UserName user={user} />
                    </h2>
                    <span>@{user.username}</span>
                    {user.online !== undefined && user.online !== null && (
                      <small className="profile-status">
                        {user.online ? "В сети" : "Не в сети"}
                      </small>
                    )}
                    <button
                      className="profile-contact-link"
                      onClick={() => {
                        detailsHeading.current?.focus({ preventScroll: true });
                        detailsHeading.current?.scrollIntoView({
                          block: "start",
                        });
                      }}
                    >
                      Контакты <ArrowRight size={13} aria-hidden="true" />
                    </button>
                  </div>
                  {!own && (
                    <div className="profile-quick-actions">
                      <button className="primary" onClick={onMessage}>
                        <MessageCircle size={17} aria-hidden="true" /> Написать
                      </button>
                      <button
                        className="outline"
                        aria-label="Подарить подарок"
                        onClick={() => {
                          setProfileTab("gifts");
                          setGiftOpen(true);
                        }}
                      >
                        <Gift size={17} aria-hidden="true" /> Подарок
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Другие действия"
                        aria-expanded={actionsOpen}
                        onClick={() => setActionsOpen(!actionsOpen)}
                      >
                        <MoreHorizontal size={19} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
                {user.bio && <p className="profile-bio">{user.bio}</p>}
                {user.bioPrivate && !own && (
                  <p className="muted profile-bio">
                    Описание скрыто владельцем.
                  </p>
                )}
              </div>
            </div>
          </section>
          {shareNotice && (
            <p className="notice" role="status">
              {shareNotice}
            </p>
          )}
          {!own && actionsOpen && <ProfileActions user={user} />}
        </aside>
        <div className="profile-about">
          <Collections userId={user.id} own={own} section="badges" />
          {user.hasMusic && <ProfileMusic user={user} own={own} />}
        </div>
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
        <div className="profile-details">
          <h2 ref={detailsHeading} tabIndex={-1}>
            Контакты
          </h2>
          <ProfileIdentifiers user={user} />
          <ProfileLinks user={user} />
          <div className="profile-meta">
            <span>
              <Hash size={15} /> ID {user.id}
            </span>
            <span>
              <CalendarDays size={15} /> С {date(user.createdAt)}
            </span>
          </div>
        </div>
        {own && !user.hasMusic && (
          <div className="profile-about profile-music-empty">
            <ProfileMusic user={user} own />
          </div>
        )}
        {own && isAdmin && (
          <button className="profile-admin-link" onClick={onAdmin}>
            <Shield size={20} />
            <span>
              <strong>Админ-панель</strong>
            </span>
            <ArrowUpRight size={18} />
          </button>
        )}
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
