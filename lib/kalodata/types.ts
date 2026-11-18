// Tipe untuk respons API Kalodata (www.kalodata.com).
// Kalodata = analitik TikTok Shop. Semua endpoint di-reverse dari traffic browser;
// tidak ada dokumentasi resmi, jadi field bisa berubah sewaktu-waktu.

/** Amplop standar semua respons Kalodata. */
export interface KaloEnvelope<T> {
  success: boolean;
  data: T | null;
  /** Saat gagal: JSON string berisi { message, cause, actionType }. */
  message: string | null;
  cached: boolean | null;
  code: string | null;
  errorCategory?: "BUSINESS" | "SYSTEM" | "VALIDATION" | string;
}

/** Penyebab kegagalan yang kita kenali, dari field `cause` di message. */
export type KaloFailureCause =
  | "FILTER.CUSTOM_TIMES" // kuota query/search harian habis
  | "PRODUCT.LIST" // pagination melebihi batas paket (pageSize/pageNo)
  | "DETAIL.ACCESS_TIMES" // kuota buka detail harian habis
  | (string & {});

/** Tanggal data terbaru per negara (GET /api/allLastDay). */
export interface KaloLastDay {
  country: string; // kode ISO, mis. "ID"
  lastDay: string; // "YYYY-MM-DD"
}

/** Status langganan (POST /user/queryMembership). */
export interface KaloMembership {
  userId: number;
  level: "trial" | "basic" | "pro" | "enterprise" | (string & {});
  day: number; // sisa hari
  expired: boolean;
  grade: number;
}

/** Satu produk dari full-text search (POST /overview/fullText/search). */
export interface KaloFullTextProduct {
  product_id: string;
  product_name: string;
  /** Estimasi GMV 30 hari (angka, bukan string terformat). */
  gmv_in_30: number;
  score: number;
}

/** Satu produk dari ranking (POST /product/queryList, /searchList). */
export interface KaloProduct {
  id: string;
  product_title: string;
  /** GMV periode, terformat mata uang mis. "Rp52.85b". */
  revenue: string;
  /** GMV mentah (angka) bila tersedia. */
  gmv_A?: number;
  sale: number;
  unit_price: string;
  creator_num: number;
  /** Tren revenue harian 30 titik (angka mentah). */
  revenue_trend?: number[];
  delivery_type?: string;
  [k: string]: unknown; // field lain banyak; biarkan longgar
}

/** Metrik total produk (POST /product/detail/total). */
export interface KaloProductTotal {
  revenue: string;
  sale: string;
  video_revenue: string;
  live_revenue: string;
  shopping_mall_revenue: string;
  unit_price: string;
  related_creator_count: number;
  original_revenue: number;
  [k: string]: unknown;
}

/** Info produk lengkap (POST /product/detail). Ditemukan dari HAR 2026-11-18. */
export interface KaloProductInfo {
  product_title: string;
  brand_name?: string;
  name?: string; // nama toko
  seller_type?: string; // "BRAND" | ...
  product_rating?: number;
  shop_rating?: string;
  product_review_count?: number;
  commission_rate?: string; // "7%"
  min_real_price?: string;
  max_real_price?: string;
  min_original_price?: string;
  max_original_price?: string;
  shipping_fee?: string;
  creator_gmv_concentration?: string;
  is_affiliate?: number;
  [k: string]: unknown;
}

/** Satu baris tren harian (POST /product/detail/history). */
export interface KaloHistoryPoint {
  partition_day: string; // "YYYY-MM-DD"
  revenue: number;
  sale: number;
  video_revenue: number;
  live_revenue: number;
  unit_price: number;
  creatorConversionRatio: number;
}

/** Satu video yang menjual produk (POST /product/detail/video/queryList). */
export interface KaloVideo {
  id: string; // ID video TikTok asli
  revenue: string;
  views: string;
  sale: string;
  description: string;
  create_time: string;
  duration: string;
  handle?: string;
}

/** Satu kreator yang menjual produk (POST /product/detail/creator/queryList). */
/** Satu baris ranking produk (POST /overview/rank/queryProductTops). Angka uang sudah diformat sesuai header currency. */
export interface KaloTopProduct {
  id: string;
  product_title: string;
  revenue: string;
  sale: number;
  unit_price: string;
  creator_num: number;
  commission_rate: string;
  launch_date?: string;
  revenue_trend?: number[];
}

/** Satu baris ranking video (POST /overview/rank/queryVideoTops). */
export interface KaloTopVideo {
  id: string;
  description: string;
  duration: string;
  original_duration?: number;
  revenue: string;
  views: number;
  sale: number;
  handle?: string;
  follower_count?: number;
  ad?: number; // 1 = dipromosikan (iklan)
  ad_revenue_ratio?: string;
  ai_video?: number;
  product_id?: string;
  product_title?: string;
}

/** Satu produk Shopee terlaris (POST /shopee/product/pageList). */
export interface KaloShopeeProduct {
  pid: string;
  imageUrl: string;
  productName: string;
  shopName: string;
  shopLocation?: string;
  historicalSold: string;
  revenue: string;
  rating: number;
  ratingCount: string;
  price: string;
  cateNames: string[];
  productUrl: string;
  unitsSold?: string;
}

export interface KaloCreator {
  id: string;
  nickname: string;
  handle: string;
  revenue: string;
  sale: string;
  followers: number;
  video_revenue: string;
  live_revenue: string;
}

/** Konfigurasi satu sesi login Kalodata. */
export interface KaloSession {
  /** Nilai cookie `SESSION` (hasil login Google OAuth). Wajib. */
  sessionCookie: string;
  /** Label buat log/rotasi, mis. "akun-1". Opsional. */
  label?: string;
  /** User-Agent yang dipakai saat login (biar fingerprint konsisten). Opsional. */
  userAgent?: string;
  /** deviceId yang dipakai saat signup/login. Kalodata mengikat SESSION ke perangkat ini: wajib dikirim ulang. */
  deviceId?: string;
  /** Cookie lain dari proses signup/login (format header `a=1; b=2`), dikirim ulang bersama SESSION. */
  extraCookies?: string;
}

/** Error terstruktur yang dilempar client. */
export class KaloError extends Error {
  constructor(
    message: string,
    /** Kategori: quota = jatah habis, pagination = lewat batas, auth = sesi mati, http, parse. */
    readonly kind: "quota" | "pagination" | "auth" | "http" | "parse" | "unknown",
    readonly cause?: KaloFailureCause,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "KaloError";
  }
}
