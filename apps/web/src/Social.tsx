import { Brand, PageHeading, useConfirmation } from "./UI";
import { useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Heart,
  MessageCircle,
  Trash2,
  Send,
  ImagePlus,
  X,
  Search,
  ArrowUpRight,
  Wallet,
  Hash,
  SquarePen,
} from "lucide-react";
type User = {
  id: number;
  username: string;
  name: string;
  bio: string;
  createdAt: string;
  hasAvatar?: boolean;
  mediaVersion?: number;
};
type Post = {
  id: number;
  author: User;
  authorId: number;
  text: string;
  createdAt: string;
  liked: boolean;
  image?: { id: number } | null;
  _count: { likes: number; comments: number };
};
type Comment = { id: number; text: string; author: User; createdAt: string };
async function request<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch("/api" + url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Ошибка запроса");
  return d;
}
function Name({ user, onOpen }: { user: User; onOpen: (u: User) => void }) {
  return (
    <button className="social-author" onClick={() => onOpen(user)}>
      <span className="social-avatar">
        {user.hasAvatar ? (
          <img
            src={`/api/users/${user.id}/media/avatar?v=${user.mediaVersion || 0}`}
            alt=""
          />
        ) : (
          user.name.slice(0, 1).toUpperCase()
        )}
      </span>
      <span>
        <strong>{user.name}</strong>
        <small>@{user.username}</small>
      </span>
    </button>
  );
}
function Comments({ post, onOpen }: { post: Post; onOpen: (u: User) => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const q = useQuery({
    queryKey: ["comments", post.id],
    queryFn: () =>
      request<{ comments: Comment[] }>(`/posts/${post.id}/comments`),
  });
  const add = useMutation({
    mutationFn: () => request(`/posts/${post.id}/comments`, "POST", { text }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["comments", post.id] });
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
  });
  return (
    <div className="comments">
      {q.isLoading && <p className="muted">Загрузка…</p>}
      {q.data?.comments.map((c) => (
        <div className="comment" key={c.id}>
          <Name user={c.author} onOpen={onOpen} />
          <p>{c.text}</p>
        </div>
      ))}
      {q.isError && <p className="error">{q.error.message}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) add.mutate();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder="Написать комментарий"
          aria-label="Комментарий"
        />
        <button
          disabled={!text.trim() || add.isPending}
          aria-label="Отправить комментарий"
        >
          <Send size={17} />
        </button>
      </form>
      {add.isError && <p className="error">{add.error.message}</p>}
    </div>
  );
}
export function Feed({
  me,
  onOpen,
  onNavigate,
}: {
  me: User;
  onOpen: (u: User) => void;
  onNavigate: (tab: string) => void;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const { ask, dialog } = useConfirmation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"all" | "following" | "tags">("all");
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [comments, setComments] = useState<number | null>(null);
  const more = useRef<HTMLDivElement>(null);
  const query = useInfiniteQuery({
    queryKey: ["posts", tab, search],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      request<{ posts: Post[]; nextCursor: number | null }>(
        `/posts?tab=${tab === "following" ? "following" : "all"}&q=${encodeURIComponent(tab === "tags" && search && !search.startsWith("#") ? "#" + search : search)}${pageParam ? "&cursor=" + pageParam : ""}`,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  useEffect(() => {
    const node = more.current;
    if (!node || !query.hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !query.isFetchingNextPage)
        query.fetchNextPage();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);
  const publish = useMutation({
    mutationFn: async () => {
      if (!image) return request("/posts", "POST", { text });
      const body = new FormData();
      body.append("text", text);
      body.append("file", image);
      const res = await fetch("/api/posts/image", {
        method: "POST",
        credentials: "include",
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось опубликовать");
      return data;
    },
    onSuccess: () => {
      setText("");
      setImage(null);
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
  });
  const action = useMutation({
    mutationFn: ({ url, method }: { url: string; method: string }) =>
      request(url, method),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["posts"] }),
  });
  const posts = query.data?.pages.flatMap((p) => p.posts) || [];
  return (
    <>
      <PageHeading
        eyebrow="СООБЩЕСТВО"
        title="Лента"
        description="Мысли, моменты и люди рядом."
        action={
          <button
            className="outline compact-button"
            onClick={() => document.getElementById("post-text")?.focus()}
          >
            <SquarePen size={16} />
            <span>Написать</span>
          </button>
        }
      />
      <div className="feed-layout">
        <div className="feed-main">
          <div className="feed-tabs">
            {(
              [
                ["all", "Все публикации"],
                ["following", "Подписки"],
                ["tags", "Теги"],
              ] as const
            ).map(([key, label]) => (
              <button
                className={tab === key ? "active" : ""}
                key={key}
                onClick={() => {
                  setTab(key);
                  setSearch("");
                  if (key === "tags") setShowSearch(true);
                }}
              >
                {label}
              </button>
            ))}
            <button
              className="feed-search-toggle"
              onClick={() => setShowSearch(!showSearch)}
              aria-label="Поиск публикаций"
            >
              <Search size={17} />
            </button>
          </div>
          {(showSearch || tab === "tags") && (
            <div className="search-box feed-search">
              <Search size={18} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  tab === "tags"
                    ? "Найти тег, например музыка"
                    : "Поиск по публикациям"
                }
                aria-label="Поиск по ленте"
              />
            </div>
          )}
          <form
            className="post-compose"
            onSubmit={(e) => {
              e.preventDefault();
              if ((text.trim() || image) && !publish.isPending)
                publish.mutate();
            }}
          >
            <div className="post-compose-head">
              <span className="social-avatar">
                {me.hasAvatar ? (
                  <img
                    src={`/api/users/${me.id}/media/avatar?v=${me.mediaVersion || 0}`}
                    alt=""
                  />
                ) : (
                  me.name.slice(0, 1).toUpperCase()
                )}
              </span>
              <div className="post-compose-identity">
                <strong>{me.name}</strong>
                <small>@{me.username}</small>
              </div>
            </div>
            <textarea
              id="post-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={4000}
              rows={3}
              placeholder="Что нового?"
              aria-label="Текст публикации"
            />
            <div className="post-compose-bottom">
              <div className="post-image-picker">
                <label>
                  <ImagePlus size={17} /> Фото
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      setImage(e.target.files?.[0] || null);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                {image && (
                  <button type="button" onClick={() => setImage(null)}>
                    {image.name} <X size={14} />
                  </button>
                )}
              </div>
              <span>{text.length} / 4000</span>
              <button
                className="primary"
                disabled={(!text.trim() && !image) || publish.isPending}
              >
                Опубликовать <Send size={15} />
              </button>
            </div>
            {publish.isError && (
              <p className="error">{publish.error.message}</p>
            )}
          </form>
          {query.isLoading && <p className="muted">Загрузка публикаций…</p>}
          {query.isError && <p className="error">{query.error.message}</p>}
          {!query.isLoading && !query.isError && !posts.length && (
            <div className="feed-empty">
              <MessageCircle className="feed-empty-icon" size={25} />
              <strong>
                {tab === "following"
                  ? "Здесь появятся публикации подписок"
                  : tab === "tags"
                    ? "Пока ничего не найдено"
                    : "Пока нет публикаций"}
              </strong>
              <p>
                {tab === "following"
                  ? "Подпишитесь на интересных людей, чтобы читать их здесь."
                  : tab === "tags"
                    ? "Попробуйте поискать другой тег."
                    : "Опубликуйте первую запись или найдите друзей, чтобы читать их новости."}
              </p>
            </div>
          )}
          {posts.map((post) => (
            <article className="post" key={post.id}>
              <div className="post-head">
                <Name user={post.author} onOpen={onOpen} />
                <time>
                  {new Date(post.createdAt).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </time>
                {post.authorId === me.id && (
                  <button
                    className="post-delete"
                    title="Удалить публикацию"
                    aria-label="Удалить публикацию"
                    onClick={async () => {
                      if (
                        await ask({
                          title: "Удалить публикацию?",
                          description:
                            "Публикация и комментарии к ней будут удалены. Отменить это действие нельзя.",
                          label: "Удалить",
                          danger: true,
                        })
                      )
                        action.mutate({
                          url: `/posts/${post.id}`,
                          method: "DELETE",
                        });
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <p className="post-text">{post.text}</p>
              {post.image && (
                <img
                  className="post-image"
                  src={`/api/post-images/${post.image.id}`}
                  alt="Изображение публикации"
                />
              )}
              <div className="post-actions">
                <button
                  className={post.liked ? "liked" : ""}
                  onClick={() =>
                    action.mutate({
                      url: `/posts/${post.id}/like`,
                      method: post.liked ? "DELETE" : "POST",
                    })
                  }
                >
                  <Heart
                    size={18}
                    fill={post.liked ? "currentColor" : "none"}
                  />{" "}
                  {post._count.likes}
                </button>
                <button
                  onClick={() =>
                    setComments(comments === post.id ? null : post.id)
                  }
                >
                  <MessageCircle size={18} /> {post._count.comments}
                </button>
              </div>
              {comments === post.id && <Comments post={post} onOpen={onOpen} />}
            </article>
          ))}
          {action.isError && <p className="error">{action.error.message}</p>}
          <div ref={more}>
            {query.isFetchingNextPage && <p className="muted">Загрузка…</p>}
          </div>
        </div>
        <aside className="feed-aside">
          <section className="context-card">
            <button onClick={() => onNavigate("profile")}>
              <div className="context-identity">
                <span className="social-avatar">
                  {me.hasAvatar ? (
                    <img
                      src={`/api/users/${me.id}/media/avatar?v=${me.mediaVersion || 0}`}
                      alt=""
                    />
                  ) : (
                    me.name.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span>
                  <strong>{me.name}</strong>
                  <small>@{me.username}</small>
                </span>
              </div>
              <div className="context-row">
                Мой профиль <ArrowUpRight size={15} />
              </div>
            </button>
          </section>
          <section className="context-card">
            <div className="context-wallet-icon">
              <Wallet size={18} />
            </div>
            <h2>Имя, которое запомнят</h2>
            <p>Выберите числовой юзернейм и добавьте его в свою коллекцию.</p>
            <button
              className="text-action"
              onClick={() => onNavigate("wallet")}
            >
              Открыть кошелёк <ArrowUpRight size={14} />
            </button>
          </section>
          <section className="context-card">
            <h2>Найдите своих</h2>
            <p>Ищите людей по @юзернейму и подписывайтесь на их публикации.</p>
            <button className="text-action" onClick={() => onNavigate("chats")}>
              Перейти к общению <ArrowUpRight size={14} />
            </button>
          </section>
          <div className="context-footer">
            <Brand markOnly /> nimb · место для своих
          </div>
        </aside>
      </div>
      {dialog}
    </>
  );
}
export function ProfileActions({ user }: { user: User }) {
  const qc = useQueryClient();
  const follows = useQuery({
    queryKey: ["follows"],
    queryFn: () => request<{ ids: number[] }>("/follows"),
  });
  const blocks = useQuery({
    queryKey: ["blocks"],
    queryFn: () => request<{ blocks: { blockedId: number }[] }>("/blocks"),
  });
  const following = follows.data?.ids.includes(user.id);
  const isBlocked = blocks.data?.blocks.some((b) => b.blockedId === user.id);
  const action = useMutation({
    mutationFn: ({
      path,
      method,
      body,
    }: {
      path: string;
      method: string;
      body?: unknown;
    }) => request(path, method, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["follows"] });
      qc.invalidateQueries({ queryKey: ["blocks"] });
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
  });
  return (
    <div className="profile-actions">
      <button
        className="outline"
        disabled={action.isPending || !!isBlocked}
        onClick={() =>
          action.mutate({
            path: `/users/${user.id}/follow`,
            method: following ? "DELETE" : "POST",
          })
        }
      >
        {following ? "Отписаться" : "Подписаться"}
      </button>
      <button
        className="outline"
        disabled={action.isPending}
        onClick={() => {
          if (
            isBlocked ||
            confirm(
              "Заблокировать пользователя? Вы больше не сможете обмениваться новыми сообщениями.",
            )
          )
            action.mutate({
              path: `/users/${user.id}/block`,
              method: isBlocked ? "DELETE" : "POST",
            });
        }}
      >
        {isBlocked ? "Разблокировать" : "Заблокировать"}
      </button>
      <button
        className="outline"
        disabled={action.isPending}
        onClick={() => {
          const reason = prompt(
            "Опишите причину жалобы (не менее 5 символов):",
          );
          if (reason?.trim())
            action.mutate({
              path: `/users/${user.id}/report`,
              method: "POST",
              body: { reason },
            });
        }}
      >
        Пожаловаться
      </button>
      {action.isSuccess && <span className="muted">Действие выполнено</span>}
      {action.isError && <span className="error">{action.error.message}</span>}
    </div>
  );
}

export function ProfilePosts({ user }: { user: User }) {
  const posts = useQuery({
    queryKey: ["posts", "profile", user.id],
    queryFn: () => request<{ posts: Post[] }>(`/posts?authorId=${user.id}`),
  });
  return (
    <section className="profile-posts">
      <div className="list-top">
        <span>ПУБЛИКАЦИИ</span>
        <span>{posts.data?.posts.length || 0}</span>
      </div>
      {posts.isLoading && <p className="muted">Загрузка…</p>}
      {posts.isError && <p className="error">{posts.error.message}</p>}
      {posts.data && !posts.data.posts.length && (
        <p className="muted">Публикаций пока нет.</p>
      )}
      {posts.data?.posts.map((post) => (
        <article className="post" key={post.id}>
          <time className="muted">
            {new Date(post.createdAt).toLocaleDateString("ru-RU")}
          </time>
          <p className="post-text">{post.text}</p>
          {post.image && (
            <img
              className="post-image"
              src={`/api/post-images/${post.image.id}`}
              alt="Изображение публикации"
            />
          )}
          <div className="muted">
            ♡ {post._count.likes} · Комментарии {post._count.comments}
          </div>
        </article>
      ))}
    </section>
  );
}
