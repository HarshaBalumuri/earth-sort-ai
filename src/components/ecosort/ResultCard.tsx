import type { ClassificationResult, WasteCategory } from "@/lib/ecosort.functions";

const CATEGORY_STYLES: Record<WasteCategory, string> = {
  "Wet Waste": "bg-wet/15 border-wet/40 text-wet",
  "Dry Waste": "bg-dry/15 border-dry/40 text-dry",
  "Recyclable Waste": "bg-recyclable/15 border-recyclable/40 text-recyclable",
  "Hazardous Waste": "bg-hazardous/15 border-hazardous/40 text-hazardous",
};

const BAR_STYLES: Record<WasteCategory, string> = {
  "Wet Waste": "bg-wet",
  "Dry Waste": "bg-dry",
  "Recyclable Waste": "bg-recyclable",
  "Hazardous Waste": "bg-hazardous",
};

export function ResultCard({ result }: { result: ClassificationResult }) {
  return (
    <article className="glass animate-rise rounded-3xl p-6 md:p-8">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">AI verdict</span>
        <span className="text-xs font-bold text-brand">{result.confidence}% confidence</span>
      </div>
      <h2 className="font-display mt-4 text-3xl md:text-4xl">{result.itemName}</h2>

      <div className="mt-5 flex flex-wrap gap-2">
        <span
          className={`rounded-full border px-4 py-1.5 text-sm font-bold ${CATEGORY_STYLES[result.category]}`}
        >
          {result.category}
        </span>
        <span className="rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground">
          {result.material}
        </span>
      </div>

      <div className="mt-5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-[width] duration-1000 ease-out ${BAR_STYLES[result.category]}`}
            style={{ width: `${result.confidence}%` }}
          />
        </div>
        <p className="mt-3 text-sm text-foreground/80">
          <span className="text-muted-foreground">Reason: </span>
          {result.reason}
        </p>
      </div>

      <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-muted p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Disposal method</p>
          <p className="mt-1">{result.disposalMethod}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Environmental impact</p>
          <p className="mt-1">{result.environmentalImpact}</p>
        </div>
      </div>

      <ul className="mt-4 space-y-1.5">
        {result.tips.map((tip) => (
          <li key={tip} className="text-sm text-brand">
            Tip: {tip}
          </li>
        ))}
      </ul>
    </article>
  );
}
