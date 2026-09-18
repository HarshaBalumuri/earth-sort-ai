import { useRef, useState } from "react";

export type ClassifyPayload = { itemName: string; imageDataUrl: string | null };

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

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
  const [localError, setLocalError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | undefined) => {
    setLocalError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLocalError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setLocalError("Image is too large — please use one under 4 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(String(reader.result));
      setImageName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImageDataUrl(null);
    setImageName(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() && !imageDataUrl) {
      setLocalError("Type an item name or add a photo first.");
      return;
    }
    setLocalError(null);
    onSubmit({ itemName: itemName.trim(), imageDataUrl });
  };

  return (
    <form onSubmit={submit} className="glass animate-slide mt-8 max-w-2xl rounded-2xl p-3 [animation-delay:240ms]">
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
          {imageName ? "Change image" : "+ Image"}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-brand px-6 py-3 font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Analyzing…" : "Analyze"}
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
  );
}
