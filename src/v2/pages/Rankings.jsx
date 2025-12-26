import { useMemo, useState } from "react";
import { Card, CardSection, Divider, Pill, Sub, Title } from "../../ui/Primitives";

function Arrow({ delta }) {
  if (!delta) return null;
  const up = delta > 0;
  const down = delta < 0;
  if (!up && !down) return <span className="text-white/40">—</span>;
  return (
    <span
      className={
        "inline-flex items-center gap-1 text-xs font-semibold " +
        (up ? "text-[var(--success)]" : "text-[var(--danger)]")
      }
    >
      {up ? "↑" : "↓"}
      {Math.abs(delta)}
    </span>
  );
}

function Row({ item, isMe }) {
  return (
    <div className={"flex items-center justify-between gap-3 py-3 " + (isMe ? "bg-white/5 rounded-[var(--r-lg)] px-3" : "px-1")}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 text-center">
          <div className="text-sm font-semibold">#{item.rank}</div>
          <div className="text-[11px] text-[var(--muted)]">{item.dayPoints > 0 ? `+${item.dayPoints}` : item.dayPoints}</div>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{item.name}</div>
          <div className="text-xs text-[var(--muted)]">{item.total} pts</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Arrow delta={item.move} />
        <Pill variant={item.isFeatured ? "primary" : "outline"}>{item.isFeatured ? "Série" : "OK"}</Pill>
      </div>
    </div>
  );
}

export default function Rankings() {
  const [tab, setTab] = useState("general");

  const general = useMemo(
    () => [
      { rank: 1, name: "Simone", total: 128, dayPoints: 8, move: +1 },
      { rank: 2, name: "Max", total: 121, dayPoints: 5, move: -1 },
      { rank: 3, name: "François", total: 118, dayPoints: 3, move: 0 },
      { rank: 4, name: "Karine", total: 110, dayPoints: 2, move: +2 },
      { rank: 5, name: "Sébastien", total: 109, dayPoints: 2, move: -1 },
      { rank: 6, name: "Julie", total: 106, dayPoints: 0, move: 0 },
      { rank: 7, name: "Toi", total: 104, dayPoints: 1, move: +1 },
    ],
    []
  );

  const secondaires = useMemo(
    () => [
      { rank: 1, name: "Simone", total: 44, dayPoints: 4, move: 0, isFeatured: true },
      { rank: 2, name: "Toi", total: 40, dayPoints: 2, move: +1, isFeatured: true },
      { rank: 3, name: "Max", total: 38, dayPoints: 0, move: -1, isFeatured: true },
    ],
    []
  );

  const list = tab === "general" ? general : secondaires;

  return (
    <div className="space-y-4">
      <Card>
        <CardSection>
          <div className="flex items-center justify-between">
            <Title>Classements</Title>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTab("general")}
                className={
                  "h-8 px-3 rounded-full text-xs font-semibold border transition " +
                  (tab === "general"
                    ? "bg-[var(--surface-2)] border-white/15 text-white"
                    : "bg-transparent border-white/10 text-white/70")
                }
              >
                Général
              </button>
              <button
                type="button"
                onClick={() => setTab("secondary")}
                className={
                  "h-8 px-3 rounded-full text-xs font-semibold border transition " +
                  (tab === "secondary"
                    ? "bg-[var(--surface-2)] border-white/15 text-white"
                    : "bg-transparent border-white/10 text-white/70")
                }
              >
                Secondaire
              </button>
            </div>
          </div>
          <Sub className="mt-2">Général + accès aux classements secondaires (ex: “Chatte à Simone”).</Sub>

          <div className="mt-4">
            {list.map((it, idx) => (
              <div key={idx}>
                <Row item={it} isMe={it.name === "Toi"} />
                {idx < list.length - 1 ? <Divider /> : null}
              </div>
            ))}
          </div>
        </CardSection>
      </Card>
    </div>
  );
}
