// Markets used by research filters (flags: components/flag.tsx, SVG because Windows can't render flag emoji).
// Same set as KaloData's TikTok Shop regions (KaloData /api/allLastDay).
export const REGIONS = ["Asia", "Americas", "Europe"] as const;
export const COUNTRIES = [
  { code: "ID", name: "Indonesia", currency: "IDR", region: "Asia", color: "#e5484d" },
  { code: "MY", name: "Malaysia", currency: "MYR", region: "Asia", color: "#3b82f6" },
  { code: "PH", name: "Filipina", currency: "PHP", region: "Asia", color: "#2563eb" },
  { code: "SG", name: "Singapura", currency: "SGD", region: "Asia", color: "#ef4444" },
  { code: "TH", name: "Thailand", currency: "THB", region: "Asia", color: "#6366f1" },
  { code: "VN", name: "Vietnam", currency: "VND", region: "Asia", color: "#dc2626" },
  { code: "JP", name: "Jepang", currency: "JPY", region: "Asia", color: "#bc002d" },
  { code: "US", name: "Amerika Serikat", currency: "USD", region: "Americas", color: "#1d4ed8" },
  { code: "BR", name: "Brasil", currency: "BRL", region: "Americas", color: "#009739" },
  { code: "MX", name: "Meksiko", currency: "MXN", region: "Americas", color: "#006847" },
  { code: "GB", name: "Inggris", currency: "GBP", region: "Europe", color: "#1e40af" },
  { code: "DE", name: "Jerman", currency: "EUR", region: "Europe", color: "#dd0000" },
  { code: "FR", name: "Prancis", currency: "EUR", region: "Europe", color: "#0055a4" },
  { code: "ES", name: "Spanyol", currency: "EUR", region: "Europe", color: "#c60b1e" },
  { code: "IT", name: "Italia", currency: "EUR", region: "Europe", color: "#009246" },
  { code: "NL", name: "Belanda", currency: "EUR", region: "Europe", color: "#ae1c28" },
  { code: "BE", name: "Belgia", currency: "EUR", region: "Europe", color: "#fdda24" },
  { code: "AT", name: "Austria", currency: "EUR", region: "Europe", color: "#ed2939" },
  { code: "IE", name: "Irlandia", currency: "EUR", region: "Europe", color: "#169b62" },
  { code: "PT", name: "Portugal", currency: "EUR", region: "Europe", color: "#006600" },
  { code: "GR", name: "Yunani", currency: "EUR", region: "Europe", color: "#0d5eaf" },
  { code: "PL", name: "Polandia", currency: "PLN", region: "Europe", color: "#dc143c" },
  { code: "CZ", name: "Ceko", currency: "CZK", region: "Europe", color: "#11457e" },
  { code: "HU", name: "Hungaria", currency: "HUF", region: "Europe", color: "#477050" },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]["code"];
export const countryOf = (code: string | null | undefined) => COUNTRIES.find((c) => c.code === (code ?? "").toUpperCase()) ?? null;
export const isCountry = (code: unknown): code is CountryCode => typeof code === "string" && COUNTRIES.some((c) => c.code === code);

/** Shopee markets KaloData actually has data for (others silently fall back to another market). */
export const SHOPEE_MARKETS = ["ID", "TH", "VN"] as const satisfies readonly CountryCode[];
