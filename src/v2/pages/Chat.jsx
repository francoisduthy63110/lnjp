import { useMemo } from "react";
import { Card, CardSection, Divider, Pill, Sub, Title } from "../../ui/Primitives";

function Bubble({ mine, name, text, time }) {
  return (
    <div className={"flex " + (mine ? "justify-end" : "justify-start")}>
      <div className={
        "max-w-[85%] rounded-[var(--r-xl)] border px-3 py-2 " +
        (mine
          ? "bg-[rgba(10,42,90,0.35)] border-white/10"
          : "bg-[var(--surface)] border-white/10")
      }
      >
        <div className="text-[11px] text-[var(--muted)]">{mine ? "Toi" : name} • {time}</div>
        <div className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{text}</div>
      </div>
    </div>
  );
}

export default function Chat() {
  const messages = useMemo(
    () => [
      { id: 1, mine: false, name: "Simone", time: "18:02", text: "Match phare ce soir. Je sens le 1–1." },
      { id: 2, mine: true, name: "", time: "18:04", text: "J’hésite… je pars sur 2–1." },
      { id: 3, mine: false, name: "Max", time: "18:06", text: "Vous êtes chauds. Moi c’est 2–0." },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardSection>
          <div className="flex items-center justify-between">
            <Title>Chat</Title>
            <Pill variant="outline">Ligue</Pill>
          </div>
          <Sub className="mt-2">Style simple, lisible, sans bouton Rafraîchir (auto-refresh plus tard).</Sub>
        </CardSection>
      </Card>

      <div className="space-y-3">
        {messages.map((m) => (
          <Bubble key={m.id} {...m} />
        ))}
      </div>

      <div className="pt-1">
        <Divider />
        <div className="mt-3 text-xs text-[var(--muted)]">Zone de saisie à venir (on figera d’abord la charte).</div>
      </div>
    </div>
  );
}
