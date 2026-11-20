import { Dialog } from "./UI";
import { GiftCard, GiftDetails, type CollectibleGift } from "./CollectibleGift";
import { GiftArtwork } from "./GiftArtwork";
import { BadgeIcon } from "./Identity";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift as GiftIcon } from "lucide-react";
type Template = {
  id: string;
  name: string;
  icon: string;
  rarity: string;
  color: string;
  description: string;
};
type Gift = CollectibleGift;
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
    enabled: section !== "gifts",
  });
  const giftQuery = useQuery({
    queryKey: ["gifts", userId],
    queryFn: () => api<{ gifts: Gift[] }>(`/users/${userId}/gifts`),
    enabled: section !== "badges",
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
                <GiftCard key={g.id} gift={g} onClick={() => setDetail(g)} />
              ))}
            </div>
          ) : (
            <p className="muted">Подарков пока нет.</p>
          )}
        </section>
      )}
      {(showCatalog || openCatalog) && (
        <Dialog
          title="Выберите подарок"
          className="edit-modal gift-picker"
          onClose={() => {
            setShowCatalog(false);
            onCatalogClose?.();
          }}
        >
          <p className="muted">
            Подарок отправится этому пользователю. Его номер, фон и узор
            сохранятся в коллекции.
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
          {catalog.isError && <p className="error">{catalog.error.message}</p>}
          {send.isError && <p className="error">{send.error.message}</p>}
        </Dialog>
      )}
      {detail && "template" in detail && (
        <GiftDetails
          gift={detail}
          own={own}
          onClose={() => setDetail(null)}
          onPin={() => pin.mutate(detail)}
          pending={pin.isPending}
          error={pin.isError ? pin.error.message : undefined}
        />
      )}
      {detail && !("template" in detail) && (
        <Dialog
          title={detail.name}
          className="badge-detail"
          onClose={() => setDetail(null)}
        >
          <div className={"gift-detail-icon badge-" + detail.id}>
            <BadgeIcon id={detail.id} size={50} />
          </div>
          <p>{detail.description}</p>
          <p className="muted">
            {detail.condition}
            <br />
            Выдан {new Date(detail.awardedAt).toLocaleDateString("ru-RU")}
          </p>
        </Dialog>
      )}
    </>
  );
}
