import type { ReactNode } from "react";
import {
  Search,
  ChevronRight,
  UserRound,
  Sparkles,
  Bell,
  Globe,
  Shield,
  Monitor,
  LockKeyhole,
  Palette,
  Type,
  Folder,
  Zap,
  HardDrive,
  Info,
  Smartphone,
  LogOut,
} from "lucide-react";

const groups = [
  {
    title: "Аккаунт",
    items: [
      ["Аккаунт", UserRound, "blue"],
      ["nimb Plus", Sparkles, "purple"],
      ["Уведомления", Bell, "red"],
    ],
  },
  {
    title: "Личное",
    items: [
      ["Язык", Globe, "purple"],
      ["Конфиденциальность", Shield, "blue"],
      ["Устройства", Monitor, "orange"],
      ["Безопасность", LockKeyhole, "green"],
      ["Оформление", Palette, "gray"],
      ["Шрифты", Type, "blue"],
    ],
  },
  {
    title: "Приложение",
    items: [
      ["Папки с чатами", Folder, "cyan"],
      ["Производительность", Zap, "green"],
      ["Хранилище", HardDrive, "orange"],
      ["О приложении", Info, "purple"],
      ["Установить приложение", Smartphone, "blue"],
    ],
  },
] as const;
export function SettingsMenu({
  avatar,
  name,
  username,
  selected,
  search,
  onSearch,
  onSelect,
  onProfile,
  onLogout,
}: {
  avatar: ReactNode;
  name: ReactNode;
  username: string;
  selected: string;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (section: string) => void;
  onProfile: () => void;
  onLogout: () => void;
}) {
  const shown = groups.map((group) => ({
    ...group,
    items: group.items.filter(([title]) =>
      title.toLowerCase().includes(search.toLowerCase()),
    ),
  }));
  return (
    <aside className="settings-navigation" aria-label="Разделы настроек">
      <div className="search-box settings-search">
        <Search size={17} />
        <input
          placeholder="Поиск"
          aria-label="Поиск настроек"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <button className="settings-profile" onClick={onProfile}>
        {avatar}
        <span>
          <strong>{name}</strong>
          <small>@{username}</small>
        </span>
        <ChevronRight size={16} />
      </button>
      <div className="settings-groups">
        {shown
          .filter((group) => group.items.length)
          .map((group) => (
            <section className="settings-group" key={group.title}>
              <h2>{group.title}</h2>
              <div className="settings-list">
                {group.items.map(([title, Icon, color]) => (
                  <button
                    key={title}
                    className={selected === title ? "active" : ""}
                    aria-current={selected === title ? "page" : undefined}
                    onClick={() => onSelect(title)}
                  >
                    <span className={`setting-icon ${color}`}>
                      <Icon size={17} />
                    </span>
                    <span>{title}</span>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
            </section>
          ))}
      </div>
      {!shown.some((group) => group.items.length) && (
        <p className="settings-no-results">
          По запросу «{search}» ничего не найдено.
        </p>
      )}
      <button className="logout" onClick={onLogout}>
        <LogOut size={17} />
        Выйти из аккаунта
      </button>
    </aside>
  );
}
export function SettingsOverview({
  name,
  username,
  avatar,
  onSelect,
}: {
  name: ReactNode;
  username: string;
  avatar: ReactNode;
  onSelect: (section: string) => void;
}) {
  return (
    <div className="settings-overview">
      <div className="settings-overview-person">
        {avatar}
        <h2>{name}</h2>
        <p>@{username}</p>
        <button className="outline" onClick={() => onSelect("Аккаунт")}>
          Открыть аккаунт <ChevronRight size={15} />
        </button>
      </div>
      <div className="settings-overview-links">
        {[
          ["Безопасность", "Пароль и активные сеансы", LockKeyhole],
          ["Уведомления", "Push на этом устройстве", Bell],
          ["Оформление", "Фон переписки и шрифт", Palette],
        ].map(([title, description, Icon]) => (
          <button
            key={title as string}
            aria-label={`Открыть раздел «${title}»`}
            onClick={() => onSelect(title as string)}
          >
            <Icon size={21} />
            <span>
              <strong>{title as string}</strong>
              <small>{description as string}</small>
            </span>
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
    </div>
  );
}
