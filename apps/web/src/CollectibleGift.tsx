import { useId, type CSSProperties } from "react";
import { Pin } from "lucide-react";
import { GiftArtwork } from "./GiftArtwork";
import { Dialog } from "./UI";
export type GiftAppearance = {
  serialNumber?: number | null;
  backdrop?: {
    id: string;
    name: string;
    center: string;
    edge: string;
    patternColor: string;
  } | null;
  symbol?: { id: string; name: string } | null;
};
export type CollectibleGift = GiftAppearance & {
  id: number;
  template: string;
  name: string;
  color: string;
  description: string;
  pinned: boolean;
  receivedAt: string;
  ownerId: number;
  sender: { name: string; username: string } | null;
};
const paths: Record<string, string> = {
  stars:
    "M16 2l4.1 8.4 9.3 1.3-6.7 6.5 1.6 9.2-8.3-4.3-8.3 4.3 1.6-9.2-6.7-6.5 9.3-1.3z",
  crowns: "M3 8l7 5 6-9 6 9 7-5-4 18H7z",
  hearts: "M16 28C-9 12 5-3 16 8 27-3 41 12 16 28z",
  moons: "M22 3C6 4 7 22 25 23 15 38-4 21 6 8c4-5 9-6 16-5z",
  diamonds: "M8 4h16l7 9-15 17L1 13zM1 13h30M8 4l8 26 8-26",
  flowers:
    "M16 10C5-5-5 10 9 16-5 22 5 37 16 23c11 14 21-1 7-7C37 10 27-5 16 10z",
  lightning: "M19 1L5 19h10l-2 12 15-19H18z",
  clovers: "M16 10C2-8-7 9 8 16c-15 7-6 24 8 6 14 18 23 1 8-6C39 9 30-8 16 10z",
};
export function giftStyle(gift: GiftAppearance): CSSProperties {
  return {
    "--gift-center": gift.backdrop?.center || "#528bdb",
    "--gift-edge": gift.backdrop?.edge || "#1c3f77",
    "--gift-pattern": gift.backdrop?.patternColor || "#102d58",
  } as CSSProperties;
}
export function GiftPattern({ symbol = "stars" }: { symbol?: string }) {
  const id = "gift-pattern-" + useId().replace(/:/g, "");
  return (
    <svg className="gift-pattern" viewBox="0 0 320 320" aria-hidden="true">
      <defs>
        <pattern id={id} width="112" height="100" patternUnits="userSpaceOnUse">
          <path
            d={paths[symbol] || paths.stars}
            transform="translate(9 8) rotate(-15 16 16) scale(.65)"
          />
          <path
            d={paths[symbol] || paths.stars}
            transform="translate(68 59) rotate(14 16 16) scale(.8)"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
export function GiftScene({
  gift,
  animate = false,
}: {
  gift: GiftAppearance & { template: string };
  animate?: boolean;
}) {
  return (
    <div className="gift-scene" style={giftStyle(gift)}>
      <GiftPattern symbol={gift.symbol?.id} />
      <GiftArtwork template={gift.template} animate={animate} lazy={!animate} />
    </div>
  );
}
export function GiftCard({
  gift,
  onClick,
}: {
  gift: CollectibleGift;
  onClick: () => void;
}) {
  const serial = gift.serialNumber || gift.id;
  return (
    <button
      className={`gift-tile is-collectible ${gift.color}`}
      style={giftStyle(gift)}
      onClick={onClick}
      aria-label={`${gift.name} #${serial}`}
    >
      <div className="gift-card-face">
        <GiftScene gift={gift} />
        <span className="edition-ribbon">
          #{serial.toLocaleString("ru-RU")}
        </span>
        {gift.pinned && (
          <span className="gift-pinned" title="Закреплён">
            <Pin size={13} aria-hidden="true" />
            <span className="sr-only">Закреплён</span>
          </span>
        )}
      </div>
      <strong className="gift-tile-name">{gift.name}</strong>
      <span className="gift-traits">
        {gift.backdrop?.name || "Sapphire"} · {gift.symbol?.name || "Stars"}
      </span>
    </button>
  );
}
export function GiftDetails({
  gift,
  onClose,
  own = false,
  onPin,
  pending = false,
  error,
}: {
  gift: CollectibleGift;
  onClose: () => void;
  own?: boolean;
  onPin?: () => void;
  pending?: boolean;
  error?: string;
}) {
  return (
    <Dialog
      title={gift.name}
      onClose={onClose}
      className="gift-detail collectible-dialog"
    >
      <div className="collectible-hero" style={giftStyle(gift)}>
        <GiftScene gift={gift} animate />
        <h2>{gift.name}</h2>
        <p>
          Коллекционный #
          {(gift.serialNumber || gift.id).toLocaleString("ru-RU")}
        </p>
      </div>
      <dl className="gift-facts collectible-facts">
        <div>
          <dt>Владелец</dt>
          <dd>ID {gift.ownerId}</dd>
        </div>
        <div>
          <dt>Экземпляр</dt>
          <dd>#{(gift.serialNumber || gift.id).toLocaleString("ru-RU")}</dd>
        </div>
        <div>
          <dt>Модель</dt>
          <dd>{gift.name}</dd>
        </div>
        <div>
          <dt>Узор</dt>
          <dd>{gift.symbol?.name || "Stars"}</dd>
        </div>
        <div>
          <dt>Фон</dt>
          <dd>{gift.backdrop?.name || "Sapphire"}</dd>
        </div>
        {gift.sender && (
          <div>
            <dt>Отправитель</dt>
            <dd>@{gift.sender.username}</dd>
          </div>
        )}
        <div>
          <dt>Получен</dt>
          <dd>{new Date(gift.receivedAt).toLocaleDateString("ru-RU")}</dd>
        </div>
      </dl>
      {own && onPin && (
        <button
          className="primary collectible-pin"
          disabled={pending}
          onClick={onPin}
        >
          {gift.pinned ? "Открепить" : "Закрепить в профиле"}
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
