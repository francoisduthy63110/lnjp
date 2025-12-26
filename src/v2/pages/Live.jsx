import { useMemo, useState } from "react";
import { Card, CardSection, Divider, Pill, Sub, Title } from "../../ui/Primitives";

function LiveDot() {
  return <span className="inline-block w-2 h-2 rounded-full bg-[var(--danger)] animate-pulse" />;
}

function Accordion({ title, subtitle, right, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[var(--r-xl)] bg-[var(--surface)] border border-white/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full text-left p-4 flex items-start justify-between gap-3"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-[var(--muted)] truncate">{subtitle}</div> : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {right}
          <span className="text-white/60">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open ? (
        <div className="px-4 pb-4">
          <Divider className="mb-3" />
          {children}
        </div>
      ) : null}
    </div>
  );
}

function PronoList({ items }) {
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.player} className="flex items-center justify-between rounded-[var(--r-lg)] bg-[var(--surface-2)] border border-white/10 px-3 h-10">
          <div className="text-sm font-semibold truncate">{it.player}</div>
          <div className="text-sm font-semibold">{it.pick}</div>
        </div>
      ))}
    </div>
  );
}

export default function Live() {
  const day = useMemo(
    () => ({
      title: "Journée en cours",
      featured: "PSG – OM",
    }),
    []
  );

  const matches = useMemo(
    () => [
      {
        id: 1,
        home: "PSG",
        away: "OM",
        score: "1 – 0",
        minute: 37,
        featured: true,
        prono: [
          { player: "Simone", pick: "1–1" },
          { player: "Max", pick: "2–0" },
          { player: "Toi", pick: "2–1" },
        ],
      },
      {
        id: 2,
        home: "Lyon",
        away: "Nice",
        score: "0 – 0",
        minute: 0,
        featured: false,
        prono: [
          { player: "Simone", pick: "1–0" },
          { player: "Max", pick: "0–0" },
          { player: "Toi", pick: "1–1" },
        ],
      },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardSection>
          <div className="flex items-center justify-between">
            <Title>Live</Title>
            <Pill variant="outline">{day.title}</Pill>
          </div>
          <Sub className="mt-2">
            Vision aérée : synthèse par match + détail en accordéon. SCT/DCT et “match phare” seront mis en avant.
          </Sub>
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill variant="primary">Match phare : {day.featured}</Pill>
            <Pill variant="outline">SCT / DCT (à venir)</Pill>
          </div>
        </CardSection>
      </Card>

      <div className="space-y-3">
        {matches.map((m) => (
          <Accordion
            key={m.id}
            title={`${m.home} – ${m.away}`}
            subtitle={m.featured ? "Match phare" : ""}
            right={
              m.minute > 0 ? (
                <Pill variant="danger">
                  <span className="inline-flex items-center gap-2">
                    <LiveDot /> LIVE • {m.minute}'
                  </span>
                </Pill>
              ) : (
                <Pill variant="outline">À venir</Pill>
              )
            }
          >
            <div className="rounded-[var(--r-lg)] bg-[var(--surface-2)] border border-white/10 p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-[var(--muted)]">Score</div>
                <div className="text-lg font-semibold tracking-tight">{m.score}</div>
              </div>
              <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                <div className={"h-full bg-[linear-gradient(90deg,var(--primary-2),var(--primary-3))] " + (m.minute > 0 ? "w-1/3 animate-pulse" : "w-0")} />
              </div>
            </div>

            <div className="mt-3">
              <Title>Pronostics des joueurs</Title>
              <Sub className="mt-1">Version élégante : liste simple (modale possible plus tard si tu préfères).</Sub>
              <div className="mt-2">
                <PronoList items={m.prono} />
              </div>
            </div>
          </Accordion>
        ))}
      </div>

      <div className="pt-1">
        <Divider />
        <div className="mt-3 text-xs text-[var(--muted)]">Le Live est pensé pour rester lisible même avec beaucoup de joueurs.</div>
      </div>
    </div>
  );
}
