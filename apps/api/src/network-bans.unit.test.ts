import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseIp, publicIp, resolveIp } from "./network-bans.js";
test("IP identity normalises IPv6 and mapped IPv4 and refuses internal ban targets", () => {
  assert.equal(normaliseIp("::ffff:192.0.2.8"), "192.0.2.8");
  assert.equal(normaliseIp("2001:0DB8:0:0::1"), "2001:db8::1");
  assert.equal(normaliseIp("fe80::1%eth0"), null);
  assert.equal(normaliseIp("not-an-ip"), null);
  for (const ip of [
    "127.0.0.1",
    "10.0.0.8",
    "172.17.0.1",
    "192.168.1.1",
    "100.64.0.1",
    "169.254.1.1",
    "0.0.0.0",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "fec0::1",
    "ff02::1",
  ])
    assert.equal(publicIp(ip), false, ip);
  assert.equal(publicIp("203.0.113.8"), true);
  assert.equal(publicIp("2001:db8::1"), true);
});
test("forwarded IP headers only work through explicitly trusted proxy hops", () => {
  const trusted = (ip: string) => ["127.0.0.1", "172.17.0.1"].includes(ip);
  assert.equal(
    resolveIp("203.0.113.7", "198.51.100.99", trusted),
    "203.0.113.7",
  );
  assert.equal(
    resolveIp("127.0.0.1", "198.51.100.99, 203.0.113.7", trusted),
    "203.0.113.7",
    "Client supplied leftmost value cannot spoof an untrusted right hop",
  );
  assert.equal(
    resolveIp("127.0.0.1", "203.0.113.7, 172.17.0.1", trusted),
    "203.0.113.7",
  );
  assert.equal(
    resolveIp("127.0.0.1", "malformed, 203.0.113.7", trusted),
    "127.0.0.1",
  );
});
