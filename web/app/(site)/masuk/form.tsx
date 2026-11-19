"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { buyerLogin } from "../actions";

export function BuyerLoginForm() {
  const [state, action, pending] = useActionState(buyerLogin, null);
  const [key, setKey] = useState(""); // controlled: stays after a failed attempt
  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-2 text-[15px] font-medium">
        Key lisensi
        <input
          name="key"
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase())}
          required
          autoFocus
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          placeholder="TRK-XXXX-XXXX-XXXX-XXXX"
          className="h-14 rounded-2xl border border-white/15 bg-black/30 px-4 font-mono text-[17px] tracking-wider outline-none placeholder:text-white/25 focus:border-[var(--site-signal)]"
        />
      </label>
      {state && !state.ok && <p className="text-[14px] text-red-300" role="alert">{state.message}</p>}
      <button type="submit" disabled={pending} className="site-pill w-full disabled:opacity-60">
        {pending && <Loader2 className="size-4 animate-spin" />} Masuk
      </button>
    </form>
  );
}
