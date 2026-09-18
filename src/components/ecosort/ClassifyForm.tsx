import { useRef, useState } from "react";

export type ClassifyPayload = {
  itemName: string;
  imageDataUrl: string | null;
  imageFileName?: string | null;
};


// Hard ceiling on the original file we are willing to read into memory.
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png"];
// Photos are downscaled before upload: a 4000px phone photo becomes ~150KB,
// which keeps the analyze request small and fast (large payloads were failing).
const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.82;

const EXAMPLES = [
  "Plastic Water Bottle",
  "Plastic Bag",
  "Banana Peel",
  "Pizza Box",
  "Glass Jar",
  "AA Battery",
  "Old Phone Charger",
];

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

async function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file is not a readable image."));
    img.src = src;
  });
}

/** Downscale to a small JPEG data URL; falls back to the original on any failure. */
async function compressImage(file: File): Promise<string> {
  const original = await readAsDataUrl(file);
  try {
    const img = await loadImage(original);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, width, height);
    const out = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    console.log(
      `[EcoSort] image prepared: ${Math.round(file.size / 1024)}KB → ${Math.round(out.length / 1024)}KB (${width}x${height})`,
    );
    return out.startsWith("data:image/") ? out : original;
  } catch (error) {
    console.warn("[EcoSort] image compression failed, sending original", error);
    return original;
  }
}

export function ClassifyForm({
  onSubmit,
  pending,
}: {
  onSubmit: (payload: ClassifyPayload) => void;
  pending: boolean;
}) {
  const [itemName, setItemName] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    setLocalError(null);
    if (!file) return;
    console.log("[EcoSort] image uploaded:", file.name, file.type, `${Math.round(file.size / 1024)}KB`);
    const type = file.type.toLowerCase();
    const nameOk = /\.(jpe?g|png)$/i.test(file.name);
    if (!ALLOWED_TYPES.includes(type) && !nameOk) {
      setLocalError("Please choose a JPG, JPEG or PNG image.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setLocalError("That image is very large — please use one under 25 MB.");
      return;
    }
    setPreparing(true);
    try {
      const dataUrl = await compressImage(file);
      setImageDataUrl(dataUrl);
      setImageName(file.name);
      onSubmit({ itemName: itemName.trim(), imageDataUrl: dataUrl, imageFileName: file.name });
    } catch (error) {
      console.error("[EcoSort] could not prepare image", error);
      setLocalError(error instanceof Error ? error.message : "Could not read that image.");
    } finally {
      setPreparing(false);
    }
  };


  const clearImage = () => {
    setImageDataUrl(null);
    setImageName(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const busy = pending || preparing;

  const runSubmit = () => {
    if (busy) return;
    if (!itemName.trim() && !imageDataUrl) {
      setLocalError("Type an item name or add a photo first.");
      return;
    }
    setLocalError(null);
    console.log("[EcoSort] analyze triggered — form will not reload the page");
    onSubmit({ itemName: itemName.trim(), imageDataUrl, imageFileName: imageName });
  };

  // The form never actually submits: preventDefault on every submit path,
  // and the Analyze button is type="button" (click handler, not form submit).
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    runSubmit();
  };

  const runExample = (example: string) => {
    if (busy) return;
    setLocalError(null);
    setItemName(example);
    clearImage();
    onSubmit({ itemName: example, imageDataUrl: null });
  };

  return (
    <div className="mt-8 max-w-2xl">
      <form onSubmit={submit} className="glass animate-slide rounded-2xl p-3 [animation-delay:240ms]">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            className="flex-1 bg-transparent px-4 py-3 text-foreground outline-none placeholder:text-muted-foreground/70"
            placeholder="Type an item… e.g. Plastic Water Bottle"
            aria-label="Item name"
            maxLength={120}
          />
          <label className="cursor-pointer rounded-xl border border-border bg-muted px-4 py-3 text-center text-sm text-foreground/80 transition-colors hover:border-brand/50">
            {preparing ? "Preparing…" : imageName ? "Change image" : "+ Image"}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,.jpg,.jpeg,.png"
              className="sr-only"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </label>
          <button
            type="button"
            onClick={runSubmit}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {busy && (
              <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
            )}
            {preparing ? "Preparing…" : pending ? "Analyzing…" : "Analyze"}
          </button>
        </div>

        {imageDataUrl && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-border/60 bg-muted p-2 pr-3">
            <img src={imageDataUrl} alt="Selected item" className="size-14 rounded-lg object-cover" />
            <span className="flex-1 truncate text-xs text-muted-foreground">{imageName}</span>
            <button type="button" onClick={clearImage} className="text-xs text-foreground/70 hover:text-foreground">
              Remove
            </button>
          </div>
        )}

        {localError && <p className="mt-3 px-1 text-sm text-hazardous">{localError}</p>}
      </form>

      <div className="animate-slide mt-4 flex flex-wrap gap-2 [animation-delay:300ms]">
        <span className="py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">Try</span>
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => runExample(example)}
            disabled={busy}
            className="rounded-full border border-border bg-muted px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-brand/60 hover:text-brand disabled:opacity-50"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
