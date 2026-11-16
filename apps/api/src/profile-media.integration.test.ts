import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

const base = process.env.TEST_MEDIA_API_URL;
test(
  "profile image upload, replacement and deletion work with S3 unavailable",
  { skip: !base },
  async () => {
    assert.ok(["localhost", "127.0.0.1"].includes(new URL(base!).hostname));
    const register = await fetch(base + "/api/register", {
      method: "POST",
      headers: { Origin: base!, "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "media_test",
        name: "Медиа",
        password: "media-local-test-password",
      }),
    });
    assert.equal(register.status, 200);
    const cookie = register.headers.get("set-cookie")!.split(";")[0];
    const { user } = (await register.json()) as any;
    const png = await sharp({
      create: { width: 100, height: 80, channels: 3, background: "#9bc9ef" },
    })
      .png()
      .toBuffer();
    async function upload(
      kind: string,
      bytes: Uint8Array = png,
      auth = cookie,
    ) {
      const body = new FormData();
      body.append("file", new Blob([bytes], { type: "image/png" }), "test.png");
      return fetch(base + "/api/me/media/" + kind, {
        method: "PUT",
        headers: { Origin: base!, Cookie: auth },
        body,
      });
    }
    assert.equal((await upload("avatar", png, "")).status, 401);
    for (const kind of ["avatar", "banner"]) {
      const response = await upload(kind);
      assert.equal(response.status, 200, await response.clone().text());
      const data = (await response.json()) as any;
      assert.equal(
        data.user[kind === "avatar" ? "hasAvatar" : "hasBanner"],
        true,
      );
      assert.equal(data.user.profileImages, undefined);
      assert.equal(data.user.passwordHash, undefined);
      const image = await fetch(`${base}/api/users/${user.id}/media/${kind}`, {
        headers: { Cookie: cookie },
      });
      assert.equal(image.status, 200);
      assert.equal(image.headers.get("content-type"), "image/webp");
      const metadata = await sharp(
        Buffer.from(await image.arrayBuffer()),
      ).metadata();
      assert.equal(metadata.format, "webp");
    }
    const replacement = await upload("avatar");
    assert.equal(replacement.status, 200);
    assert.equal(((await replacement.json()) as any).user.mediaVersion, 3);
    assert.equal(
      (await upload("avatar", Buffer.from("<script>fake png</script>"))).status,
      400,
    );
    assert.equal((await upload("invalid")).status, 400);
    const huge = await upload("avatar", Buffer.alloc(5 * 1024 * 1024 + 1));
    assert.equal(huge.status, 413);
    assert.match(((await huge.json()) as any).error, /5 МиБ/);
    assert.equal(
      (await fetch(`${base}/api/users/${user.id}/media/avatar`)).status,
      401,
    );
    const removed = await fetch(base + "/api/me/media/avatar", {
      method: "DELETE",
      headers: { Origin: base!, Cookie: cookie },
    });
    assert.equal(removed.status, 200);
    assert.equal(((await removed.json()) as any).user.hasAvatar, false);
    assert.equal(
      (
        await fetch(`${base}/api/users/${user.id}/media/avatar`, {
          headers: { Cookie: cookie },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(`${base}/api/users/${user.id}/media/banner`, {
          headers: { Cookie: cookie },
        })
      ).status,
      200,
      "Deleting avatar preserves banner",
    );
  },
);
