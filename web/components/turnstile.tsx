"use client";

import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;
const load = () =>
  (loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    s.onerror = () => { loading = null; reject(new Error("turnstile")); };
    document.head.appendChild(s);
  }));

/**
 * Invisible Cloudflare Turnstile inside a <form>. The token lives in React state and goes out through a controlled
 * hidden input: React 19 resets a form after its action runs, which would wipe Turnstile's own (uncontrolled) field.
 * Tokens are single-use, so pass the form's last result as `resetKey` to get a new one after every submit.
 */
export function Turnstile({ siteKey, resetKey }: { siteKey: string; resetKey?: unknown }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const [token, setToken] = useState("");
  const [seen, setSeen] = useState(resetKey);
  if (seen !== resetKey) {
    setSeen(resetKey);
    setToken(""); // the old token was spent by that submit
  }

  useEffect(() => {
    if (!siteKey || !box.current) return;
    let gone = false;
    load()
      .then((t) => {
        if (gone || !box.current || id.current) return;
        id.current = t.render(box.current, {
          sitekey: siteKey,
          appearance: "interaction-only",
          theme: "auto",
          language: "id",
          "response-field": false,
          callback: (v: string) => setToken(v),
          "expired-callback": () => setToken(""),
          "error-callback": () => setToken(""),
        });
      })
      .catch(() => {});
    return () => {
      gone = true;
      if (id.current) window.turnstile?.remove(id.current);
      id.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetKey && id.current) window.turnstile?.reset(id.current);
  }, [resetKey]);

  if (!siteKey) return null;
  return (
    <>
      <input type="hidden" name="cf-turnstile-response" value={token} />
      <div ref={box} className="empty:hidden" />
    </>
  );
}
