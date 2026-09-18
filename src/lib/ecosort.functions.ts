import { createServerFn } from "@tanstack/react-start";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayRunIdFetch } from "./ai-gateway.server";

export const WASTE_CATEGORIES = [
  "Wet Waste",
  "Dry Waste",
  "Recyclable Waste",
  "Hazardous Waste",
] as const;
export type WasteCategory = (typeof WASTE_CATEGORIES)[number];

const ResultSchema = z.object({
  itemName: z.string(),
  category: z.enum(WASTE_CATEGORIES),
  confidence: z.number(),
  material: z.string(),
  reason: z.string(),
  disposalMethod: z.string(),
  environmentalImpact: z.string(),
  tips: z.array(z.string()),
  estimatedWeightKg: z.number(),
});
export type ClassificationResult = z.infer<typeof ResultSchema> & {
  /** "fallback" means the AI service was unreachable and a rule-based guess was used. */
  source?: "ai" | "fallback";
};

const ClassifyInput = z
  .object({
    itemName: z.string().trim().max(120).default(""),
    imageDataUrl: z.string().startsWith("data:image/").max(8_000_000).nullable().default(null),
    /** Used only by the offline fallback to guess from the file name. */
    imageFileName: z.string().trim().max(200).nullable().optional().default(null),
  })
  .refine((v) => v.itemName.length > 0 || !!v.imageDataUrl, {
    message: "Provide an item name or an image.",
  });


/** Rule-based backup so the app still answers when the AI service is unavailable. */
const FALLBACK_RULES: Array<{
  match: RegExp;
  category: WasteCategory;
  material: string;
  weight: number;
}> = [
  { match: /batter|bulb|cfl|paint|chemical|pesticid|syringe|medicine|aerosol|thermometer|e-?waste|charger|phone|laptop|cable/i, category: "Hazardous Waste", material: "Electronic or chemical", weight: 0.05 },
  { match: /peel|banana|vegetable|fruit|food|leftover|tea ?bag|coffee ground|egg ?shell|garden|leaves|flower/i, category: "Wet Waste", material: "Organic matter", weight: 0.1 },
  { match: /bottle|can|tin|glass|jar|carton|newspaper|paper|cardboard|box|magazine|aluminium|aluminum|metal|pet\b|hdpe/i, category: "Recyclable Waste", material: "Recyclable material", weight: 0.03 },
  { match: /bag|wrapper|straw|styrofoam|thermocol|diaper|napkin|tissue|sanitary|ceramic|rubber|cloth|sponge/i, category: "Dry Waste", material: "Non-recyclable residual", weight: 0.02 },
];

const CATEGORY_GUIDANCE: Record<WasteCategory, { disposal: string; impact: string; tips: string[] }> = {
  "Wet Waste": {
    disposal: "Place it in the green wet-waste bin or a home compost pile.",
    impact: "Composting organics keeps methane-producing waste out of landfills.",
    tips: ["Keep wet waste free of plastic", "Drain excess liquid first"],
  },
  "Dry Waste": {
    disposal: "Put it in the dry-waste bin; keep it clean, dry and loose.",
    impact: "Correct sorting prevents contamination of recyclable batches.",
    tips: ["Avoid bagging dry waste", "Choose reusable alternatives next time"],
  },
  "Recyclable Waste": {
    disposal: "Rinse it and place it in the recyclable bin or hand it to a scrap collector.",
    impact: "Recycling saves raw material and energy versus new production.",
    tips: ["Rinse before recycling", "Flatten to save space"],
  },
  "Hazardous Waste": {
    disposal: "Do not bin it — drop it at a hazardous-waste or e-waste collection point.",
    impact: "Keeping toxins out of landfills protects soil and groundwater.",
    tips: ["Never burn or bury it", "Store safely until drop-off"],
  },
};

function fallbackClassification(
  itemName: string,
  hasImage: boolean,
  imageFileName?: string | null,
): ClassificationResult {
  // Prefer the typed name; otherwise guess from the image file name
  // ("glass-jar.jpg" → "Glass Jar"), which is often descriptive enough.
  const fromFile = (imageFileName ?? "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const label = itemName.trim() || fromFile || (hasImage ? "Uploaded Item" : "Unknown Item");
  const rule = FALLBACK_RULES.find((r) => r.match.test(label));
  const category: WasteCategory = rule?.category ?? "Dry Waste";
  const guidance = CATEGORY_GUIDANCE[category];

  return {
    itemName: label,
    category,
    confidence: rule ? 55 : 30,
    material: rule?.material ?? "Unclassified material",
    reason: rule
      ? `The AI service is unavailable, so this uses EcoSort's offline rules: items like this usually belong to ${category}.`
      : "The AI service is unavailable and no offline rule matched, so this is a cautious default — please verify locally.",
    disposalMethod: guidance.disposal,
    environmentalImpact: guidance.impact,
    tips: guidance.tips,
    estimatedWeightKg: rule?.weight ?? 0.02,
    source: "fallback",
  };
}


const SYSTEM_PROMPT = `You are EcoSort AI, a waste segregation assistant supporting SDG 12 (Responsible Consumption and Production).
Classify the everyday item the user describes or photographs into exactly one of: Wet Waste (biodegradable/organic), Dry Waste (non-biodegradable, non-recyclable or low-value residual), Recyclable Waste (paper, cardboard, PET/HDPE plastics, glass, metals, clean e-waste destined for recycling), Hazardous Waste (batteries, chemicals, paint, medical waste, CFL bulbs, e-waste with toxic components, aerosols).
Return: itemName (short, title case), category, confidence (integer 0-100 reflecting how certain you are), material (2-4 words), reason (one sentence explaining the classification transparently), disposalMethod (one or two actionable sentences), environmentalImpact (one sentence on the benefit of correct disposal or the harm of incorrect disposal), tips (2 to 3 short practical sustainability tips), estimatedWeightKg (typical weight of a single such item in kilograms, e.g. 0.02 for a plastic bottle). Keep every string under 220 characters. If the image is unclear, make your best guess and lower the confidence.`;

export const classifyItem = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ClassifyInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];

    const mediaType = data.imageDataUrl
      ? (data.imageDataUrl.match(/^data:(image\/[a-z.+-]+);/i)?.[1] ?? "image/jpeg")
      : null;

    let normalized: ClassificationResult;

    if (!key) {
      console.error("[EcoSort] LOVABLE_API_KEY missing — using offline fallback classification");
      normalized = fallbackClassification(data.itemName, !!data.imageDataUrl);
    } else {
      const runIdFetch = createLovableAiGatewayRunIdFetch();
      const lovable = createOpenAI({
        baseURL: "https://ai.gateway.lovable.dev/v1",
        apiKey: key,
        headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
        fetch: runIdFetch.fetch,
      });

      const userText = data.itemName
        ? `Item: ${data.itemName}`
        : "Identify the item in this photo and classify it.";

      const content: Array<
        { type: "text"; text: string } | { type: "file"; data: string; mediaType: string }
      > = [{ type: "text", text: userText }];
      if (data.imageDataUrl && mediaType) {
        content.push({ type: "file", data: data.imageDataUrl, mediaType });
      }

      try {
        const result = streamText({
          model: lovable.responses("openai/gpt-6-astra"),
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content }],
          output: Output.object({ schema: ResultSchema }),
          providerOptions: {
            openai: {
              forceReasoning: true,
              reasoningEffort: "low",
              reasoningSummary: "auto",
              store: false,
              include: ["reasoning.encrypted_content"],
            },
          },
        });
        const output = await result.output;
        normalized = {
          ...output,
          confidence: Math.max(0, Math.min(100, Math.round(output.confidence))),
          tips: output.tips.slice(0, 3),
          estimatedWeightKg: Math.max(0, Math.min(50, output.estimatedWeightKg)),
          source: "ai",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[EcoSort] AI classification failed:", message, {
          hasImage: !!data.imageDataUrl,
          mediaType,
          imageChars: data.imageDataUrl?.length ?? 0,
          noObject: NoObjectGeneratedError.isInstance(error),
        });
        // Terminal billing/policy errors are surfaced; everything else degrades
        // to the offline rules so the user still gets an answer.
        if (/\b402\b/.test(message)) {
          throw new Error("AI credits are exhausted — please add credits to continue.");
        }
        if (/\b403\b/.test(message)) {
          throw new Error("AI access is blocked for this workspace. Check the workspace AI settings.");
        }
        normalized = fallbackClassification(data.itemName, !!data.imageDataUrl);
      }
    }

    // Anonymous aggregate log for the dashboard — no personal data.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("classifications").insert({
        item_name: normalized.itemName.slice(0, 120),
        category: normalized.category,
        confidence: normalized.confidence,
        estimated_weight_kg: normalized.estimatedWeightKg,
        used_image: !!data.imageDataUrl,
      });
      if (error) console.error("[EcoSort] dashboard log insert failed:", error.message);
    } catch (error) {
      console.error("[EcoSort] dashboard log insert threw:", error);
    }

    return normalized;

  });

export const getSustainabilityStats = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("get_sustainability_stats").single();
  if (error) throw new Error(error.message);
  return {
    totalItems: Number(data.total_items ?? 0),
    recyclableItems: Number(data.recyclable_items ?? 0),
    divertedKg: Number(data.diverted_kg ?? 0),
  };
});
