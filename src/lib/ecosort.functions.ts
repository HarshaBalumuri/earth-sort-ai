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

function fallbackClassification(itemName: string, hasImage: boolean): ClassificationResult {
  const label = itemName.trim() || (hasImage ? "Uploaded Item" : "Unknown Item");
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
    if (!key) throw new Error("AI is not configured yet. Please try again shortly.");

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
      { type: "text"; text: string } | { type: "image"; image: string }
    > = [{ type: "text", text: userText }];
    if (data.imageDataUrl) content.push({ type: "image", image: data.imageDataUrl });

    let output: ClassificationResult;
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
      output = await result.output;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        throw new Error("The AI could not produce a classification. Please try rephrasing the item.");
      }
      const message = error instanceof Error ? error.message : String(error);
      if (/402/.test(message)) throw new Error("AI credits are exhausted. Please add credits to continue.");
      if (/429/.test(message)) throw new Error("Too many requests right now. Please wait a moment and retry.");
      throw new Error(`Classification failed: ${message}`);
    }

    const normalized: ClassificationResult = {
      ...output,
      confidence: Math.max(0, Math.min(100, Math.round(output.confidence))),
      tips: output.tips.slice(0, 3),
      estimatedWeightKg: Math.max(0, Math.min(50, output.estimatedWeightKg)),
    };

    // Anonymous aggregate log for the dashboard — no personal data.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("classifications").insert({
      item_name: normalized.itemName.slice(0, 120),
      category: normalized.category,
      confidence: normalized.confidence,
      estimated_weight_kg: normalized.estimatedWeightKg,
      used_image: !!data.imageDataUrl,
    });

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
