import { redirect } from "next/navigation";

/** The installer and update history moved to Panduan, the app status per PC to Ringkasan. Old links land here. */
export default function Apps() {
  redirect("/bantuan#download");
}
