import { useEffect, useState } from "react";
import { Bell, BellRing, Send, Smartphone } from "lucide-react";
const key = "nimb_notifications_enabled";
const pushKey = "nimb_push_enabled";
let pushActive = false;
function read(name: string) {
  try {
    return localStorage.getItem(name) === "true";
  } catch {
    return false;
  }
}
function remember(name: string, on: boolean) {
  try {
    localStorage.setItem(name, String(on));
  } catch {}
}
const supported = () =>
  "Notification" in window &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  window.isSecureContext;
const ios = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const installed = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
function base64Key(value: string) {
  return Uint8Array.from(
    atob(
      (value + "=".repeat((4 - (value.length % 4)) % 4))
        .replace(/-/g, "+")
        .replace(/_/g, "/"),
    ),
    (c) => c.charCodeAt(0),
  );
}
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch("/api/push" + path, {
    method,
    credentials: "include",
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const d = await r.json();
  if (!r.ok)
    throw new Error(d.error || "Не удалось связаться со службой уведомлений");
  return d;
}
async function registration() {
  const worker =
    (await navigator.serviceWorker.getRegistration()) ||
    (await navigator.serviceWorker.register("/sw.js"));
  if (worker.active) return worker;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "Подготовка уведомлений заняла слишком долго. Обновите страницу и повторите.",
              ),
            ),
          12000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function performSubscription() {
  const { publicKey } = await api<{ publicKey: string }>("/public-key");
  const worker = await registration();
  let sub = await worker.pushManager.getSubscription();
  const bytes = base64Key(publicKey);
  const existing = sub?.options.applicationServerKey;
  if (
    sub &&
    existing &&
    Array.from(new Uint8Array(existing)).join(",") !==
      Array.from(bytes).join(",")
  ) {
    await sub.unsubscribe();
    sub = null;
  }
  sub =
    sub ||
    (await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes,
    }));
  await api("/subscriptions", "POST", sub.toJSON());
  pushActive = true;
  remember(pushKey, true);
  return true;
}
let subscriptionTask:Promise<boolean>|null=null;
function subscribe(){if(!subscriptionTask)subscriptionTask=performSubscription().finally(()=>{subscriptionTask=null});return subscriptionTask;}
export async function syncPushSubscription() {
  pushActive = false;
  if (!supported() || Notification.permission !== "granted" || !read(pushKey))
    return false;
  try {
    return await subscribe();
  } catch {
    return false;
  }
}
export function clearPushPreference() {
  pushActive = false;
  remember(pushKey, false);
}
export function notifyMessage(chatId?: number) {
  if (
    pushActive ||
    !read(key) ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  )
    return;
  const options = {
    body: "Новое сообщение",
    icon: "/icon-192.png",
    tag: chatId ? "nimb-chat-" + chatId : "nimb-new-message",
    data: { chatId, url: chatId ? "/?chat=" + chatId : "/" },
  };
  if ("serviceWorker" in navigator)
    void navigator.serviceWorker
      .getRegistration()
      .then((worker) => {
        if (worker) return worker.showNotification("nimb", options);
        new Notification("nimb", options);
      })
      .catch(() => {});
  else
    try {
      new Notification("nimb", options);
    } catch {}
}
export function NotificationSettings() {
  const [enabled, setEnabled] = useState(false);
  const [local, setLocal] = useState(read(key));
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(true);
  const [desired, setDesired] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [testing, setTesting] = useState(false);
  const canPush = supported() && (!ios() || installed());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await api<{ configured: boolean; subscribed: boolean }>(
          "/status",
        );
        if (cancelled) return;
        setConfigured(status.configured);
        let active = false;
        if (
          canPush &&
          status.configured &&
          Notification.permission === "granted"
        ) {
          if (read(pushKey)) active = await syncPushSubscription();
          else {
            const worker = await navigator.serviceWorker.getRegistration();
            active = !!(
              status.subscribed && (await worker?.pushManager.getSubscription())
            );
            if (active) {
              pushActive = true;
              remember(pushKey, true);
            }
          }
        }
        if (!cancelled) setEnabled(active);
      } catch (error) {
        if (!cancelled) setMessage((error as Error).message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canPush]);
  async function toggle(on: boolean) {
    setMessage("");
    setNotice("");
    setBusy(true);
    setDesired(on);
    try {
      if (on) {
        if (!canPush)
          throw new Error(
            ios()
              ? "Добавьте nimb на экран «Домой» и откройте его оттуда."
              : "Откройте nimb в браузере с поддержкой push по HTTPS.",
          );
        // Request permission directly from the user's gesture, before network or worker awaits.
        const permission =
          Notification.permission === "granted"
            ? "granted"
            : await Notification.requestPermission();
        if (permission !== "granted")
          throw new Error(
            "Уведомления запрещены. Разрешите их в настройках браузера или устройства для nimb.",
          );
        await subscribe();
        setEnabled(true);
        setNotice("Push включён на этом устройстве.");
      } else {
        await api("/subscriptions", "DELETE");
        pushActive = false;
        remember(pushKey, false);
        setEnabled(false);
        const worker = await navigator.serviceWorker.getRegistration();
        const sub = await worker?.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
        setNotice("Push отключён на этом устройстве.");
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
      setDesired(null);
    }
  }
  async function testPush() {
    setTesting(true);
    setMessage("");
    setNotice("");
    try {
      await api("/test", "POST", {});
      setNotice("Тест отправлен. Проверьте центр уведомлений устройства.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setTesting(false);
    }
  }
  async function toggleLocal(on: boolean) {
    setMessage("");
    try {
      if (on) {
        if (
          !("Notification" in window) ||
          (await Notification.requestPermission()) !== "granted"
        )
          throw new Error("Браузер не разрешил уведомления.");
      }
      remember(key, on);
      setLocal(on);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <section className="setting-detail notification-settings">
      <div className="notification-heading">
        <BellRing size={25} />
        <div>
          <h2>Уведомления</h2>
          <p>Новые сообщения, даже когда nimb закрыт.</p>
        </div>
      </div>
      <p>
        Текст переписки не показывается. Нажатие на уведомление открывает нужный
        чат.
      </p>
      {ios() && !installed() && (
        <div className="push-install-help">
          <Smartphone size={23} />
          <div>
            <strong>На iPhone — через приложение</strong>
            <ol>
              <li>Откройте nimb в Safari.</li>
              <li>«Поделиться» → «На экран Домой».</li>
              <li>Запустите nimb с главного экрана и включите push здесь.</li>
            </ol>
            <small>Нужна iOS / iPadOS 16.4 или новее.</small>
          </div>
        </div>
      )}
      <label className="privacy-option">
        <input
          type="checkbox"
          aria-label="Push-уведомления"
          checked={desired ?? enabled}
          disabled={busy || !canPush || configured !== true}
          onChange={(e) => void toggle(e.target.checked)}
        />
        <span>
          <strong>Push-уведомления</strong>
          <small>
            {busy
              ? "Проверяем настройки…"
              : enabled
                ? "Подключены на этом устройстве"
                : "Включите и разрешите показ уведомлений"}
          </small>
        </span>
      </label>
      <div className="push-actions">
        <button
          className="outline"
          disabled={!enabled || busy || testing}
          onClick={() => void testPush()}
        >
          <Send size={16} />
          {testing ? "Отправляем…" : "Проверить уведомление"}
        </button>
      </div>
      {configured === false && (
        <p className="error">
          Служба push временно недоступна. Попробуйте позже или сообщите администратору.
        </p>
      )}
      {!canPush && !(ios() && !installed()) && (
        <p className="muted">
          Этот браузер не поддерживает Web Push. Используйте актуальный Safari,
          Chrome, Firefox или Edge по HTTPS.
        </p>
      )}
      {"Notification" in window && (
        <label className="privacy-option">
          <input
            type="checkbox"
            checked={local}
            disabled={busy}
            onChange={(e) => void toggleLocal(e.target.checked)}
          />
          <span>
            <strong>В открытой вкладке</strong>
            <small>
              Дополнительный вариант, если push недоступен. При работающем push
              уведомления не дублируются.
            </small>
          </span>
        </label>
      )}
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      {notice && (
        <p className="push-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
