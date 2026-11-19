// Small inline SVG flags (Windows can't render flag emoji). Simplified but recognizable at 16–24px; 3:2 viewBox.

const FLAGS: Record<string, React.ReactNode> = {
  ID: (
    <>
      <rect width="30" height="10" fill="#e70011" />
      <rect y="10" width="30" height="10" fill="#fff" />
    </>
  ),
  MY: (
    <>
      {Array.from({ length: 14 }, (_, i) => (
        <rect key={i} y={(i * 20) / 14} width="30" height={20 / 14} fill={i % 2 ? "#fff" : "#cc0001"} />
      ))}
      <rect width="15" height="11.43" fill="#010066" />
      <circle cx="6.2" cy="5.7" r="3.6" fill="#fc0" />
      <circle cx="7.1" cy="5.7" r="3" fill="#010066" />
      <path d="M11.4 3.5l.55 1.5 1.6-.3-1.05 1.25 1.05 1.25-1.6-.3-.55 1.5-.55-1.5-1.6.3 1.05-1.25-1.05-1.25 1.6.3z" fill="#fc0" />
    </>
  ),
  PH: (
    <>
      <rect width="30" height="10" fill="#0038a8" />
      <rect y="10" width="30" height="10" fill="#ce1126" />
      <path d="M0 0l17.3 10L0 20z" fill="#fff" />
      <circle cx="6" cy="10" r="2.4" fill="#fcd116" />
    </>
  ),
  SG: (
    <>
      <rect width="30" height="10" fill="#ef3340" />
      <rect y="10" width="30" height="10" fill="#fff" />
      <circle cx="6.2" cy="5" r="3.2" fill="#fff" />
      <circle cx="7.4" cy="5" r="3" fill="#ef3340" />
      {[[9.4, 2.6], [11.4, 3.9], [10.7, 6.3], [8.3, 6.3], [7.6, 3.9]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="0.55" fill="#fff" />
      ))}
    </>
  ),
  TH: (
    <>
      <rect width="30" height="20" fill="#a51931" />
      <rect y="3.33" width="30" height="13.33" fill="#f4f5f8" />
      <rect y="6.67" width="30" height="6.67" fill="#2d2a4a" />
    </>
  ),
  VN: (
    <>
      <rect width="30" height="20" fill="#da251d" />
      <path d="M15 4.5l1.3 4h4.2l-3.4 2.5 1.3 4-3.4-2.5-3.4 2.5 1.3-4-3.4-2.5h4.2z" fill="#ff0" />
    </>
  ),
  US: (
    <>
      {Array.from({ length: 13 }, (_, i) => (
        <rect key={i} y={(i * 20) / 13} width="30" height={20 / 13} fill={i % 2 ? "#fff" : "#b22234"} />
      ))}
      <rect width="12" height="10.77" fill="#3c3b6e" />
      {Array.from({ length: 12 }, (_, i) => (
        <circle key={i} cx={1.5 + (i % 4) * 3} cy={1.6 + Math.floor(i / 4) * 3.6} r="0.55" fill="#fff" />
      ))}
    </>
  ),
  GB: (
    <>
      <rect width="30" height="20" fill="#012169" />
      <path d="M0 0l30 20M30 0L0 20" stroke="#fff" strokeWidth="4" />
      <path d="M0 0l30 20M30 0L0 20" stroke="#c8102e" strokeWidth="1.6" />
      <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="6" />
      <path d="M15 0v20M0 10h30" stroke="#c8102e" strokeWidth="3.4" />
    </>
  ),
  JP: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <circle cx="15" cy="10" r="6" fill="#bc002d" />
    </>
  ),
  BR: (
    <>
      <rect width="30" height="20" fill="#009739" />
      <path d="M15 2.5L27 10 15 17.5 3 10z" fill="#fedd00" />
      <circle cx="15" cy="10" r="4.4" fill="#012169" />
    </>
  ),
  MX: (
    <>
      <rect width="10" height="20" fill="#006847" />
      <rect x="10" width="10" height="20" fill="#fff" />
      <rect x="20" width="10" height="20" fill="#ce1126" />
      <circle cx="15" cy="10" r="2.2" fill="#8c5a2b" />
    </>
  ),
  DE: (
    <>
      <rect width="30" height="20" fill="#000" />
      <rect y="6.67" width="30" height="6.67" fill="#dd0000" />
      <rect y="13.33" width="30" height="6.67" fill="#ffce00" />
    </>
  ),
  FR: (
    <>
      <rect width="10" height="20" fill="#0055a4" />
      <rect x="10" width="10" height="20" fill="#fff" />
      <rect x="20" width="10" height="20" fill="#ef4135" />
    </>
  ),
  ES: (
    <>
      <rect width="30" height="20" fill="#c60b1e" />
      <rect y="5" width="30" height="10" fill="#ffc400" />
    </>
  ),
  IT: (
    <>
      <rect width="10" height="20" fill="#009246" />
      <rect x="10" width="10" height="20" fill="#fff" />
      <rect x="20" width="10" height="20" fill="#ce2b37" />
    </>
  ),
  NL: (
    <>
      <rect width="30" height="20" fill="#ae1c28" />
      <rect y="6.67" width="30" height="6.67" fill="#fff" />
      <rect y="13.33" width="30" height="6.67" fill="#21468b" />
    </>
  ),
  BE: (
    <>
      <rect width="10" height="20" fill="#000" />
      <rect x="10" width="10" height="20" fill="#fdda24" />
      <rect x="20" width="10" height="20" fill="#ef3340" />
    </>
  ),
  AT: (
    <>
      <rect width="30" height="20" fill="#ed2939" />
      <rect y="6.67" width="30" height="6.67" fill="#fff" />
      <rect y="13.33" width="30" height="6.67" fill="#ed2939" />
    </>
  ),
  IE: (
    <>
      <rect width="10" height="20" fill="#169b62" />
      <rect x="10" width="10" height="20" fill="#fff" />
      <rect x="20" width="10" height="20" fill="#ff883e" />
    </>
  ),
  PT: (
    <>
      <rect width="30" height="20" fill="#ff0000" />
      <rect width="12" height="20" fill="#006600" />
      <circle cx="12" cy="10" r="3.6" fill="#ffcc00" />
    </>
  ),
  GR: (
    <>
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} y={(i * 20) / 9} width="30" height={20 / 9} fill={i % 2 ? "#fff" : "#0d5eaf"} />
      ))}
      <rect width="11.1" height="11.1" fill="#0d5eaf" />
      <rect x="4.44" width="2.22" height="11.1" fill="#fff" />
      <rect y="4.44" width="11.1" height="2.22" fill="#fff" />
    </>
  ),
  PL: (
    <>
      <rect width="30" height="10" fill="#fff" />
      <rect y="10" width="30" height="10" fill="#dc143c" />
    </>
  ),
  CZ: (
    <>
      <rect width="30" height="10" fill="#fff" />
      <rect y="10" width="30" height="10" fill="#d7141a" />
      <path d="M0 0l15 10L0 20z" fill="#11457e" />
    </>
  ),
  HU: (
    <>
      <rect width="30" height="20" fill="#ce2939" />
      <rect y="6.67" width="30" height="6.67" fill="#fff" />
      <rect y="13.33" width="30" height="6.67" fill="#477050" />
    </>
  ),
};

export function Flag({ code, className = "h-3.5 w-5" }: { code: string; className?: string }) {
  const f = FLAGS[code.toUpperCase()];
  return (
    <svg viewBox="0 0 30 20" className={`shrink-0 overflow-hidden rounded-[3px] ring-1 ring-black/10 ${className}`} role="img" aria-label={code}>
      {f ?? <rect width="30" height="20" fill="#8a8f98" />}
    </svg>
  );
}
