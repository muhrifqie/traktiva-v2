"use client";

import { useEffect, useState } from "react";
import { CircleHelp, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Themed replacement for window.confirm(): `if (await confirmDialog({...})) doIt()`.
// One <ConfirmHost/> lives in the root layout; callers just await the promise.

type Options = { title: string; description?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type Request = Options & { resolve: (ok: boolean) => void };

let show: ((r: Request) => void) | null = null;

export function confirmDialog(opts: Options): Promise<boolean> {
  return new Promise((resolve) => {
    if (show) show({ ...opts, resolve });
    else resolve(false); // host not mounted yet: treat as "cancel" (never fall back to the browser's native dialog)
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState<Request | null>(null);
  useEffect(() => {
    show = setReq;
    return () => {
      show = null;
    };
  }, []);

  const close = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };
  const Icon = req?.danger ? Trash2 : CircleHelp;

  return (
    <Dialog open={!!req} onOpenChange={(o) => !o && close(false)}>
      <DialogContent showCloseButton={false} className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="flex gap-3.5 p-5">
          <span className={`grid size-10 shrink-0 place-items-center rounded-full ${req?.danger ? "bg-destructive/12 text-destructive" : "bg-primary/12 text-brand-light"}`}>
            <Icon className="size-5" />
          </span>
          <DialogHeader className="min-w-0 gap-1 text-left">
            <DialogTitle className="text-[15px] leading-snug">{req?.title}</DialogTitle>
            {req?.description && <DialogDescription className="text-[13px] leading-relaxed">{req.description}</DialogDescription>}
          </DialogHeader>
        </div>
        <DialogFooter className="m-0 flex-row justify-end gap-2 border-t bg-muted/40 px-5 py-3">
          <button type="button" onClick={() => close(false)} className="flex h-9 items-center rounded-lg border bg-background px-3.5 text-[13px] font-medium hover:bg-accent">
            {req?.cancelLabel ?? "Batal"}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => close(true)}
            className={`flex h-9 items-center rounded-lg px-3.5 text-[13px] font-medium text-white ${req?.danger ? "bg-destructive hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
          >
            {req?.confirmLabel ?? (req?.danger ? "Hapus" : "Lanjut")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
