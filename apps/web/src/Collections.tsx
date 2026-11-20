import { GiftArtwork } from "./GiftArtwork";
import { BadgeIcon } from "./Identity";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Gift as GiftIcon, X } from "lucide-react";
type Template = {
  id: string;
  name: string;
  icon: string;
  rarity: string;
  color: string;
  description: string;
};
type Gift = Omit<Template, "id"> & {
  id: number;
  template: string;
  pinned: boolean;
  receivedAt: string;
  ownerId: number;
  sender: { name: string; username: string } | null;
};
type Badge = {
  id: string;
  name: string;
  icon: string;
  description: string;
  condition: string;
  awardedAt: string;
};
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch("/api" + path, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await r.json();
  if (!r.ok) throw new Error(value.error || "Ошибка запроса");
  return value;
}
export function Collections({
  userId,
  own,
  section = "all",
  openCatalog = false,
  onCatalogClose,
}: {
  userId: number;
  own: boolean;
  section?: "all" | "badges" | "gifts";
  openCatalog?: boolean;
  onCatalogClose?: () => void;
}) {
  const qc = useQueryClient();
  const [detail, setDetail] = useState<Gift | Badge | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [notice, setNotice] = useState("");
  const badgeQuery = useQuery({
    queryKey: ["badges", userId],
    queryFn: () => api<{ badges: Badge[] }>(`/users/${userId}/badges`),
  });
  const giftQuery = useQuery({
    queryKey: ["gifts", userId],
    queryFn: () => api<{ gifts: Gift[] }>(`/users/${userId}/gifts`),
  });
  const catalog = useQuery({
    queryKey: ["gift-catalog"],
    queryFn: () => api<{ templates: Template[] }>("/catalog/gifts"),
    enabled: showCatalog || openCatalog,
  });
  const send = useMutation({
    mutationFn: (template: string) =>
      api(`/users/${userId}/gifts`, "POST", { template }),
    onSuccess: () => {
      setShowCatalog(false);
      onCatalogClose?.();
      setNotice("Подарок отправлен");
      qc.invalidateQueries({ queryKey: ["gifts", userId] });
    },
  });
  const pin = useMutation({
    mutationFn: (gift: Gift) =>
      api(`/gifts/${gift.id}/pin`, "PATCH", { pinned: !gift.pinned }),
    onSuccess: () => {
      setDetail(null);
      qc.invalidateQueries({ queryKey: ["gifts", userId] });
    },
  });
  return (
    <>
      {section !== "gifts" && (
        <section className="collection-section badges-section">
          <div className="list-top">
            <span>Значки</span>
            <span>{badgeQuery.data?.badges.length || 0}</span>
          </div>
          {badgeQuery.isLoading ? (
            <p className="muted">Загрузка…</p>
          ) : badgeQuery.isError ? (
            <p className="muted">Не удалось загрузить значки.</p>
          ) : badgeQuery.data?.badges.length ? (
            <div className="badge-list">
              {badgeQuery.data.badges.map((b) => (
                <button
                  className={"badge-token badge-" + b.id}
                  title={b.name}
                  key={b.id}
                  onClick={() => setDetail(b)}
                >
                  <BadgeIcon id={b.id} />
                  <span>{b.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">Значков пока нет.</p>
          )}
        </section>
      )}
      {section !== "badges" && (
        <section className="collection-section gifts-section">
          <div className="list-top">
            <span>Подарки</span>
            <span>{giftQuery.data?.gifts.length || 0}</span>
          </div>
          {!own && (
            <button
              className="outline gift-send"
              onClick={() => {
                setNotice("");
                setShowCatalog(true);
              }}
            >
              <GiftIcon size={16} /> Подарить
            </button>
          )}
          {notice && <p className="muted">{notice}</p>}
          {giftQuery.isLoading ? (
            <p className="muted">Загрузка…</p>
          ) : giftQuery.isError ? (
            <p className="muted">Не удалось загрузить подарки.</p>
          ) : giftQuery.data?.gifts.length ? (
            <div className="gift-grid">
              {giftQuery.data.gifts.map((g) => (
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  className={"gift-tile " + g.color}
                  key={g.id}
                  onClick={() => setDetail(g)}
                >
                  <small>#{g.id}</small>
                  <GiftArtwork template={g.template} />
                  <strong>{g.name}</strong>
                  {g.pinned && <em>Закреплён</em>}
                </motion.button>
              ))}
            </div>
          ) : (
            <p className="muted">Подарков пока нет.</p>
          )}
        </section>
      )}
      {(showCatalog || openCatalog) && (
        <div
          className="overlay"
          onClick={() => {
            setShowCatalog(false);
            onCatalogClose?.();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="modal edit-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button close"
              aria-label="Закрыть"
              onClick={() => {
                setShowCatalog(false);
                onCatalogClose?.();
              }}
            >
              <X size={20} />
            </button>
            <div className="small-label">ЗНАК ВНИМАНИЯ</div>
            <h2>Выберите подарок</h2>
            <p className="muted">
              Бесплатные коллекционные предметы внутри nimb. Оплата и обмен не
              предусмотрены.
            </p>
            <div className="gift-grid">
              {catalog.data?.templates.map((t) => (
                <button
                  className={"gift-tile " + t.color}
                  key={t.id}
                  disabled={send.isPending}
                  onClick={() => send.mutate(t.id)}
                >
                  <GiftArtwork template={t.id} />
                  <strong>{t.name}</strong>
                  <em>{t.rarity}</em>
                </button>
              ))}
            </div>
            {catalog.isError && (
              <p className="error">{catalog.error.message}</p>
            )}
            {send.isError && <p className="error">{send.error.message}</p>}
          </motion.div>
        </div>
      )}
      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="modal edit-modal gift-detail"
            role="dialog"
            aria-modal="true"
            aria-label={detail.name}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button close"
              aria-label="Закрыть"
              onClick={() => setDetail(null)}
            >
              <X size={20} />
            </button>
            <div
              className={
                "gift-detail-icon " +
                ("template" in detail
                  ? "gift-stage " + detail.color
                  : "badge-" + detail.id)
              }
            >
              {"template" in detail ? (
                <GiftArtwork template={detail.template} animate />
              ) : (
                <BadgeIcon id={detail.id} size={50} />
              )}
            </div>
            <h2>{detail.name}</h2>
            <p>{detail.description}</p>
            {"template" in detail ? (
              <>
                <dl className="gift-facts">
                  <div>
                    <dt>Экземпляр</dt>
                    <dd>#{detail.id}</dd>
                  </div>
                  <div>
                    <dt>Коллекция</dt>
                    <dd>{detail.rarity}</dd>
                  </div>
                  <div>
                    <dt>Владелец</dt>
                    <dd>ID {userId}</dd>
                  </div>
                  {detail.sender && (
                    <div>
                      <dt>Отправитель</dt>
                      <dd>@{detail.sender.username}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Получен</dt>
                    <dd>
                      {new Date(detail.receivedAt).toLocaleDateString("ru-RU")}
                    </dd>
                  </div>
                </dl>
                {own && (
                  <button
                    className="primary"
                    disabled={pin.isPending}
                    onClick={() => pin.mutate(detail)}
                  >
                    {detail.pinned ? "Открепить" : "Закрепить в профиле"}
                  </button>
                )}
                {pin.isError && <p className="error">{pin.error.message}</p>}
              </>
            ) : (
              <p className="muted">
                {detail.condition}
                <br />
                Выдан {new Date(detail.awardedAt).toLocaleDateString("ru-RU")}
              </p>
            )}
          </motion.div>
        </div>
      )}
    </>
  );
}
