// Traktiva license admin panel (vanilla JS, hash routes). Every DB string goes through esc() before HTML.
const $app = document.getElementById("app");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmtDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const fmtTime = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const rupiah = (n) => (n ? `Rp ${new Intl.NumberFormat("id-ID").format(n)}` : "—");
const d = (s) => (s ? fmtDate.format(s * 1000) : "Selamanya");
const t = (s) => (s ? fmtTime.format(s * 1000) : "—");
const nowS = () => Date.now() / 1000;
let me = null;

const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3m-4 4l3 3m-5-1l2 2"/>',
  log: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  pc: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  dl: '<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
};
const icon = (n, cls = "ico") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

// ---------------------------------------------------------------- api & ui helpers

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { "content-type": "application/json" }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({ ok: false, message: "Jawaban server tidak valid." }));
  if (r.status === 401 && path !== "/api/login") {
    me = null;
    renderLogin();
    throw new Error("unauth");
  }
  if (!j.ok) throw new Error(j.message || "Gagal");
  return j;
}
function toast(msg, tone = "ok") {
  const el = document.createElement("div");
  el.className = `toast ${tone}`;
  el.textContent = msg;
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), 3500);
}
const safe = (fn) => async (...a) => {
  try {
    await fn(...a);
  } catch (e) {
    if (e.message !== "unauth") toast(e.message, "bad");
  }
};
const copy = async (text, what = "Disalin") => {
  await navigator.clipboard.writeText(text);
  toast(what);
};

function statusOf(l) {
  if (l.status !== "active") return l.status;
  return l.expires_at && l.expires_at <= nowS() ? "expired" : "active";
}
const STATUS_LABEL = { active: "Aktif", expired: "Kedaluwarsa", suspended: "Ditangguhkan", revoked: "Dicabut", reset: "Direset" };
const badge = (s) => `<span class="badge b-${s}">${STATUS_LABEL[s] ?? esc(s)}</span>`;
const online = (ts) => (ts && nowS() - ts < 600 ? '<span class="badge b-online">Online</span>' : `<span class="muted">${ts ? t(ts) : "Belum pernah"}</span>`);

const EVENT_LABEL = {
  license_created: ["Key dibuat", "ok"], activated: ["Perangkat diaktifkan", "ok"], activate_failed: ["Aktivasi gagal", "bad"],
  license_suspended: ["Ditangguhkan", "warn"], license_active: ["Diaktifkan lagi", "ok"], license_revoked: ["Dicabut", "bad"],
  license_extended: ["Diperpanjang", "ok"], license_edited: ["Diubah", ""], device_reset: ["Perangkat direset", "warn"],
  session_bad_signature: ["Tanda tangan palsu", "bad"], admin_login: ["Admin masuk", ""], admin_login_failed: ["Login admin gagal", "bad"],
  plans_updated: ["Paket diubah", ""], admin_token_issued: ["Token admin dibuat", ""], admin_removed: ["Admin dihapus", "warn"],
};
const FAIL_LABEL = { invalid_key: "key salah", device_limit: "batas perangkat penuh", suspended: "lisensi ditangguhkan", revoked: "lisensi dicabut", expired: "kedaluwarsa" };
function eventRow(e, withKey = true) {
  const [label, tone] = EVENT_LABEL[e.event] ?? [e.event, ""];
  const detail = e.event === "activate_failed" ? FAIL_LABEL[e.detail] ?? e.detail : e.detail;
  const key = withKey && e.license_id ? ` · <a href="#/lisensi/${e.license_id}" class="mono">…${esc(e.key_hint ?? "")}</a>${e.note ? ` <span class="muted">${esc(e.note)}</span>` : ""}` : "";
  return `<div class="ev"><span class="dot ${tone}"></span><div><b>${esc(label)}</b>${key}${detail ? ` <span class="muted">· ${esc(detail)}</span>` : ""}${e.actor ? ` <span class="chip">${esc(e.actor)}</span>` : ""}${e.ip ? ` <span class="muted mono">${esc(e.ip)}</span>` : ""}</div><time>${t(e.at)}</time></div>`;
}

// ---------------------------------------------------------------- shell & routing

const NAV = [["#/", "home", "Ringkasan"], ["#/lisensi", "key", "Lisensi"], ["#/log", "log", "Log"], ["#/pengaturan", "gear", "Pengaturan"]];
function shell(content) {
  const h = location.hash || "#/";
  const on = (href) => (href === "#/" ? h === "#/" || h === "" : h.startsWith(href));
  $app.innerHTML = `<div class="shell">
    <aside class="side">
      <div class="brand"><img src="logo.svg" alt="" /><div>Traktiva<small>Admin lisensi</small></div></div>
      <nav class="nav">${NAV.map(([href, ic, label]) => `<a href="${href}" class="${on(href) ? "on" : ""}">${icon(ic)}${label}</a>`).join("")}</nav>
      <div class="me"><div class="av">${esc(me.slice(0, 2).toUpperCase())}</div><span>${esc(me)}</span><button class="btn sm" id="logout" title="Keluar" style="margin-left:auto">${icon("out")}</button></div>
    </aside>
    <main class="main"><div class="page">${content}</div></main>
  </div>`;
  document.getElementById("logout").onclick = safe(async () => {
    await api("/api/logout", { method: "POST" });
    me = null;
    renderLogin();
  });
}
const loading = () => shell('<div class="empty">Memuat…</div>');

async function router() {
  if (!me) return;
  const h = location.hash || "#/";
  const m = h.match(/^#\/lisensi\/(\d+)/);
  if (m) return pageLicense(Number(m[1]));
  if (h.startsWith("#/lisensi")) return pageLicenses();
  if (h.startsWith("#/log")) return pageLog();
  if (h.startsWith("#/pengaturan")) return pageSettings();
  return pageHome();
}
window.addEventListener("hashchange", safe(router));

// ---------------------------------------------------------------- login

function renderLogin() {
  $app.innerHTML = `<div class="login"><div class="box card">
    <img src="logo.svg" alt="" />
    <div><h1>Admin lisensi Traktiva</h1><p class="muted">Masuk dengan token admin kamu.</p></div>
    <form id="lf"><label class="field">Token admin<input class="input mono" id="tok" type="password" autocomplete="current-password" placeholder="trka_…" autofocus /></label>
    <div class="err" id="lerr"></div><button class="btn primary" type="submit">Masuk</button></form>
    <p class="muted" style="font-size:11px">Token dibuat di server: <span class="mono">node admin.mjs add-admin &lt;nama&gt;</span></p>
  </div></div>`;
  document.getElementById("lf").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api("/api/login", { method: "POST", body: { token: document.getElementById("tok").value } });
      me = r.name;
      router();
    } catch (err) {
      document.getElementById("lerr").textContent = err.message;
    }
  };
}

// ---------------------------------------------------------------- ringkasan

async function pageHome() {
  loading();
  const s = await api("/api/summary");
  const planLine = s.byPlan.length ? s.byPlan.map((p) => `${esc(p.plan)} ${p.n}`).join(" · ") : "Belum ada";
  shell(`<div class="head"><div><h1>Ringkasan</h1><div class="sub">Kondisi lisensi Traktiva saat ini</div></div>
      <div class="right"><button class="btn primary" id="new">${icon("plus")}Buat key</button></div></div>
    <div class="stats">
      <div class="card stat"><div class="k">${icon("key")}Lisensi aktif</div><div class="v num">${s.active}</div><div class="s">${planLine}</div></div>
      <div class="card stat"><div class="k">${icon("pc")}Perangkat online</div><div class="v num">${s.online}</div><div class="s">heartbeat 10 menit terakhir</div></div>
      <div class="card stat"><div class="k">${icon("bolt")}Aktivasi 24 jam</div><div class="v num">${s.activationsToday}</div><div class="s">${s.failedToday ? `${s.failedToday} percobaan gagal` : "tanpa percobaan gagal"}</div></div>
      <div class="card stat"><div class="k">${icon("log")}Perlu perhatian</div><div class="v num">${s.expiringSoon + s.expired}</div><div class="s">${s.expiringSoon} habis ≤ 7 hari · ${s.expired} sudah habis · ${s.suspended} nonaktif</div></div>
    </div>
    <div class="card"><div class="ch">Aktivitas terbaru<a href="#/log" class="muted" style="margin-left:auto;font-weight:400;font-size:12px">Lihat semua</a></div>
      <div class="cb">${s.recent.length ? `<div class="events">${s.recent.map((e) => eventRow(e)).join("")}</div>` : '<div class="empty"><b>Belum ada aktivitas</b>Buat key pertama untuk pembeli.</div>'}</div></div>`);
  document.getElementById("new").onclick = () => openCreate();
}

// ---------------------------------------------------------------- lisensi (daftar)

const FILTERS = [["", "Semua"], ["active", "Aktif"], ["expired", "Kedaluwarsa"], ["suspended", "Ditangguhkan"], ["revoked", "Dicabut"]];
let listState = { q: "", status: "" };
async function pageLicenses() {
  loading();
  const qs = new URLSearchParams(listState).toString();
  const { licenses, plans } = await api(`/api/licenses?${qs}`);
  const planLabel = (id) => plans.find((p) => p.id === id)?.label ?? id;
  shell(`<div class="head"><div><h1>Lisensi</h1><div class="sub">${licenses.length} lisensi${listState.q || listState.status ? " (difilter)" : ""}</div></div>
      <div class="right"><button class="btn primary" id="new">${icon("plus")}Buat key</button></div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <input class="input" id="q" placeholder="Cari catatan pembeli, 4 huruf akhir key, #id, atau nama PC…" value="${esc(listState.q)}" style="flex:1;min-width:240px" />
      <div class="seg">${FILTERS.map(([v, l]) => `<button data-st="${v}" class="${listState.status === v ? "on" : ""}">${l}</button>`).join("")}</div>
    </div>
    <div class="card">${licenses.length ? `<table class="table"><thead><tr><th>#</th><th>Key</th><th>Pembeli / catatan</th><th>Paket</th><th>Status</th><th class="hide-sm">Perangkat</th><th class="hide-sm">Berlaku s/d</th><th class="hide-sm">Terakhir aktif</th></tr></thead><tbody>
      ${licenses.map((l) => `<tr class="link" data-id="${l.id}"><td class="muted num">${l.id}</td><td class="mono">…${esc(l.key_hint)}</td><td>${esc(l.note) || '<span class="muted">—</span>'}</td><td>${esc(planLabel(l.plan))}</td><td>${badge(statusOf(l))}</td><td class="hide-sm num">${l.used}/${l.max_devices}</td><td class="hide-sm">${d(l.expires_at)}</td><td class="hide-sm">${online(l.last_seen)}</td></tr>`).join("")}
      </tbody></table>` : `<div class="empty"><b>${listState.q || listState.status ? "Tidak ada yang cocok" : "Belum ada lisensi"}</b>${listState.q || listState.status ? "Ubah pencarian atau filter." : "Klik Buat key untuk membuat key pertama."}</div>`}</div>`);
  document.getElementById("new").onclick = () => openCreate();
  const q = document.getElementById("q");
  let timer;
  q.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(safe(async () => {
      listState.q = q.value;
      await pageLicenses();
      const el = document.getElementById("q");
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }), 300);
  };
  document.querySelectorAll("[data-st]").forEach((b) => (b.onclick = safe(async () => ((listState.status = b.dataset.st), await pageLicenses()))));
  document.querySelectorAll("tr[data-id]").forEach((tr) => (tr.onclick = () => (location.hash = `#/lisensi/${tr.dataset.id}`)));
}

// ---------------------------------------------------------------- buat key (modal)

function modal(html) {
  const wrap = document.createElement("div");
  wrap.className = "overlay";
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.append(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener("mousedown", (e) => e.target === wrap && close());
  document.addEventListener("keydown", function onKey(e) {
    if (e.key === "Escape") (close(), document.removeEventListener("keydown", onKey));
  });
  return { el: wrap, close };
}

async function openCreate() {
  const { plans } = await api("/api/settings");
  const m = modal(`<div class="mh"><h2>Buat key lisensi</h2><p>Key hanya tampil sekali setelah dibuat. Salin dan kirim ke pembeli.</p></div>
    <form id="cf"><div class="mb">
      <label class="field">Paket<div class="seg" id="plan">${plans.map((p, i) => `<button type="button" data-p="${esc(p.id)}" class="${i === 0 ? "on" : ""}">${esc(p.label)}</button>`).join("")}</div></label>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <label class="field">Masa aktif (hari)<input class="input num" id="days" type="number" min="1" /></label>
        <label class="field">Perangkat<input class="input num" id="devices" type="number" min="1" max="20" /></label>
        <label class="field">Jumlah key<input class="input num" id="count" type="number" min="1" max="200" value="1" /></label>
      </div>
      <label class="field">Catatan pembeli <span class="hint">nama, kontak, atau nomor pesanan — membantu mencari nanti</span><input class="input" id="note" maxlength="200" placeholder="contoh: Budi · WA 0812…" /></label>
    </div><div class="mf"><button type="button" class="btn" id="cancel">Batal</button><button type="submit" class="btn primary" id="go">Buat key</button></div></form>`);
  let plan = plans[0];
  const days = m.el.querySelector("#days");
  const devices = m.el.querySelector("#devices");
  const applyPlan = () => {
    days.value = plan.days ?? "";
    days.disabled = plan.days == null;
    days.placeholder = plan.days == null ? "Selamanya" : "";
    devices.value = plan.devices;
  };
  applyPlan();
  m.el.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => {
    m.el.querySelectorAll("[data-p]").forEach((x) => x.classList.toggle("on", x === b));
    plan = plans.find((p) => p.id === b.dataset.p);
    applyPlan();
  }));
  m.el.querySelector("#cancel").onclick = m.close;
  m.el.querySelector("#cf").onsubmit = safe(async (e) => {
    e.preventDefault();
    const go = m.el.querySelector("#go");
    go.disabled = true;
    try {
      const r = await api("/api/licenses", { method: "POST", body: { plan: plan.id, days: days.value, devices: devices.value, count: m.el.querySelector("#count").value, note: m.el.querySelector("#note").value } });
      showKeys(m, r);
    } finally {
      go.disabled = false;
    }
  });
}

function showKeys(m, r) {
  const all = r.keys.map((k) => k.key).join("\n");
  m.el.querySelector(".modal").innerHTML = `<div class="mh"><h2>${r.keys.length} key dibuat</h2><p>${esc(r.plan)} · ${r.days ? `${r.days} hari` : "selamanya"} · ${r.devices} perangkat</p></div>
    <div class="mb"><div class="warnbox">Simpan sekarang: key tidak bisa dilihat lagi setelah jendela ini ditutup (server hanya menyimpan hash-nya).</div>
    <div class="keys">${r.keys.map((k) => `<div class="keyrow"><span class="mono">${esc(k.key)}</span><button class="btn sm" data-copy="${esc(k.key)}">${icon("copy")}Salin</button></div>`).join("")}</div></div>
    <div class="mf"><button class="btn" id="csv">${icon("dl")}Unduh CSV</button><button class="btn" id="all">${icon("copy")}Salin semua</button><button class="btn primary" id="done">Selesai</button></div>`;
  m.el.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = () => copy(b.dataset.copy, "Key disalin")));
  m.el.querySelector("#all").onclick = () => copy(all, `${r.keys.length} key disalin`);
  m.el.querySelector("#csv").onclick = () => {
    const blob = new Blob([`id,key,paket,hari,perangkat\n${r.keys.map((k) => `${k.id},${k.key},${r.plan},${r.days ?? "selamanya"},${r.devices}`).join("\n")}\n`], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `traktiva-keys-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  m.el.querySelector("#done").onclick = () => (m.close(), router());
}

// ---------------------------------------------------------------- detail lisensi

async function pageLicense(id) {
  loading();
  const { license: l, devices, events, plans } = await api(`/api/licenses/${id}`);
  const st = statusOf(l);
  const planLabel = plans.find((p) => p.id === l.plan)?.label ?? l.plan;
  const left = l.expires_at ? Math.ceil((l.expires_at - nowS()) / 86400) : null;
  shell(`<a href="#/lisensi" class="back">${icon("back")}Semua lisensi</a>
    <div class="head"><div><h1><span class="mono">…${esc(l.key_hint)}</span> <span class="muted" style="font-weight:400">#${l.id}</span></h1><div class="sub">${esc(l.note) || "Tanpa catatan pembeli"}</div></div>
      <div class="right">${badge(st)}</div></div>
    <div class="card kv" style="margin-bottom:12px">
      <div><div class="k">Paket</div><div class="v">${esc(planLabel)}</div></div>
      <div><div class="k">Berlaku s/d</div><div class="v">${d(l.expires_at)}${left != null ? ` <span class="muted" style="font-weight:400">(${left > 0 ? `${left} hari lagi` : "habis"})</span>` : ""}</div></div>
      <div><div class="k">Perangkat</div><div class="v num">${l.used} / ${l.max_devices}</div></div>
      <div><div class="k">Dibuat</div><div class="v">${t(l.created_at)}</div></div>
    </div>
    <div class="card" style="margin-bottom:12px"><div class="ch">Tindakan</div><div class="cb actions">
      <button class="btn" data-ext="30">+30 hari</button><button class="btn" data-ext="365">+1 tahun</button><button class="btn" id="life">Jadikan lifetime</button>
      <button class="btn" id="edit">Ubah catatan / perangkat</button>
      ${l.status === "active" ? '<button class="btn danger" data-st="suspended">Tangguhkan</button>' : '<button class="btn" data-st="active">Aktifkan lagi</button>'}
      ${l.status !== "revoked" ? '<button class="btn danger" data-st="revoked">Cabut permanen</button>' : ""}
    </div></div>
    <div class="grid2">
      <div class="card"><div class="ch">${icon("pc")}Perangkat</div>${devices.length ? `<table class="table"><thead><tr><th>Nama PC</th><th>Versi</th><th>Terakhir aktif</th><th></th></tr></thead><tbody>
        ${devices.map((v) => `<tr><td>${esc(v.name) || '<span class="muted">—</span>'}<div class="muted mono" style="font-size:11px">${esc(v.last_ip ?? "")}</div></td><td class="num">${esc(v.app_version) || "—"}</td><td>${v.status === "active" ? online(v.last_seen) : badge("reset")}</td><td style="text-align:right">${v.status === "active" ? `<button class="btn sm" data-reset="${esc(v.id)}">Reset</button>` : ""}</td></tr>`).join("")}
        </tbody></table>` : '<div class="empty"><b>Belum diaktifkan</b>Key ini belum dipakai di perangkat mana pun.</div>'}</div>
      <div class="card"><div class="ch">${icon("log")}Riwayat</div><div class="cb">${events.length ? `<div class="events">${events.map((e) => eventRow(e, false)).join("")}</div>` : '<div class="empty">Belum ada riwayat</div>'}</div></div>
    </div>`);
  const act = safe(async (body, ok) => {
    await api(`/api/licenses/${id}`, { method: "POST", body });
    toast(ok);
    await pageLicense(id);
  });
  document.querySelectorAll("[data-ext]").forEach((b) => (b.onclick = () => act({ action: "extend", days: Number(b.dataset.ext) }, `Diperpanjang ${b.textContent}`)));
  document.getElementById("life").onclick = () => confirmBox("Jadikan lisensi ini lifetime?", "Lisensi tidak akan pernah kedaluwarsa.", "Jadikan lifetime", () => act({ action: "lifetime" }, "Sekarang lifetime"));
  document.querySelectorAll("[data-st]").forEach((b) => (b.onclick = () => {
    const s = b.dataset.st;
    const text = { suspended: ["Tangguhkan lisensi?", "App pembeli terkunci di heartbeat berikutnya (≤ 5 menit). Bisa diaktifkan lagi kapan saja."], revoked: ["Cabut permanen?", "Key ini tidak bisa dipakai lagi selamanya. Untuk berhenti sementara, pakai Tangguhkan."], active: ["Aktifkan lagi?", "Pembeli bisa memakai app lagi."] }[s];
    confirmBox(text[0], text[1], b.textContent, () => act({ action: "status", status: s }, STATUS_LABEL[s]), s !== "active");
  }));
  document.querySelectorAll("[data-reset]").forEach((b) => (b.onclick = () => confirmBox("Reset perangkat ini?", "Slotnya kosong lagi dan pembeli bisa mengaktifkan key di PC lain. App di PC ini terkunci.", "Reset", safe(async () => {
    await api(`/api/devices/${b.dataset.reset}/reset`, { method: "POST" });
    toast("Perangkat direset");
    await pageLicense(id);
  }), true)));
  document.getElementById("edit").onclick = () => {
    const m = modal(`<div class="mh"><h2>Ubah lisensi #${l.id}</h2></div><form id="ef"><div class="mb">
      <label class="field">Catatan pembeli<input class="input" id="en" maxlength="200" value="${esc(l.note ?? "")}" /></label>
      <label class="field">Jumlah perangkat<input class="input num" id="ed" type="number" min="1" max="20" value="${l.max_devices}" /></label>
    </div><div class="mf"><button type="button" class="btn" id="ec">Batal</button><button class="btn primary">Simpan</button></div></form>`);
    m.el.querySelector("#ec").onclick = m.close;
    m.el.querySelector("#ef").onsubmit = (e) => {
      e.preventDefault();
      act({ action: "edit", note: m.el.querySelector("#en").value, devices: m.el.querySelector("#ed").value }, "Disimpan");
      m.close();
    };
  };
}

function confirmBox(title, text, label, onOk, danger = false) {
  const m = modal(`<div class="mh"><h2>${esc(title)}</h2><p>${esc(text)}</p></div><div class="mf"><button class="btn" id="no">Batal</button><button class="btn ${danger ? "danger" : "primary"}" id="yes">${esc(label)}</button></div>`);
  m.el.querySelector("#no").onclick = m.close;
  m.el.querySelector("#yes").onclick = () => (m.close(), onOk());
}

// ---------------------------------------------------------------- log

async function pageLog() {
  loading();
  const { events } = await api("/api/audit");
  shell(`<div class="head"><div><h1>Log</h1><div class="sub">100 kejadian terakhir: aktivasi, gagal aktivasi, perubahan oleh admin</div></div></div>
    <div class="card"><div class="cb">${events.length ? `<div class="events">${events.map((e) => eventRow(e)).join("")}</div>` : '<div class="empty">Belum ada kejadian</div>'}</div></div>`);
}

// ---------------------------------------------------------------- pengaturan

async function pageSettings() {
  loading();
  const { plans, admins } = await api("/api/settings");
  shell(`<div class="head"><div><h1>Pengaturan</h1><div class="sub">Paket yang dijual dan akun admin</div></div></div>
    <div class="card" style="margin-bottom:12px"><div class="ch">Paket</div><form id="pf"><table class="table"><thead><tr><th>ID</th><th>Nama</th><th>Masa aktif (hari)</th><th>Perangkat</th><th>Harga (Rp)</th></tr></thead><tbody>
      ${plans.map((p, i) => `<tr data-i="${i}"><td class="mono muted">${esc(p.id)}</td><td><input class="input" name="label" value="${esc(p.label)}" style="width:140px" /></td><td><input class="input num" name="days" type="number" min="1" value="${p.days ?? ""}" placeholder="Selamanya" style="width:120px" /></td><td><input class="input num" name="devices" type="number" min="1" max="20" value="${p.devices}" style="width:90px" /></td><td><input class="input num" name="price" type="number" min="0" step="1000" value="${p.price || ""}" placeholder="belum diisi" style="width:140px" /></td></tr>`).join("")}
    </tbody></table><div class="cb" style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border)"><span class="muted" style="font-size:12px">Kosongkan masa aktif untuk lifetime. Harga dipakai web pembeli nanti.</span><button class="btn primary">Simpan paket</button></div></form></div>
    <div class="card"><div class="ch">Admin</div><table class="table"><thead><tr><th>Nama</th><th>Dibuat</th><th>Login terakhir</th></tr></thead><tbody>
      ${admins.map((a) => `<tr><td>${esc(a.name)}${a.name === me ? ' <span class="chip">kamu</span>' : ""}</td><td>${t(a.created_at)}</td><td>${t(a.last_login)}</td></tr>`).join("")}
    </tbody></table><div class="cb muted" style="font-size:12px;border-top:1px solid var(--border)">Tambah / ganti token admin di server: <span class="mono">node admin.mjs add-admin &lt;nama&gt;</span> · hapus: <span class="mono">remove-admin &lt;nama&gt;</span></div></div>`);
  document.getElementById("pf").onsubmit = safe(async (e) => {
    e.preventDefault();
    const rows = [...document.querySelectorAll("#pf tr[data-i]")].map((tr) => {
      const p = plans[Number(tr.dataset.i)];
      const v = (n) => tr.querySelector(`[name=${n}]`).value;
      return { id: p.id, label: v("label"), days: v("days") || null, devices: v("devices"), price: v("price") || 0 };
    });
    await api("/api/settings", { method: "POST", body: { plans: rows } });
    toast("Paket disimpan");
  });
}

// ---------------------------------------------------------------- boot

(async () => {
  try {
    me = (await api("/api/me")).name;
    router();
  } catch {
    if (!me) renderLogin();
  }
})();
