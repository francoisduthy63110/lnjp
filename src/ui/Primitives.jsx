export function Card({ children, className = "" }) {
  return (
    <div className={"rounded-[var(--r-xl)] bg-[var(--surface)] border border-white/10 shadow-[var(--shadow)] " + className}>
      {children}
    </div>
  );
}

export function CardSection({ children, className = "" }) {
  return <div className={"p-4 " + className}>{children}</div>;
}

export function Divider({ className = "" }) {
  return <div className={"h-px bg-white/10 " + className} />;
}

export function Title({ children, className = "" }) {
  return <div className={"text-sm font-semibold tracking-tight " + className}>{children}</div>;
}

export function Sub({ children, className = "" }) {
  return <div className={"text-xs text-[var(--muted)] " + className}>{children}</div>;
}

export function Pill({ children, variant = "default", className = "" }) {
  const base = "inline-flex items-center gap-1 px-2.5 h-7 rounded-full text-xs font-semibold border";
  const map = {
    default: "bg-[var(--surface-2)] border-white/10 text-white/90",
    primary: "bg-[rgba(10,42,90,0.35)] border-white/10 text-white",
    danger: "bg-[rgba(239,68,68,0.20)] border-[rgba(239,68,68,0.35)] text-white",
    success: "bg-[rgba(34,197,94,0.18)] border-[rgba(34,197,94,0.35)] text-white",
    outline: "bg-transparent border-white/15 text-white/90",
  };
  return <span className={base + " " + (map[variant] || map.default) + " " + className}>{children}</span>;
}

export function Button({ children, variant = "primary", className = "", disabled, onClick, type = "button" }) {
  const base =
    "w-full inline-flex items-center justify-center gap-2 rounded-[var(--r-lg)] h-11 px-4 text-sm font-semibold transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed";
  const map = {
    primary: "bg-[linear-gradient(135deg,var(--primary),var(--primary-2))] text-white",
    secondary: "bg-[var(--surface-2)] border border-white/10 text-white",
    ghost: "bg-transparent border border-white/10 text-white/90",
  };
  return (
    <button type={type} className={base + " " + (map[variant] || map.primary) + " " + className} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function Stat({ label, value, hint, className = "" }) {
  return (
    <div className={"flex-1 min-w-0 " + className}>
      <div className="text-xs text-[var(--muted)] truncate">{label}</div>
      <div className="text-lg font-semibold tracking-tight truncate">{value}</div>
      {hint ? <div className="text-xs text-white/60 truncate">{hint}</div> : null}
    </div>
  );
}
