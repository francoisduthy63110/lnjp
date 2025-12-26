import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardSection, Divider, Pill, Stat, Sub, Title } from "../../ui/Primitives";

function formatDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (d > 0) return `${d}j ${pad(h)}:${pad(m)}:${pad(ss)}`;
  return `${pad(h)}:${pad(m)}:${pad(ss)}`;
}

function LiveDot() {
  return <span className="inline-block w-2 h-2 rounded-full bg-[var(--danger)] animate-pulse" />;
}

function ScorePill({ label, value }) {
  return (
    <div className="flex items-center justify-between px-3 h-10 rounded-[var(--r-lg)] bg-[var(--surface-2)] border border-white/10">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function Podium({ top3 }) {
  return (
    <Card>
      <CardSection>
        <div className="flex items-center justify-between">
          <Title>Podium</Title>
          <Pill variant="outline">Top 3</Pill>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {top3.map((p) => (
            <div key={p.rank} className="rounded-[var(--r-lg)] bg-[var(--surface-2)] border border-white/10 p-3 text-center">
              <div className="text-xs text-[var(--muted)]">#{p.rank}</div>
              <div className="mt-1 text-sm font-semibold truncate">{p.name}</div>
              <div className="mt-1 text-xs text-white/70">{p.points} pts</div>
            </div>
          ))}
        </div>
      </CardSection>
    </Card>
  );
}

function LeagueStatus({ status, label }) {
  return (
    <Card>
      <CardSection>
        <div className="flex items-center justify-between">
          <Title>État de la ligue</Title>
          <Pill variant="primary">{status}</Pill>
        </div>
        <div className="mt-3 text-sm text-white/90">{label}</div>
        <div className="mt-2 text-xs text-[var(--muted)]">
          Le wording sera branché sur les états réels (Journée en cours, terminée, prochaine journée, etc.).
        </div>
      </CardSection>
    </Card>
  );
}

function LiveMatchCard({ match }) {
  return (
    <Card>
      <CardSection>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LiveDot />
            <Title>Match en cours</Title>
          </div>
          <Pill variant="danger">LIVE • {match.minute}'</Pill>
        </div>

        <div className="mt-3 rounded-[var(--r-lg)] bg-[var(--surface-2)] border border-white/10 p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold truncate">{match.home} – {match.away}</div>
            <div className="text-lg font-semibold tracking-tight">{match.score}</div>
          </div>
          <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full w-1/3 bg-[linear-gradient(90deg,var(--primary-2),var(--primary-3))] animate-pulse" />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <ScorePill label="Ton prono" value={match.myPick} />
          <ScorePill label="Match phare" value={match.isFeatured ? "Oui" : "Non"} />
        </div>
      </CardSection>
    </Card>
  );
}

export default function Dashboard({ onGoPredictions }) {
  // MOCK (à brancher plus tard)
  const top3 = useMemo(
    () => [
      { rank: 1, name: "Simone", points: 128 },
      { rank: 2, name: "Max", points: 121 },
      { rank: 3, name: "François", points: 118 },
    ],
    []
  );

  const me = useMemo(() => ({ rank: 7, total: 104, delta: "+3" }), []);
  const hasPredicted = false;

  // Prochaine journée (démo) : dans 6h
  const nextStartAt = useMemo(() => Date.now() + 6 * 3600 * 1000 + 12 * 60 * 1000 + 4 * 1000, []);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = nextStartAt - now;
  const leagueStatus = remaining > 0 ? "Prochaine journée" : "Journée en cours";
  const leagueLabel = remaining > 0 ? `Début dans ${formatDuration(remaining)}` : "Des matchs sont en cours.";

  const liveMatch = useMemo(
    () => ({
      home: "PSG",
      away: "OM",
      score: "1 – 0",
      minute: 37,
      myPick: "2–1",
      isFeatured: true,
    }),
    []
  );

  return (
    <div className="space-y-4">
      <Podium top3={top3} />

      <Card>
        <CardSection>
          <div className="flex items-center justify-between">
            <Title>Toi dans la ligue</Title>
            <Pill variant="outline">#{me.rank}</Pill>
          </div>
          <div className="mt-3 flex gap-3">
            <Stat label="Total" value={`${me.total} pts`} hint={`Aujourd’hui ${me.delta}`} />
            <div className="w-px bg-white/10" />
            <Stat label="Objectif" value="Top 3" hint="à ajuster" />
          </div>
        </CardSection>
      </Card>

      <LeagueStatus status={leagueStatus} label={leagueLabel} />

      {liveMatch ? <LiveMatchCard match={liveMatch} /> : null}

      {!hasPredicted ? (
        <Card>
          <CardSection>
            <div className="flex items-center justify-between">
              <Title>À faire</Title>
              <Pill variant="primary">Pronostics</Pill>
            </div>
            <div className="mt-2 text-sm text-white/90">Tu n’as pas encore fait tes pronostics pour la prochaine journée.</div>
            <div className="mt-3">
              <Button onClick={onGoPredictions}>Pronostiquer</Button>
            </div>
          </CardSection>
        </Card>
      ) : null}

      <div className="pt-1">
        <Divider />
        <div className="mt-3 text-xs text-[var(--muted)]">
          Dashboard V1 de la charte : élégant, aéré, et compatible avec l’augmentation progressive de données.
        </div>
      </div>
    </div>
  );
}
