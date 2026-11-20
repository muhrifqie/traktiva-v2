const $ = (id) => document.getElementById(id);
const input = $("key");
const submit = $("submit");
const error = $("error");
const ALPHABET = /[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g; // matches the server's key alphabet

/** Any paste/typing → TRK-XXXX-XXXX-XXXX-XXXX. */
function format(raw) {
  let s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.startsWith("TRK")) s = s.slice(3);
  s = s.replace(ALPHABET, "").slice(0, 16);
  const groups = s.match(/.{1,4}/g) ?? [];
  return groups.length ? `TRK-${groups.join("-")}` : "";
}
const complete = () => /^TRK(-[A-Z2-9]{4}){4}$/.test(input.value);

function showError(message, tone = "error") {
  error.textContent = message ?? "";
  error.hidden = !message;
  error.classList.toggle("warn", tone === "warn");
  input.setAttribute("aria-invalid", message && tone === "error" ? "true" : "false");
}
function setBusy(busy, label) {
  submit.classList.toggle("busy", busy);
  submit.disabled = busy || !complete();
  input.disabled = busy;
  $("submit-label").textContent = label ?? (busy ? "Memeriksa…" : "Aktifkan");
}

input.addEventListener("input", () => {
  const pos = input.selectionStart === input.value.length;
  input.value = format(input.value);
  if (pos) input.setSelectionRange(input.value.length, input.value.length);
  submit.disabled = !complete();
  if (!error.hidden) showError("");
});

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!complete()) return;
  setBusy(true);
  showError("");
  const r = await window.traktiva.activate(input.value);
  if (r.ok) {
    setBusy(true, "Berhasil, membuka Traktiva…");
    return;
  }
  setBusy(false);
  showError(r.message || "Aktivasi gagal. Coba lagi.", r.offline ? "warn" : "error");
  input.focus();
});

$("retry").addEventListener("click", async () => {
  $("retry").disabled = true;
  $("retry").textContent = "Menghubungkan…";
  const r = await window.traktiva.retry();
  $("retry").disabled = false;
  $("retry").textContent = "Coba lagi";
  if (!r.ok) showError(r.message, r.offline ? "warn" : "error");
});

// locked (hardware changed, license suspended…): switch to another key right here
$("other").addEventListener("click", () => {
  $("form").querySelectorAll(".label, input, #hint, #submit").forEach((el) => (el.hidden = false));
  $("retry").hidden = $("other").hidden = true;
  $("title").textContent = "Pakai key lain";
  $("subtitle").textContent = "Masukkan key lisensi yang ingin dipakai di PC ini.";
  showError("");
  input.focus();
});

$("min").addEventListener("click", () => window.traktiva.minimize());
$("quit").addEventListener("click", () => window.traktiva.quit());

// main tells us why we are here: first activation, or locked (offline / suspended / reset)
window.traktiva.onLicense((s) => {
  if (s.device) $("device").textContent = s.device;
  const needKey = s.needKey !== false;
  $("title").textContent = needKey ? "Aktifkan Traktiva" : "Traktiva terkunci";
  $("subtitle").textContent = needKey ? "Masukkan key lisensi dari penjual." : "Lisensi perlu diperiksa ulang sebelum aplikasi bisa dipakai.";
  $("form").querySelectorAll(".label, input, #hint, #submit").forEach((el) => (el.hidden = !needKey));
  $("retry").hidden = needKey;
  $("other").hidden = needKey;
  if (s.message && s.error !== "not_activated") showError(s.message, s.offline ? "warn" : "error");
  if (needKey) input.focus();
});
