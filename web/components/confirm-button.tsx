"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Result = { ok: boolean; message?: string } | null | void;

/**
 * A button that asks first. Modals on the website are only for this: confirming an action that changes something
 * (release a PC, sign devices out). Everything else lives on its own page.
 */
export function ConfirmButton({ children, title, description, confirmLabel, destructive = false, done, onConfirm, variant = "outline", size = "sm", className }: {
  children: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** toast after success (the action's own message wins) */
  done?: string;
  onConfirm: () => Promise<Result>;
  variant?: "outline" | "ghost" | "default" | "destructive";
  size?: "sm" | "default";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      const r = await onConfirm();
      if (r && !r.ok) return void toast.error(r.message ?? "Gagal");
      if (r?.message || done) toast.success(r?.message || done);
      setOpen(false);
    });
  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)} className={className}>{children}</Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Batal</Button>
            <Button variant={destructive ? "destructive" : "default"} onClick={go} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
