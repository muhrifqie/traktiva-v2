"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  const [username, setUsername] = useState(""); // controlled: survives the form reset after a failed login
  return (
    <form action={action} className="space-y-3 text-left">
      <label className="grid gap-1.5 text-xs font-medium">
        Username
        <Input name="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus required maxLength={40} className="h-10" />
      </label>
      <label className="grid gap-1.5 text-xs font-medium">
        Password
        <Input name="password" type="password" autoComplete="current-password" required maxLength={200} className="h-10" />
      </label>
      {state && !state.ok && <p className="text-xs text-destructive">{state.message}</p>}
      <Button type="submit" disabled={pending} className="h-10 w-full">
        {pending && <Loader2 className="animate-spin" />} Masuk
      </Button>
    </form>
  );
}
