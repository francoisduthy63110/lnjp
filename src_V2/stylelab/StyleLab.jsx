import { Card, CardSection, Divider, Pill, Title, Sub, Button } from "../ui/Primitives";

function Swatch({ label, varName }) {
  return (
    <div className="rounded-[var(--r-lg)] bg-[var(--surface)] border border-white/10 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-[var(--muted)]">{label}</div>
        <div className="text-[11px] text-white/60 font-mono">{varName}</div>
      </div>
      <div className="mt-2 h-10 rounded-[var(--r-md)] border border-white/10" style={{ background: `var(${varName})` }} />
    </div>
  );
}

export default function StyleLab() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold tracking-tight">StyleLab</div>
            <div className="mt-1 text-sm text-[var(--muted)]">
              Sandbox UI (charte graphique) – indépendante du fonctionnel.
            </div>
            <div className="mt-2 text-xs text-[var(--muted)]">
              Accès prod : ajouter <span className="font-mono">?preview=1</span> (ou localStorage <span className="font-mono">lnjp_preview=1</span>).
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/v2?preview=1" className="text-sm underline text-white/80">Ouvrir V2</a>
          </div>
        </div>

        <Card>
          <CardSection>
            <div className="flex items-center justify-between">
              <Title>Couleurs (tokens)</Title>
              <Pill variant="outline">Logo</Pill>
            </div>
            <Sub className="mt-2">Source de vérité : <span className="font-mono">src/theme/tokens.css</span></Sub>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Swatch label="Background" varName="--bg" />
              <Swatch label="Surface" varName="--surface" />
              <Swatch label="Surface 2" varName="--surface-2" />
              <Swatch label="Primary" varName="--primary" />
              <Swatch label="Accent" varName="--primary-2" />
              <Swatch label="Danger" varName="--danger" />
            </div>
          </CardSection>
        </Card>

        <Card>
          <CardSection>
            <div className="flex items-center justify-between">
              <Title>Typographie</Title>
              <Pill variant="outline">Hiérarchie</Pill>
            </div>
            <div className="mt-4 space-y-2">
              <div className="text-2xl font-semibold tracking-tight">Titre principal</div>
              <div className="text-lg font-semibold tracking-tight">Titre section</div>
              <div className="text-sm text-white/90">Texte principal</div>
              <div className="text-xs text-[var(--muted)]">Texte secondaire</div>
            </div>
          </CardSection>
        </Card>

        <Card>
          <CardSection>
            <div className="flex items-center justify-between">
              <Title>Composants</Title>
              <Pill variant="outline">Primitives</Pill>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Sub>Buttons</Sub>
                <Button>Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
              </div>

              <div className="space-y-2">
                <Sub>Pills</Sub>
                <div className="flex flex-wrap gap-2">
                  <Pill variant="primary">Primary</Pill>
                  <Pill>Default</Pill>
                  <Pill variant="outline">Outline</Pill>
                  <Pill variant="danger">Danger</Pill>
                  <Pill variant="success">Success</Pill>
                </div>
              </div>
            </div>

            <Divider className="my-4" />

            <Sub>List Row (exemple)</Sub>
            <div className="mt-2 rounded-[var(--r-xl)] bg-[var(--surface-2)] border border-white/10 overflow-hidden">
              {[
                { label: "Classement", value: "#7 / 18" },
                { label: "Total points", value: "104" },
                { label: "Journée", value: "+3" },
              ].map((it, idx, arr) => (
                <div key={it.label}>
                  <div className="flex items-center justify-between px-4 h-12">
                    <div className="text-sm text-white/80">{it.label}</div>
                    <div className="text-sm font-semibold">{it.value}</div>
                  </div>
                  {idx < arr.length - 1 ? <Divider /> : null}
                </div>
              ))}
            </div>
          </CardSection>
        </Card>

        <div className="text-xs text-[var(--muted)] leading-relaxed">
          Règle du projet : tant que la charte n’est pas figée, on ne retouche pas les écrans fonctionnels.
          Une fois figé, on branche le design system (tokens + primitives + AppShell) progressivement.
        </div>
      </div>
    </div>
  );
}
