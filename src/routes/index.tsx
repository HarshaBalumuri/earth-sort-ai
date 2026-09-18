import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";

import { ClassifyForm, type ClassifyPayload } from "@/components/ecosort/ClassifyForm";
import { ResultCard } from "@/components/ecosort/ResultCard";
import {
  classifyItem,
  getSustainabilityStats,
  type ClassificationResult,
} from "@/lib/ecosort.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EcoSort AI – Smart Waste Segregation Assistant" },
      {
        name: "description",
        content:
          "Upload an item image or enter an item name to learn how to dispose of it responsibly. AI-powered waste classification supporting SDG 12.",
      },
      { property: "og:title", content: "EcoSort AI – Smart Waste Segregation Assistant" },
      {
        property: "og:description",
        content: "Know your bin: wet, dry, recyclable or hazardous — with disposal steps and sustainability tips.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});


const EDUCATION = [
  {
    tag: "Segregation",
    title: "Sort at the source",
    body: "Keep wet, dry, recyclable and hazardous streams separate from the moment you toss. Mixed waste is far harder — and costlier — to recover.",
  },
  {
    tag: "Recycling",
    title: "Clean, dry, loose",
    body: "Food residue contaminates whole batches. A quick rinse and no bagging keeps paper, plastics, glass and metals recoverable.",
  },
  {
    tag: "SDG 12",
    title: "Responsible consumption",
    body: "UN Sustainable Development Goal 12 targets halving food waste and substantially reducing waste through prevention, reduction, recycling and reuse by 2030.",
  },
];

const RESPONSIBLE_AI = [
  "AI may occasionally make mistakes — treat results as guidance, not a guarantee.",
  "Always verify disposal rules with your local municipality or waste authority.",
  "No personal data is stored. Only anonymous item names and categories feed the dashboard totals.",
  "Every classification includes a transparent reason so you can judge it yourself.",
];

function formatKg(kg: number) {
  return kg >= 1 ? `${kg.toFixed(1)}kg` : `${Math.round(kg * 1000)}g`;
}

function Index() {
  const queryClient = useQueryClient();
  const classify = useServerFn(classifyItem);
  const fetchStats = useServerFn(getSustainabilityStats);
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const stats = useQuery({
    queryKey: ["sustainability-stats"],
    queryFn: () => fetchStats(),
  });

  const mutation = useMutation({
    mutationFn: (payload: ClassifyPayload) => classify({ data: payload }),
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["sustainability-stats"] });
    },
  });

  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result]);


  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Kinetic backdrop */}
      <div className="pointer-events-none absolute -top-40 -left-32 h-[560px] w-[560px] animate-drift rounded-full bg-brand/30 blur-[120px]" />
      <div className="pointer-events-none absolute top-1/3 -right-40 h-[620px] w-[620px] animate-drift-reverse rounded-full bg-accent/25 blur-[130px]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-foreground/5 via-transparent to-brand/10" />
      <div className="pointer-events-none absolute inset-y-0 left-[8%] w-40 -skew-x-12 animate-drift-reverse border-x border-border bg-foreground/5 backdrop-blur-sm" />
      <div className="pointer-events-none absolute inset-y-0 right-[14%] w-28 -skew-x-12 animate-drift border-x border-border bg-brand/10 backdrop-blur-sm" />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <a href="#top" className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-brand shadow-glow" />
          <span className="font-display text-2xl">EcoSort AI</span>
        </a>
        <nav className="hidden gap-8 text-sm uppercase tracking-widest text-muted-foreground md:flex">
          <a href="#classify" className="transition-colors hover:text-brand">Classify</a>
          <a href="#dashboard" className="transition-colors hover:text-brand">Dashboard</a>
          <a href="#learn" className="transition-colors hover:text-brand">Learn</a>
          <a href="#responsible-ai" className="transition-colors hover:text-brand">Responsible AI</a>
        </nav>
      </header>

      {/* Hero + classifier */}
      <section id="classify" className="relative z-10 mx-auto max-w-6xl px-6 pt-10 pb-14 md:px-12">
        <div className="animate-slide inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-4 py-1.5 text-xs uppercase tracking-widest text-brand">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          SDG 12 · Responsible consumption
        </div>
        <h1 className="font-display animate-slide mt-5 text-6xl leading-[0.9] [animation-delay:80ms] md:text-8xl">
          EcoSort AI
        </h1>
        <p className="animate-slide mt-2 font-display text-2xl text-brand [animation-delay:120ms] md:text-4xl">
          Sort smarter. Live greener.
        </p>
        <p className="animate-slide mt-5 max-w-xl text-lg text-muted-foreground [animation-delay:160ms]">
          Upload an item image or enter an item name to learn how to dispose of it responsibly.
        </p>

        <ClassifyForm onSubmit={(p) => mutation.mutate(p)} pending={mutation.isPending} />

        {mutation.isPending && (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <span className="size-2 animate-pulse-dot rounded-full bg-brand" />
            <span className="size-2 animate-pulse-dot rounded-full bg-brand [animation-delay:200ms]" />
            <span className="size-2 animate-pulse-dot rounded-full bg-brand [animation-delay:400ms]" />
            <span className="ml-1">AI is analyzing your item…</span>
          </div>
        )}
        {mutation.isError && (
          <p className="mt-4 max-w-2xl rounded-xl border border-hazardous/40 bg-hazardous/10 px-4 py-3 text-sm text-hazardous" role="alert">
            {mutation.error instanceof Error ? mutation.error.message : "Something went wrong."}
          </p>
        )}
      </section>

      {/* Result + dashboard */}
      <section
        id="dashboard"
        ref={resultRef}
        className="relative z-10 mx-auto grid max-w-6xl gap-6 px-6 pb-14 md:grid-cols-5 md:px-12"
      >
        <div className="md:col-span-3">
          {mutation.isPending ? (
            <div className="glass flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-3xl p-8 text-center">
              <span className="size-10 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
              <p className="text-sm text-muted-foreground">Analyzing your item…</p>
            </div>
          ) : result ? (
            <ResultCard key={result.itemName + result.confidence} result={result} />
          ) : (
            <div className="glass flex min-h-[280px] flex-col items-center justify-center gap-2 rounded-3xl p-8 text-center">
              <p className="font-display text-3xl text-brand">No result yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Type an item, tap an example, or add a photo — your classification will appear here.
              </p>
            </div>
          )}
        </div>
        <div className="grid gap-4 md:col-span-2">
          <StatCard
            value={stats.data ? stats.data.totalItems.toLocaleString() : "—"}
            label="Total items checked"
            delay="0ms"
          />
          <StatCard
            value={stats.data ? stats.data.recyclableItems.toLocaleString() : "—"}
            label="Recyclable identified"
            delay="100ms"
          />
          <StatCard
            value={stats.data ? formatKg(stats.data.divertedKg) : "—"}
            label="Diverted from landfill (est.)"
            delay="200ms"
          />
        </div>
      </section>

      {/* Educational */}
      <section id="learn" className="relative z-10 mx-auto grid max-w-6xl gap-6 px-6 pb-14 md:grid-cols-3 md:px-12">
        {EDUCATION.map((item) => (
          <article
            key={item.title}
            className="glass rounded-2xl p-6 transition-transform duration-300 hover:-translate-y-1"
          >
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{item.tag}</p>
            <h3 className="mt-1 font-bold text-brand">{item.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
          </article>
        ))}
      </section>

      {/* Responsible AI */}
      <section id="responsible-ai" className="relative z-10 mx-auto max-w-6xl px-6 pb-16 md:px-12">
        <div className="glass rounded-3xl p-6 md:p-8">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand" />
            <h2 className="font-display text-2xl">Responsible AI</h2>
          </div>
          <ul className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            {RESPONSIBLE_AI.map((line) => (
              <li key={line} className="rounded-xl border border-border/60 bg-muted p-4">
                {line}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="relative z-10 border-t border-border bg-ink/60 px-6 py-6 text-sm text-muted-foreground md:px-12">
        <p className="max-w-4xl">
          EcoSort AI supports SDG 12 — Responsible Consumption and Production. Classifications are AI-generated guidance;
          local regulations take precedence.
        </p>
      </footer>
    </div>
  );
}

function StatCard({ value, label, delay }: { value: string; label: string; delay: string }) {
  return (
    <div className="glass animate-rise rounded-3xl p-6" style={{ animationDelay: delay }}>
      <p className="font-display text-5xl text-brand">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
