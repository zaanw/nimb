import { Dialog } from "./UI";
import { GiftCard, GiftDetails, type CollectibleGift } from "./CollectibleGift";
import { GiftArtwork } from "./GiftArtwork";
import { BadgeIcon, type Identity } from "./Identity";
import { useId, useState } from "react";
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
  description: string;
  condition?: string;
  awardedAt?: string;
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
  identity,
}: {
  userId: number;
  own: boolean;
  section?: "all" | "badges" | "gifts";
  openCatalog?: boolean;
  onCatalogClose?: () => void;
  identity?: Identity;
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
  const awards = badgeQuery.data?.badges ?? [];
  const badges = [
    ...(identity?.verified && !awards.some((badge) => badge.id === "verified")
      ? [
          {
            id: "verified",
            name: "Verified",
            description: "Владелец Nimb подтвердил подлинность аккаунта.",
          },
        ]
      : []),
    ...(identity?.plus && !awards.some((badge) => badge.id === "plus")
      ? [
          {
            id: "plus",
            name: "Plus",
            description:
              "Для этого аккаунта доступна персонализация профиля Nimb Plus.",
          },
        ]
      : []),
    ...awards,
  ];
  return (
    <>
      {section !== "gifts" && (
        <section
          className="collection-section badges-section"
          aria-label="Значки профиля"
        >
          <div className="list-top">
            <span>Значки</span>
            <span>{badges.length}</span>
          </div>
          {badges.length > 0 && (
            <div className="badge-list">
              {badges.map((badge) => (
                <ProfileBadge
                  key={badge.id}
                  badge={badge}
                  onOpen={() => setDetail(badge)}
                />
              ))}
            </div>
          )}
          {badgeQuery.isLoading ? (
            <p className="muted">Загрузка…</p>
          ) : badgeQuery.isError ? (
            <p className="muted">Не удалось загрузить выданные значки.</p>
          ) : !badges.length ? (
            <p className="muted">Значков пока нет.</p>
          ) : null}
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
          {detail.condition && <p className="muted">{detail.condition}</p>}
          {detail.awardedAt && (
            <p className="muted">
              Выдан {new Date(detail.awardedAt).toLocaleDateString("ru-RU")}
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}

function ProfileBadge({ badge, onOpen }: { badge: Badge; onOpen: () => void }) {
  const hint = useId();
  function positionHint(anchor: HTMLDivElement) {
    const width = Math.min(190, window.innerWidth * 0.47);
    const edge = anchor.getBoundingClientRect().left + width;
    anchor.style.setProperty(
      "--tip-offset",
      `${Math.min(0, window.innerWidth - edge - 12)}px`,
    );
    delete anchor.dataset.tooltipDismissed;
  }
  return (
    <div
      className="profile-badge"
      onPointerEnter={(event) => positionHint(event.currentTarget)}
      onFocus={(event) => positionHint(event.currentTarget)}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          event.currentTarget.matches(":has(:focus-visible)")
        ) {
          if (event.currentTarget.dataset.tooltipDismissed) return;
          event.stopPropagation();
          event.currentTarget.dataset.tooltipDismissed = "true";
        }
      }}
    >
      <button className="badge-token" aria-describedby={hint} onClick={onOpen}>
        <BadgeIcon id={badge.id} size={16} />
        <span>{badge.name}</span>
      </button>
      <span className="profile-badge-tooltip" role="tooltip" id={hint}>
        {badge.description}
      </span>
    </div>
  );
}
