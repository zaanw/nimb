import type { Page } from "@playwright/test";
import { gifts, giftBackdrops, giftSymbols } from "../../apps/api/src/catalog";
export async function redesignFixture(
  page: Page,
  options: { balance?: number; failFirstPurchase?: boolean } = {},
) {
  const me = {
    id: 1,
    name: "zaan",
    username: "zaan",
    bio: "Собираем Nimb. Общение, идеи и немного своих традиций.",
    createdAt: "2026-11-15T10:00:00Z",
    verified: true,
    plus: true,
    nameFont: "default",
    nameEffect: "none",
    profileAccent: "blue",
    collectibleNumber: "+666",
    online: true,
    links: [{ label: "Сайт сообщества", url: "https://example.com/nimb" }],
  };
  const friend = {
    ...me,
    id: 2,
    name: "Алексей",
    username: "alex",
    bio: "",
    verified: false,
    plus: false,
  };
  const templates = Object.entries(gifts).map(([id, data]) => ({
    id,
    ...data,
    issued: 124,
  }));
  const backdropIds = Object.keys(
    giftBackdrops,
  ) as (keyof typeof giftBackdrops)[];
  const symbolIds = Object.keys(giftSymbols) as (keyof typeof giftSymbols)[];
  const owned = templates.map((item, index) => ({
    ...item,
    id: 100 + index,
    template: item.id,
    serialNumber: [46, 103, 27, 812, 64, 93, 18, 250][index],
    backdrop: { id: backdropIds[index], ...giftBackdrops[backdropIds[index]] },
    symbol: { id: symbolIds[index], name: giftSymbols[symbolIds[index]] },
    ownerId: 1,
    pinned: index === 0,
    receivedAt: me.createdAt,
    sender: { name: friend.name, username: friend.username },
  }));
  const messages = [
    {
      id: 1,
      chatId: 1,
      senderId: 2,
      text: "Привет! Как тебе новый профиль?",
      createdAt: "2026-11-20T13:42:00Z",
      reactions: [],
    },
    {
      id: 2,
      chatId: 1,
      senderId: 1,
      text: "Посмотрел. Подарки теперь выглядят совсем по-другому ✨",
      createdAt: "2026-11-20T13:43:00Z",
      reactions: [{ userId: 2, emoji: "❤️" }],
      delivered: true,
    },
    {
      id: 3,
      chatId: 1,
      senderId: 2,
      text: "Да, и настройки наконец удобно открывать с компьютера.",
      createdAt: "2026-11-20T13:44:00Z",
      reactions: [],
    },
    {
      id: 4,
      chatId: 1,
      senderId: 1,
      text: "С телефона тоже проверю. Вечером созвонимся?",
      createdAt: "2026-11-20T13:45:00Z",
      reactions: [],
      delivered: true,
    },
  ];
  const chat = {
    id: 1,
    kind: "direct",
    members: [
      { user: me, role: "member", lastReadId: 4 },
      { user: friend, role: "member", lastReadId: 4 },
    ],
    messages: [messages[3]],
    unreadCount: 0,
  };
  let balance = options.balance ?? 12500;
  let failResponse = options.failFirstPurchase || false;
  const receipts = new Map<string, unknown>();
  const purchases: { template: string; requestId: string }[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api", "");
    let data: unknown = { ok: true };
    if (path === "/me") data = { user: me, isAdmin: true };
    else if (path === "/chats") data = { chats: [chat] };
    else if (path === "/chats/1/messages")
      data = { messages, nextCursor: null };
    else if (path === "/folders") data = { folders: [] };
    else if (path === "/posts") data = { posts: [], nextCursor: null };
    else if (path.endsWith("/identifiers"))
      data = {
        names: ["zaan", "nimb", "777"],
        numbers: ["+666", "+88804040888"],
      };
    else if (path.endsWith("/badges"))
      data = {
        badges: [
          {
            id: "nimb_team",
            name: "Nimb team",
            description: "Команда Nimb.",
            condition: "Выдаёт владелец.",
            awardedAt: me.createdAt,
          },
        ],
      };
    else if (path === "/market/catalog" || path === "/catalog/gifts")
      data = { templates };
    else if (path === "/market/collection")
      data = { gifts: owned, nextCursor: null };
    else if (path === "/market/buy") {
      const body = route.request().postDataJSON();
      purchases.push(body);
      if (receipts.has(body.requestId))
        data = { ...(receipts.get(body.requestId) as object), replayed: true };
      else {
        const item = templates.find((item) => item.id === body.template)!;
        if (balance < item.price) {
          await route.fulfill({
            status: 400,
            json: { error: "Недостаточно нимбиков" },
          });
          return;
        }
        balance -= item.price;
        const gift = {
          ...owned.find((gift) => gift.template === item.id)!,
          id: 900,
          serialNumber: 125,
          pinned: false,
        };
        owned.unshift(gift);
        data = { gift, balance, replayed: false };
        receipts.set(body.requestId, data);
        if (failResponse) {
          failResponse = false;
          await route.fulfill({
            status: 503,
            json: { error: "Ответ потерян. Повторите запрос." },
          });
          return;
        }
      }
    } else if (path.endsWith("/gifts")) data = { gifts: owned };
    else if (/^\/gifts\/\d+\/pin$/.test(path)) {
      const gift = owned.find((gift) => gift.id === Number(path.split("/")[2]));
      if (gift) gift.pinned = route.request().postDataJSON().pinned;
    } else if (path === "/wallet")
      data = {
        balance,
        username: me.username,
        collectibleNumber: "+666",
        owned: [
          {
            username: "777",
            public: true,
            price: 1000,
            purchasedAt: me.createdAt,
          },
          {
            username: "+666",
            public: true,
            price: 10000,
            purchasedAt: me.createdAt,
          },
        ],
      };
    else if (path === "/me/account")
      data = { account: { ...me, email: null, nimbBalance: balance } };
    else if (path === "/admin/overview")
      data = {
        users: 2,
        communities: 0,
        openReports: 0,
        newUsers: 2,
        totalBalance: balance,
        gifts: owned.length,
      };
    else if (path === "/admin/users")
      data = {
        users: [
          { ...friend, nimbBalance: 0, isAdmin: false, suspended: false },
          { ...me, nimbBalance: balance, isAdmin: true, suspended: false },
        ],
        total: 2,
        page: 1,
        pageSize: 20,
      };
    else if (path === "/admin/users/2")
      data = {
        user: {
          ...friend,
          nimbBalance: 0,
          isAdmin: false,
          suspended: false,
          purchasedUsernames: [],
          _count: { gifts: 0, purchasedUsernames: 0 },
        },
      };
    else if (path === "/admin/activity") data = { events: [] };
    else if (path === "/admin/reports") data = { reports: [] };
    else if (path === "/users/2") data = { user: friend };
    await route.fulfill({ json: data });
  });
  return { purchases, owned, balance: () => balance, templates };
}
