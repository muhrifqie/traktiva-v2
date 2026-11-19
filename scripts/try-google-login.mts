// Dev check: Google login window opens on accounts.google.com, the detector stays at stage "google"
// for a signed-out profile, and cancelling ends cleanly. No real credentials involved.
// Usage: npx tsx --conditions=react-server scripts/try-google-login.mts
import assert from "node:assert/strict";
import { deleteProfile } from "@/lib/browser/chrome";
import { cancelGoogleLogin, getGoogleLogin, startGoogleLogin } from "@/lib/platforms/google";

const { loginId, sessionKey } = await startGoogleLogin();
try {
  await new Promise((r) => setTimeout(r, 9000));
  const g = globalThis as unknown as { __googleLogins: Map<string, { ctx?: { pages(): { url(): string }[] } }> };
  const url = g.__googleLogins.get(loginId)?.ctx?.pages()[0]?.url() ?? "";
  console.log("first page:", url.slice(0, 90));
  assert.match(url, /^https:\/\/accounts\.google\.com\//, "login must start on Google's sign-in page");

  const s = getGoogleLogin(loginId)!;
  console.log("state:", s.status, s.stage, s.email);
  assert.equal(s.status, "waiting");
  assert.equal(s.stage, "google", "signed-out profile must not pass stage 1");
  assert.equal(s.email, null);

  await cancelGoogleLogin(loginId);
  await new Promise((r) => setTimeout(r, 2500));
  const after = getGoogleLogin(loginId)!;
  console.log("after cancel:", after.status, after.error);
  assert.equal(after.status, "cancelled");
  console.log("GOOGLE LOGIN OK");
} finally {
  await new Promise((r) => setTimeout(r, 1000));
  await deleteProfile(sessionKey).catch(() => {});
}
process.exit(0);
