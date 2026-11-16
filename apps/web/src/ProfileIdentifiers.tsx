import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AtSign, Phone, Copy, Check } from "lucide-react";

export function formatNimbNumber(value: string) {
  const digits = value.replace(/^\+/, "");
  if (digits.length <= 3) return "+" + digits;
  return (
    "+" +
    digits.slice(0, 3) +
    " " +
    (digits.slice(3).match(/.{1,4}/g) || []).join(" ")
  );
}
export function ProfileIdentifiers({
  user,
}: {
  user: { id: number; username: string; collectibleNumber?: string | null };
}) {
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const addresses = useQuery({
    queryKey: ["identifiers", user.id],
    queryFn: async () => {
      const r = await fetch(`/api/users/${user.id}/identifiers`, {
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Адреса временно недоступны");
      return data as { names: string[]; numbers: string[] };
    },
  });
  const names = addresses.data?.names || [user.username];
  const numbers =
    addresses.data?.numbers ||
    (user.collectibleNumber ? [user.collectibleNumber] : []);
  async function copy(value: string) {
    setError("");
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
    } catch {
      setError(
        "Не удалось скопировать. Можно выделить адрес и скопировать его вручную.",
      );
    }
  }
  const aliases = expanded ? names.slice(1) : names.slice(1, 6);
  return (
    <section className="profile-addresses" aria-label="Имена и номера">
      <div className="profile-address-row">
        <AtSign size={18} />
        <div className="profile-address-copy">
          <button
            className="profile-address"
            onClick={() => copy("@" + names[0])}
          >
            {"@" + names[0]}
          </button>
          {aliases.length > 0 && (
            <div className="profile-also">
              <span>также </span>
              {aliases.map((name, index) => (
                <span key={name}>
                  <button
                    className="profile-address"
                    onClick={() => copy("@" + name)}
                  >
                    @{name}
                  </button>
                  {index < aliases.length - 1 ? ", " : ""}
                </span>
              ))}
            </div>
          )}
          {names.length > 6 && (
            <button
              className="address-expand"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Свернуть" : `Ещё ${names.length - 6}`}
            </button>
          )}
          <small>Имя пользователя</small>
        </div>
        <button
          className="address-copy"
          aria-label="Скопировать основное имя"
          onClick={() => copy("@" + names[0])}
        >
          {copied === "@" + names[0] ? <Check size={17} /> : <Copy size={17} />}
        </button>
      </div>
      {numbers.map((number, index) => (
        <div className="profile-address-row profile-number" key={number}>
          <Phone size={18} />
          <div className="profile-address-copy">
            <button className="profile-address" onClick={() => copy(number)}>
              {formatNimbNumber(number)}
            </button>
            <small>
              {index === 0 ? "Номер nimb" : "Дополнительный номер nimb"}
            </small>
          </div>
          <button
            className="address-copy"
            aria-label={`Скопировать номер ${number}`}
            onClick={() => copy(number)}
          >
            {copied === number ? <Check size={17} /> : <Copy size={17} />}
          </button>
        </div>
      ))}
      {copied && (
        <span className="address-notice" role="status">
          Скопировано: {copied}
        </span>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {addresses.isError && (
        <button className="address-expand" onClick={() => addresses.refetch()}>
          Повторить загрузку дополнительных адресов
        </button>
      )}
    </section>
  );
}
