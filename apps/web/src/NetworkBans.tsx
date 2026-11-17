import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Monitor, ShieldBan, Unlock, Server } from "lucide-react";
import { Dialog, useConfirmation } from "./UI";

type Device = {
  id: number;
  ip: string;
  deviceHash: string;
  label: string;
  firstSeen: string;
  lastSeen: string;
  publicIp: boolean;
};
type Ban = {
  id: number;
  kind: "ip" | "device";
  value: string;
  reason: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  active: boolean;
};
type Candidate = { kind: "ip" | "device"; value: string; label: string };
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch("/api/admin" + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Не удалось изменить блокировку");
  return d;
}
export function NetworkBans({
  userId,
  onClose,
}: {
  userId: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { ask, dialog } = useConfirmation();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [manualIp, setManualIp] = useState("");
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState("24");
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["network-bans", userId],
    queryFn: () =>
      api<{
        user: { id: number; name: string; username: string };
        isAdmin: boolean;
        devices: Device[];
        bans: Ban[];
      }>(`/users/${userId}/network`),
  });
  const status = useQuery({
    queryKey: ["network-status"],
    queryFn: () =>
      api<{
        peer: string;
        clientIp: string;
        publicClientIp: boolean;
        trusted: boolean;
        canTrust: boolean;
        proxies?: { ip: string; createdAt: string }[];
      }>("/network/status"),
  });
  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["network-bans"] }),
      qc.invalidateQueries({ queryKey: ["network-status"] }),
      qc.invalidateQueries({ queryKey: ["admin"] }),
    ]);
  }
  const create = useMutation({
    mutationFn: (selected: Candidate) =>
      api(`/users/${userId}/network/bans`, {
        kind: selected.kind,
        value: selected.value,
        reason: reason.trim(),
        hours: hours === "forever" ? null : Number(hours),
      }),
    onSuccess: async () => {
      setCandidate(null);
      setReason("");
      setNotice("Блокировка включена. Подходящие сеансы завершены.");
      await refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: number) => api(`/network/bans/${id}/revoke`, {}),
    onSuccess: async () => {
      setNotice("Блокировка снята. Пользователь сможет войти заново.");
      await refresh();
    },
  });
  const trust = useMutation({
    mutationFn: () => api("/network/trust-proxy", {}),
    onSuccess: async () => {
      setNotice(
        "Прокси сохранён. IP пользователей появятся после их следующего подключения.",
      );
      await refresh();
    },
  });
  const untrust = useMutation({
    mutationFn: (ip: string) => api("/network/trust-proxy/revoke", { ip }),
    onSuccess: async () => {
      setNotice(
        "Доверие прокси отключено. IP из его заголовков больше не используется.",
      );
      await refresh();
    },
  });
  const busy =
    create.isPending ||
    revoke.isPending ||
    trust.isPending ||
    untrust.isPending;
  function select(next: Candidate) {
    setCandidate(next);
    setReason("");
    setNotice("");
    create.reset();
  }
  return (
    <>
      <Dialog title="Бан по IP и браузеру" onClose={onClose}>
        <div className="network-bans-panel">
          <p className="muted">
            {query.data
              ? `@${query.data.user.username} · ID ${userId}`
              : "Загрузка подключений…"}
          </p>
          <p>
            IP-бан действует на все аккаунты с этим адресом, в том числе в общей
            сети. Бан браузера действует на его идентификатор, даже при смене
            IP. Настоящий аппаратный ID браузер не раскрывает: очистка данных
            сайта или другой браузер позволяют обойти такую блокировку.
          </p>
          {status.data && !status.data.publicClientIp && (
            <section className="network-proxy-note">
              <Server size={19} />
              <div>
                <strong>Сервер пока видит внутренний адрес</strong>
                <p>
                  Этот адрес блокировать нельзя — он может принадлежать
                  хостингу.
                </p>
                {status.data.canTrust ? (
                  <button
                    className="outline"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await ask({
                          title: "Доверять прокси хостинга?",
                          description: `Разрешить серверу принимать адрес клиента от внутреннего прокси ${status.data?.peer}? Другие источники заголовков продолжат игнорироваться.`,
                          label: "Доверять этому прокси",
                        })
                      )
                        trust.mutate();
                    }}
                  >
                    Настроить прокси хостинга
                  </button>
                ) : (
                  <small>
                    Если хостинг не передаёт адрес клиента, используйте бан
                    браузера. Доверенные прокси также можно указать в настройках
                    сервера.
                  </small>
                )}
              </div>
            </section>
          )}
          {query.data?.isAdmin ? (
            <p className="network-admin-protected">
              Подключения администратора защищены от блокировки.
            </p>
          ) : (
            <>
              {candidate ? (
                <form
                  className="network-ban-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const selected = candidate;
                    if (
                      await ask({
                        title:
                          selected.kind === "ip"
                            ? "Заблокировать IP?"
                            : "Заблокировать браузер?",
                        description: `${selected.label}. ${selected.kind === "ip" ? "Все пользователи с этим IP потеряют доступ." : "Этот браузер не сможет войти и зарегистрировать другой аккаунт, пока сохраняется его идентификатор."} Срок: ${hours === "forever" ? "без срока" : hours + " ч"}. Причина: ${reason.trim()}`,
                        label: "Заблокировать",
                        danger: true,
                      })
                    )
                      create.mutate(selected);
                  }}
                >
                  <h3>
                    {candidate.kind === "ip"
                      ? "Блокировка IP"
                      : "Блокировка браузера"}
                  </h3>
                  <p className="network-target">{candidate.label}</p>
                  <label>
                    Причина
                    <textarea
                      required
                      minLength={3}
                      maxLength={500}
                      rows={3}
                      placeholder="Например: повторный спам"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <label>
                    Срок
                    <select
                      aria-label="Срок блокировки"
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                    >
                      <option value="1">1 час</option>
                      <option value="24">24 часа</option>
                      <option value="168">7 дней</option>
                      <option value="forever">Без срока</option>
                    </select>
                  </label>
                  <div className="network-form-actions">
                    <button
                      className="outline"
                      type="button"
                      disabled={busy}
                      onClick={() => setCandidate(null)}
                    >
                      Отмена
                    </button>
                    <button
                      className="primary danger-button"
                      disabled={busy || reason.trim().length < 3}
                    >
                      <ShieldBan size={16} />
                      Заблокировать
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <h3>Недавние подключения</h3>
                  {query.isLoading ? (
                    <p>Загрузка…</p>
                  ) : query.data?.devices.length ? (
                    query.data.devices.map((device) => (
                      <article className="network-device" key={device.id}>
                        <div className="network-device-heading">
                          <Monitor size={19} />
                          <div>
                            <strong>{device.label}</strong>
                            <small>
                              Последняя активность:{" "}
                              {new Date(device.lastSeen).toLocaleString(
                                "ru-RU",
                              )}
                            </small>
                          </div>
                        </div>
                        <div className="network-address">
                          <Globe size={14} />
                          {device.ip || "IP не определён"}
                          <span>Браузер {device.deviceHash.slice(0, 8)}</span>
                        </div>
                        <div className="network-device-actions">
                          <button
                            className="outline"
                            disabled={busy || !device.publicIp}
                            onClick={() =>
                              select({
                                kind: "ip",
                                value: device.ip,
                                label: device.ip,
                              })
                            }
                          >
                            Бан IP
                          </button>
                          <button
                            className="outline"
                            disabled={busy}
                            onClick={() =>
                              select({
                                kind: "device",
                                value: device.deviceHash,
                                label:
                                  device.label +
                                  " · " +
                                  device.deviceHash.slice(0, 8),
                              })
                            }
                          >
                            Бан браузера
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="muted">
                      Подключений пока нет. Идентификаторы начнут сохраняться
                      после входа или следующего запроса пользователя с новым
                      обновлением.
                    </p>
                  )}
                  <form
                    className="network-manual"
                    onSubmit={(e) => {
                      e.preventDefault();
                      select({
                        kind: "ip",
                        value: manualIp.trim(),
                        label: manualIp.trim(),
                      });
                    }}
                  >
                    <label>
                      Другой известный IP
                      <input
                        aria-label="IP для блокировки"
                        value={manualIp}
                        onChange={(e) => setManualIp(e.target.value)}
                        placeholder="IPv4 или IPv6"
                        maxLength={64}
                      />
                    </label>
                    <button
                      className="outline"
                      disabled={busy || !manualIp.trim()}
                    >
                      Выбрать IP
                    </button>
                  </form>
                </>
              )}
            </>
          )}
          {notice && (
            <p className="network-notice" role="status">
              {notice}
            </p>
          )}
          {[query, status, create, revoke, trust, untrust].map(
            (operation, index) =>
              operation.isError ? (
                <p className="error" role="alert" key={index}>
                  {operation.error.message}
                </p>
              ) : null,
          )}
          {!!status.data?.proxies?.length && (
            <details className="network-proxy-settings">
              <summary>Доверенные прокси хостинга</summary>
              {status.data.proxies.map((proxy) => (
                <div key={proxy.ip}>
                  <code>{proxy.ip}</code>
                  <button
                    className="outline"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await ask({
                          title: "Отключить доверие прокси?",
                          description: `Адреса клиентов из заголовков ${proxy.ip} больше не будут учитываться. IP-блокировки за этим прокси могут перестать распознаваться; бан браузера продолжит действовать.`,
                          label: "Отключить доверие",
                        })
                      )
                        untrust.mutate(proxy.ip);
                    }}
                  >
                    Отключить доверие
                  </button>
                </div>
              ))}
            </details>
          )}
          <h3>Блокировки и история</h3>
          <p className="muted">
            Снятие IP-бана или бана браузера не отменяет отдельную блокировку
            аккаунта.
          </p>
          {query.data?.bans.length ? (
            query.data.bans.map((ban) => (
              <article
                className={"network-ban-record " + (ban.active ? "active" : "")}
                key={ban.id}
              >
                <header>
                  <strong>
                    {ban.kind === "ip"
                      ? "IP " + ban.value
                      : "Браузер " + ban.value.slice(0, 8)}
                  </strong>
                  <span>
                    {ban.active
                      ? "Действует"
                      : ban.revokedAt
                        ? "Снята"
                        : "Истекла"}
                  </span>
                </header>
                <p>{ban.reason}</p>
                <small>
                  {new Date(ban.createdAt).toLocaleString("ru-RU")} ·{" "}
                  {ban.expiresAt
                    ? "до " + new Date(ban.expiresAt).toLocaleString("ru-RU")
                    : "без срока"}
                </small>
                {ban.active && (
                  <button
                    className="outline"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await ask({
                          title: "Снять блокировку?",
                          description: `${ban.kind === "ip" ? ban.value : "Браузер " + ban.value.slice(0, 8)} снова сможет обращаться к nimb.`,
                          label: "Снять блокировку",
                        })
                      )
                        revoke.mutate(ban.id);
                    }}
                  >
                    <Unlock size={15} />
                    Снять блокировку
                  </button>
                )}
              </article>
            ))
          ) : (
            <p className="muted">Блокировок нет.</p>
          )}
        </div>
      </Dialog>
      {dialog}
    </>
  );
}
