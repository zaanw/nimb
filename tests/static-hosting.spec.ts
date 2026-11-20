import { test, expect } from "@playwright/test";

test("compiled static files do not exhaust API limits and remain available when the API is limited", async ({
  request,
}) => {
  test.skip(
    !process.env.NIMB_BROWSER_URL,
    "Requires an explicitly selected local release server",
  );
  expect(["localhost", "127.0.0.1"]).toContain(
    new URL(process.env.NIMB_BROWSER_URL!).hostname,
  );
  const index = await request.get("/");
  expect(index.status()).toBe(200);
  const asset = (await index.text()).match(/src="([^\"]+\.js)"/)?.[1];
  expect(asset).toBeTruthy();
  for (let batch = 0; batch < 11; batch++) {
    const responses = await Promise.all(
      Array.from({ length: 30 }, () => request.head(asset!)),
    );
    expect(responses.every((response) => response.status() === 200)).toBe(true);
    await Promise.all(responses.map((response) => response.dispose()));
  }
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  let limited = false;
  for (let batch = 0; batch < 11; batch++) {
    const responses = await Promise.all(
      Array.from({ length: 30 }, () => request.get("/api/health")),
    );
    limited ||= responses.some((response) => response.status() === 429);
    expect(
      responses.every((response) => [200, 429].includes(response.status())),
    ).toBe(true);
    await Promise.all(responses.map((response) => response.dispose()));
  }
  expect(limited).toBe(true);
  expect((await request.head(asset!)).status()).toBe(200);
});
