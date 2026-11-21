import { useState, type MouseEvent } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowLeft, Check, Search, Wallet, X } from "lucide-react";
import { Dialog } from "./UI";
import { GiftArtwork } from "./GiftArtwork";
import { GiftCard, GiftDetails, type CollectibleGift } from "./CollectibleGift";

type Template = {
  id: string;
  name: string;
  price: number;
  issued: number;
  description: string;
  color: string;
};
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch("/api" + path, {
    credentials: "include",
    method: body ? "POST" : "GET",
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Не удалось загрузить маркет");
  return data;
}
export function Market({
  onBack,
  onWallet,
}: {
  onBack: () => void;
  onWallet: () => void;
}) {
  const qc = useQueryClient();
  const [tab, updateTab] = useState<"shop" | "collection">(() =>
    new URLSearchParams(location.search).get("market-view") === "collection"
      ? "collection"
      : "shop",
  );
  const [search, updateSearch] = useState(
    () =>
      new URLSearchParams(location.search)
        .get("market-search")
        ?.slice(0, 100) || "",
  );
  function setTab(next: "shop" | "collection") {
    updateTab(next);
    const url = new URL(location.href);
    url.searchParams.set("market-view", next);
    history.replaceState(null, "", url);
  }
  function setSearch(next: string) {
    updateSearch(next);
    const url = new URL(location.href);
    if (next) url.searchParams.set("market-search", next);
    else url.searchParams.delete("market-search");
    history.replaceState(null, "", url);
  }
  function walletLink(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
      onWallet();
    }
  }
  const [selected, setSelected] = useState<{
    item: Template;
    requestId: string;
  } | null>(null);
  const [revealed, setRevealed] = useState<CollectibleGift | null>(null);
  const [notice, setNotice] = useState("");
  const wallet = useQuery({
    queryKey: ["wallet"],
    queryFn: () => request<{ balance: number }>("/wallet"),
  });
  const catalog = useQuery({
    queryKey: ["market-catalog"],
    queryFn: () => request<{ templates: Template[] }>("/market/catalog"),
    enabled: tab === "shop",
  });
  const collection = useInfiniteQuery({
    queryKey: ["market-collection"],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) =>
      request<{ gifts: CollectibleGift[]; nextCursor: number | null }>(
        "/market/collection" + (pageParam ? `?cursor=${pageParam}` : ""),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: tab === "collection",
  });
  const buy = useMutation({
    mutationFn: (purchase: { item: Template; requestId: string }) =>
      request<{ gift: CollectibleGift; balance: number }>("/market/buy", {
        template: purchase.item.id,
        requestId: purchase.requestId,
      }),
    onSuccess: async (data) => {
      qc.setQueryData(
        ["wallet"],
        (old: Record<string, unknown> | undefined) => ({
          ...old,
          balance: data.balance,
        }),
      );
      setSelected(null);
      setRevealed(data.gift);
      setNotice("Подарок добавлен в вашу коллекцию");
      await Promise.all(
        ["wallet", "gifts", "market-catalog", "market-collection", "admin"].map(
          (key) => qc.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  const pin = useMutation({
    mutationFn: async (gift: CollectibleGift) => {
      const response = await fetch(`/api/gifts/${gift.id}/pin`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !gift.pinned }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Не удалось закрепить подарок");
    },
    onSuccess: async (_data, gift) => {
      setRevealed({ ...gift, pinned: !gift.pinned });
      await Promise.all(
        ["gifts", "market-collection"].map((key) =>
          qc.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  const templates = (catalog.data?.templates || []).filter((item) =>
    item.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const owned = (
    collection.data?.pages.flatMap((page) => page.gifts) || []
  ).filter((item) =>
    `${item.name} ${item.serialNumber || item.id}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  return (
    <div className="market-screen">
      <header className="market-header">
        <div>
          <button
            className="market-back"
            aria-label="Назад из маркета"
            title="К чатам"
            onClick={onBack}
          >
            <ArrowLeft aria-hidden="true" size={18} />
          </button>
          <h1>Маркет</h1>
        </div>
        <a
          className="market-balance"
          href="?tab=wallet"
          onClick={walletLink}
          aria-label="Открыть кошелёк"
        >
          <Wallet aria-hidden="true" size={17} />
          <span>
            {wallet.isLoading
              ? "…"
              : wallet.isError
                ? "—"
                : (wallet.data?.balance || 0).toLocaleString("ru-RU")}
          </span>
          <small>N</small>
        </a>
      </header>
      <div className="market-content">
        <div
          className="market-tabs"
          role="tablist"
          aria-label="Разделы маркета"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? "shop"
                : event.key === "End"
                  ? "collection"
                  : tab === "shop"
                    ? "collection"
                    : "shop";
            setTab(next);
            document.getElementById("market-tab-" + next)?.focus();
          }}
        >
          <button
            role="tab"
            id="market-tab-shop"
            aria-controls="market-panel"
            tabIndex={tab === "shop" ? 0 : -1}
            aria-selected={tab === "shop"}
            onClick={() => setTab("shop")}
          >
            Подарки
          </button>
          <button
            role="tab"
            id="market-tab-collection"
            aria-controls="market-panel"
            tabIndex={tab === "collection" ? 0 : -1}
            aria-selected={tab === "collection"}
            onClick={() => setTab("collection")}
          >
            Моя коллекция
          </button>
        </div>
        <div className="market-section-head">
          <h2>{tab === "shop" ? "Магазин" : "Коллекционные подарки"}</h2>
          <div className="market-search" role="search">
            <Search aria-hidden="true" size={16} />
            <input
              aria-label="Поиск подарков"
              name="gift-search"
              type="search"
              inputMode="search"
              autoComplete="off"
              spellCheck={false}
              maxLength={100}
              placeholder="Поиск…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                aria-label="Очистить поиск подарков"
                onClick={() => setSearch("")}
              >
                <X aria-hidden="true" size={14} />
              </button>
            )}
          </div>
        </div>
        {notice && (
          <p className="market-notice" role="status">
            <Check aria-hidden="true" size={14} />
            {notice}
          </p>
        )}
        <div
          id="market-panel"
          role="tabpanel"
          aria-labelledby={"market-tab-" + tab}
        >
          {tab === "shop" ? (
            <>
              {catalog.isLoading && (
                <p className="market-empty" role="status">
                  Загрузка подарков…
                </p>
              )}
              {catalog.isError && (
                <div className="error" role="alert">
                  <p>{catalog.error.message}</p>
                  <button
                    className="text-action"
                    onClick={() => catalog.refetch()}
                  >
                    Повторить
                  </button>
                </div>
              )}
              <div className="market-grid">
                {templates.map((item, index) => (
                  <button
                    key={item.id}
                    className="market-item"
                    aria-label={`${item.name}, ${item.price} нимбиков`}
                    onClick={() => {
                      buy.reset();
                      setSelected({ item, requestId: crypto.randomUUID() });
                    }}
                  >
                    <div className="market-item-art">
                      <GiftArtwork template={item.id} lazy={index > 3} />
                    </div>
                    <div className="market-item-meta">
                      <strong>{item.name}</strong>
                      <span className="market-price">
                        {item.price.toLocaleString("ru-RU")}
                        <span>N</span>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              {!catalog.isLoading && !catalog.isError && !templates.length && (
                <p className="market-empty" role="status">
                  Ничего не найдено.
                </p>
              )}
            </>
          ) : (
            <>
              {collection.isLoading && (
                <p className="market-empty" role="status">
                  Загрузка коллекции…
                </p>
              )}
              {collection.isError && (
                <div className="error" role="alert">
                  <p>{collection.error.message}</p>
                  <button
                    className="text-action"
                    onClick={() => collection.refetch()}
                  >
                    Повторить
                  </button>
                </div>
              )}
              <div className="gift-grid market-owned-grid">
                {owned.map((gift) => (
                  <GiftCard
                    key={gift.id}
                    gift={gift}
                    onClick={() => {
                      pin.reset();
                      setRevealed(gift);
                    }}
                  />
                ))}
              </div>
              {!collection.isLoading &&
                !collection.isError &&
                !owned.length && (
                  <p className="market-empty" role="status">
                    {search
                      ? "Ничего не найдено."
                      : "В вашей коллекции пока нет подарков."}
                  </p>
                )}
              {collection.hasNextPage && (
                <button
                  className="outline market-more"
                  disabled={collection.isFetchingNextPage}
                  onClick={() => collection.fetchNextPage()}
                >
                  Показать ещё
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {selected && (
        <Dialog
          title={selected.item.name}
          className="market-purchase-dialog"
          onClose={() => {
            if (!buy.isPending) setSelected(null);
          }}
        >
          <div className="market-purchase-art">
            <GiftArtwork template={selected.item.id} animate />
          </div>
          <p>{selected.item.description}</p>
          <p className="market-random-note">
            Коллекционный номер, фон и узор назначаются при покупке. Подарок
            останется в вашем профиле.
          </p>
          <dl className="market-purchase-facts">
            <div>
              <dt>Стоимость</dt>
              <dd>{selected.item.price.toLocaleString("ru-RU")} N</dd>
            </div>
            <div>
              <dt>Ваш баланс</dt>
              <dd>
                {wallet.isError
                  ? "Недоступен"
                  : (wallet.data?.balance || 0).toLocaleString("ru-RU")}{" "}
                N
              </dd>
            </div>
          </dl>
          {buy.isError && (
            <p className="error" role="alert">
              {buy.error.message}
            </p>
          )}
          <button
            className="primary market-buy"
            disabled={
              buy.isPending ||
              wallet.isLoading ||
              wallet.isError ||
              (wallet.data?.balance || 0) < selected.item.price
            }
            onClick={() => buy.mutate(selected)}
          >
            {buy.isPending
              ? "Покупаем…"
              : `Купить за ${selected.item.price.toLocaleString("ru-RU")} N`}
          </button>
          {!wallet.isError &&
            !wallet.isLoading &&
            (wallet.data?.balance || 0) < selected.item.price && (
              <p className="market-insufficient">
                Недостаточно нимбиков{" "}
                <button onClick={onWallet}>Открыть кошелёк</button>
              </p>
            )}
        </Dialog>
      )}
      {revealed && (
        <GiftDetails
          gift={revealed}
          own
          onClose={() => setRevealed(null)}
          onPin={() => pin.mutate(revealed)}
          pending={pin.isPending}
          error={pin.isError ? pin.error.message : undefined}
        />
      )}
    </div>
  );
}
