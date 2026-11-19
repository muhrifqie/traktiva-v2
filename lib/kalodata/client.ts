import {
  KaloCreator,
  KaloShopeeProduct,
  KaloTopProduct,
  KaloTopVideo,
  KaloEnvelope,
  KaloError,
  KaloFailureCause,
  KaloFullTextProduct,
  KaloHistoryPoint,
  KaloLastDay,
  KaloMembership,
  KaloProduct,
  KaloProductInfo,
  KaloProductTotal,
  KaloSession,
  KaloVideo,
} from "./types";
import { DEFAULT_UA } from "./signup";

const BASE = "https://www.kalodata.com";

/** Opsi global client. */
export interface KaloClientOptions {
  /** Satu atau beberapa sesi login. >1 = rotasi otomatis saat kuota habis. */
  sessions: KaloSession[];
  /** Mata uang respons (default "IDR"). */
  currency?: string;
  /** Kode negara data (default "ID"). */
  country?: string;
  /** Bahasa respons (default "en-US"). */
  language?: string;
  /** Jeda minimal antar request dalam ms (default 2500). Hindari rate-limit. */
  minDelayMs?: number;
  /** Jitter acak ditambahkan ke jeda, ms (default 2000). */
  jitterMs?: number;
  /** fetch kustom (buat suntik proxy/testing). Default global fetch. */
  fetchFn?: typeof fetch;
}

/** Rentang tanggal [startDate, endDate], format "YYYY-MM-DD". */
export interface DateRange {
  startDate: string;
  endDate: string;
}

/**
 * Client API Kalodata dengan rotasi multi-sesi.
 *
 * Auth Kalodata = cookie `SESSION` (berlaku ~15 hari), tanpa request signing.
 * Kuota diikat ke akun (userId), jadi satu-satunya cara menambah throughput
 * adalah merotasi beberapa cookie `SESSION`. Begitu satu sesi kena kuota
 * (FILTER.CUSTOM_TIMES / DETAIL.ACCESS_TIMES), client pindah ke sesi berikut.
 *
 * Catatan: endpoint di-reverse dari traffic browser, bukan API resmi. Pakai
 * untuk akun milik sendiri. Kalodata bisa mem-ban kalau pola scraping kasar —
 * jaga jeda antar request dan jangan burst.
 *
 * @example
 * const kalo = new KaloClient({ sessions: [{ sessionCookie: "eyJ..." }] });
 * const latest = await kalo.allLastDay();         // tanggal data terbaru
 * const hits = await kalo.fullTextSearch("microphone"); // bebas kuota filter
 */
export class KaloClient {
  private readonly opt: Required<Omit<KaloClientOptions, "fetchFn">> & { fetchFn: typeof fetch };
  /** Index sesi aktif saat ini. */
  private cursor = 0;
  /** Sesi yang sudah kena kuota hari ini → di-skip sampai reset. */
  private readonly exhausted = new Set<number>();
  private lastRequestAt = 0;

  constructor(options: KaloClientOptions) {
    if (!options.sessions?.length) throw new KaloError("Minimal satu sesi diperlukan.", "auth");
    this.opt = {
      sessions: options.sessions,
      currency: options.currency ?? "IDR",
      country: options.country ?? "ID",
      language: options.language ?? "en-US",
      minDelayMs: options.minDelayMs ?? 2500,
      jitterMs: options.jitterMs ?? 2000,
      fetchFn: options.fetchFn ?? fetch,
    };
  }

  // ----------------------------------------------------------------- endpoint publik

  /** Tanggal data terbaru per negara. Panggil ini dulu untuk menentukan endDate. */
  async allLastDay(): Promise<KaloLastDay[]> {
    return this.request<KaloLastDay[]>("GET", "/api/allLastDay");
  }

  /** Tanggal data terbaru untuk satu negara (default negara client). */
  async latestDate(country = this.opt.country): Promise<string> {
    const all = await this.allLastDay();
    const row = all.find((r) => r.country === country);
    if (!row) throw new KaloError(`Negara ${country} tidak ada di allLastDay.`, "unknown");
    return row.lastDay;
  }

  /** Rentang 30 hari terakhir (endDate = data terbaru, startDate = 29 hari sebelumnya). */
  async last30Days(country = this.opt.country): Promise<DateRange> {
    const end = await this.latestDate(country);
    const d = new Date(`${end}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 29);
    return { startDate: d.toISOString().slice(0, 10), endDate: end };
  }

  /** Status langganan sesi aktif. */
  async membership(): Promise<KaloMembership> {
    return this.request<KaloMembership>("POST", "/user/queryMembership", {});
  }

  /**
   * Full-text search produk. Ini jalur paling tahan kuota filter: tetap jalan
   * saat FILTER.CUSTOM_TIMES sudah habis. Tapi hanya mengembalikan nama + GMV 30 hari,
   * bukan metrik lengkap. Maks ~500 hasil per keyword (pageNo 1..5, pageSize 100).
   *
   * @param keyword kata kunci
   * @param pageNo  halaman (1-based)
   * @param pageSize jumlah per halaman (maks 100)
   */
  async fullTextSearch(keyword: string, pageNo = 1, pageSize = 100): Promise<KaloFullTextProduct[]> {
    const data = await this.request<{ product?: KaloFullTextProduct[] }>(
      "POST",
      "/overview/fullText/search",
      {
        country_code: this.opt.country.toLowerCase(),
        keyword,
        scope: [{ index: "product", pageNo, pageSize }],
      },
    );
    return data.product ?? [];
  }

  /**
   * Ambil semua hasil full-text search beberapa keyword, dedup by product_id.
   * Berhenti sendiri saat halaman kosong atau < pageSize.
   */
  async collectProducts(
    keywords: string[],
    opts: { maxPages?: number; pageSize?: number } = {},
  ): Promise<Map<string, KaloFullTextProduct>> {
    const { maxPages = 5, pageSize = 100 } = opts;
    const out = new Map<string, KaloFullTextProduct>();
    for (const kw of keywords) {
      for (let p = 1; p <= maxPages; p++) {
        const list = await this.fullTextSearch(kw, p, pageSize);
        if (!list.length) break;
        for (const x of list) if (!out.has(x.product_id)) out.set(x.product_id, x);
        if (list.length < pageSize) break;
      }
    }
    return out;
  }

  /**
   * Ranking produk dengan filter kategori/sort. KENA kuota FILTER.CUSTOM_TIMES
   * dan batas pagination paket. Pakai saat butuh metrik lengkap (revenue_trend, dll).
   *
   * @param range rentang tanggal
   * @param opts  cateIds, pageNo, pageSize, sort, query (untuk /searchList)
   */
  async productList(
    range: DateRange,
    opts: {
      cateIds?: number[];
      pageNo?: number;
      pageSize?: number;
      sortField?: string;
      sortType?: "DESC" | "ASC";
      /** Kalau diisi → pakai /product/searchList (cari by kata kunci). */
      query?: string;
    } = {},
  ): Promise<KaloProduct[]> {
    const { cateIds = [], pageNo = 1, pageSize = 10, sortField = "revenue", sortType = "DESC", query } = opts;
    const body = {
      country: this.opt.country,
      startDate: range.startDate,
      endDate: range.endDate,
      cateIds,
      showCateIds: cateIds,
      pageNo,
      pageSize,
      sort: [{ field: sortField, type: sortType }],
      ...(query ? { query } : {}),
    };
    return this.request<KaloProduct[]>("POST", query ? "/product/searchList" : "/product/queryList", body);
  }

  /** Metrik total satu produk. KENA kuota DETAIL.ACCESS_TIMES. */
  async productTotal(id: string, range: DateRange): Promise<KaloProductTotal> {
    return this.request<KaloProductTotal>("POST", "/product/detail/total", {
      id,
      startDate: range.startDate,
      endDate: range.endDate,
      authority: true,
    });
  }

  /** Tren harian satu produk. KENA kuota DETAIL.ACCESS_TIMES. */
  async productHistory(id: string, range: DateRange): Promise<KaloHistoryPoint[]> {
    return this.request<KaloHistoryPoint[]>("POST", "/product/detail/history", {
      id,
      startDate: range.startDate,
      endDate: range.endDate,
      authority: true,
    });
  }

  /** Daftar video yang menjual produk, urut revenue. KENA kuota DETAIL.ACCESS_TIMES. */
  async productVideos(id: string, range: DateRange, pageNo = 1, pageSize = 10): Promise<KaloVideo[]> {
    return this.request<KaloVideo[]>("POST", "/product/detail/video/queryList", {
      id,
      startDate: range.startDate,
      endDate: range.endDate,
      authority: true,
      pageNo,
      pageSize,
      sort: [{ field: "revenue", type: "DESC" }],
    });
  }

  /** Daftar kreator yang menjual produk, urut revenue. KENA kuota DETAIL.ACCESS_TIMES. */
  async productCreators(id: string, range: DateRange, pageNo = 1, pageSize = 10): Promise<KaloCreator[]> {
    return this.request<KaloCreator[]>("POST", "/product/detail/creator/queryList", {
      id,
      startDate: range.startDate,
      endDate: range.endDate,
      authority: true,
      pageNo,
      pageSize,
      sort: [{ field: "revenue", type: "DESC" }],
    });
  }

  /** Link MP4 video (berlaku terbatas waktu — `key` + `time` kedaluwarsa). */
  async videoUrl(videoId: string): Promise<string> {
    const data = await this.request<{ url: string }>(
      "GET",
      `/video/detail/getVideoUrl?videoId=${encodeURIComponent(videoId)}`,
    );
    return data.url;
  }

  /** Info produk lengkap: brand, toko, rating, ulasan, komisi, rentang harga (kena DETAIL.ACCESS_TIMES). */
  async productInfo(id: string, range: DateRange): Promise<KaloProductInfo> {
    return this.request<KaloProductInfo>("POST", "/product/detail", { id, ...range, authority: true });
  }

  /** Semua foto produk (URL CDN Kalodata). */
  async productImages(id: string): Promise<string[]> {
    return this.request<string[]>("GET", `/product/detail/getImages?productId=${encodeURIComponent(id)}`);
  }

  /** Cari ID kategori dari kata kunci (buat dipakai di productList.cateIds). */
  async searchCategory(keyword: string): Promise<{ id: number; name: string; score: number }[]> {
    return this.request("POST", "/category/searchByKeyword", { keyword });
  }

  /** Overview ranking: produk terlaris satu negara (halaman Explore → Top Products). */
  async productTops(range: DateRange, pageSize = 20, pageNo = 1): Promise<KaloTopProduct[]> {
    return this.request("POST", "/overview/rank/queryProductTops", { ...range, pageNo, pageSize });
  }

  /** Overview ranking: video jualan terlaris satu negara (lintas produk). */
  async videoTops(range: DateRange, pageSize = 20, pageNo = 1): Promise<KaloTopVideo[]> {
    return this.request("POST", "/overview/rank/queryVideoTops", { ...range, pageNo, pageSize });
  }

  /** Periode data Shopee yang tersedia (mingguan; "L1W" = minggu terakhir). */
  async shopeeRanges(): Promise<{ label: string; value: string; weekStart: string; weekEnd: string }[]> {
    return this.request("GET", "/shopee/dataRange");
  }

  /** Kategori Shopee level 1. */
  async shopeeCategories(): Promise<{ id: string; label: string }[]> {
    return this.request("POST", "/shopee/categories/initFirstTree");
  }

  /** Produk Shopee terlaris (negara = header country). */
  async shopeeProducts(opts: { dataRange?: string; keyword?: string; cateIds?: string[]; pageSize?: number; sortField?: "unitsSold" | "revenue" } = {}): Promise<KaloShopeeProduct[]> {
    const { dataRange = "L1W", keyword = "", cateIds = [], pageSize = 10, sortField = "unitsSold" } = opts;
    const r = await this.request<{ data: KaloShopeeProduct[] }>("POST", "/shopee/product/pageList", {
      cateIds, dataRange, keyword, pageNo: 1, pageSize, sort: { field: sortField, type: "DESC" }, searchWay: "VAGUE",
    });
    return r.data ?? [];
  }

  // ----------------------------------------------------------------- internal

  /** Jumlah sesi yang masih punya kuota hari ini. */
  get liveSessionCount(): number {
    return this.opt.sessions.length - this.exhausted.size;
  }

  /** Reset penanda kuota habis (panggil saat ganti hari). */
  resetQuota(): void {
    this.exhausted.clear();
  }

  private async throttle(): Promise<void> {
    const wait = this.opt.minDelayMs + Math.random() * this.opt.jitterMs;
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < wait) await new Promise((r) => setTimeout(r, wait - elapsed));
    this.lastRequestAt = Date.now();
  }

  /** Pilih sesi aktif berikutnya yang belum kena kuota. */
  private pickSession(): number {
    const n = this.opt.sessions.length;
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % n;
      if (!this.exhausted.has(idx)) {
        this.cursor = idx;
        return idx;
      }
    }
    throw new KaloError("Semua sesi kehabisan kuota hari ini.", "quota");
  }

  /**
   * Kirim request. Saat sesi aktif kena kuota, tandai habis lalu coba sesi lain
   * dengan request yang sama. Error non-kuota langsung dilempar.
   */
  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    let lastErr: KaloError | null = null;
    // Coba setiap sesi yang masih hidup, sekali masing-masing.
    for (let attempt = 0; attempt < this.opt.sessions.length; attempt++) {
      const idx = this.pickSession();
      await this.throttle();
      try {
        return await this.send<T>(method, path, body, this.opt.sessions[idx]);
      } catch (e) {
        if (e instanceof KaloError && (e.kind === "quota" || e.kind === "pagination")) {
          // Pagination = batas paket; kuota = jatah harian. Keduanya per-akun → coba akun lain.
          this.exhausted.add(idx);
          this.cursor = (idx + 1) % this.opt.sessions.length;
          lastErr = e;
          continue;
        }
        throw e;
      }
    }
    throw lastErr ?? new KaloError("Request gagal di semua sesi.", "quota");
  }

  /** Satu HTTP call mentah ke Kalodata. */
  private async send<T>(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    session: KaloSession,
  ): Promise<T> {
    const res = await this.opt.fetchFn(BASE + path, {
      method,
      headers: {
        // Kalodata binds SESSION to the device it was created on: resend the same device cookies.
        cookie: [
          `SESSION=${session.sessionCookie}`,
          ...(session.extraCookies
            ? [session.extraCookies]
            : session.deviceId
              ? [`deviceId=${session.deviceId}`, "deviceType=WEB", "appVersion=1.0.0"]
              : []),
        ].join("; "),
        language: this.opt.language,
        currency: this.opt.currency,
        country: this.opt.country,
        accept: "application/json, text/plain, */*",
        "content-type": "application/json",
        origin: BASE,
        referer: BASE + "/product",
        "user-agent": session.userAgent ?? DEFAULT_UA, // never Node's default UA (flagged as a bot)
      },
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
    });

    if (res.status === 401 || res.status === 403) {
      throw new KaloError(`Sesi ${session.label ?? ""} ditolak (${res.status}).`, "auth", undefined, res.status);
    }
    if (!res.ok && res.status >= 500) {
      throw new KaloError(`HTTP ${res.status} dari ${path}.`, "http", undefined, res.status);
    }

    let env: KaloEnvelope<T>;
    try {
      env = (await res.json()) as KaloEnvelope<T>;
    } catch {
      throw new KaloError(`Respons ${path} bukan JSON valid.`, "parse", undefined, res.status);
    }

    if (env.success && env.data != null) return env.data;

    // Gagal: parse { message, cause } dari field message (JSON string).
    const { message, cause } = parseFailure(env.message);
    if (cause === "FILTER.CUSTOM_TIMES" || cause === "DETAIL.ACCESS_TIMES" || /times|quota|upgrade/i.test(message)) {
      throw new KaloError(message || "Kuota habis.", "quota", cause);
    }
    if (cause === "PRODUCT.LIST" || /pagination limit/i.test(message)) {
      throw new KaloError(message || "Melebihi batas pagination paket.", "pagination", cause);
    }
    throw new KaloError(message || `Kalodata menolak ${path}.`, "unknown", cause);
  }
}

/** Urai field message Kalodata (JSON string) jadi { message, cause }. */
function parseFailure(raw: string | null): { message: string; cause?: KaloFailureCause } {
  if (!raw) return { message: "" };
  try {
    const o = JSON.parse(raw) as { message?: string; cause?: string };
    return { message: o.message ?? raw, cause: o.cause };
  } catch {
    return { message: raw };
  }
}

/**
 * Ubah angka terformat Kalodata ("Rp52.85b", "1.07m", "572.87k") jadi number.
 * b = miliar, m = juta, k = ribu. Berguna kalau hanya punya field string.
 */
export function parseKaloNumber(s: string | number | null | undefined): number {
  if (typeof s === "number") return s;
  if (!s) return 0;
  const m = s.replace(/[^\d.,a-zA-Z]/g, "").match(/([\d.,]+)\s*([bmk])?/i);
  if (!m) return 0;
  const n = Number(m[1].replace(/,/g, ""));
  const mult = { b: 1e9, m: 1e6, k: 1e3 }[(m[2] || "").toLowerCase()] ?? 1;
  return Math.round(n * mult);
}
