import { useSyncExternalStore } from "react";
import type { ClassificationResult } from "./ecosort.functions";

/**
 * Module-level store for the last classification.
 *
 * Deliberately NOT component state and NOT the query cache: a POST server
 * function can invalidate the router and remount the route, which wipes both
 * component state and mutation state. This store lives outside React and is
 * mirrored into sessionStorage, so the result card can never be blanked by a
 * re-render, remount, or reload. It is only replaced by a newer successful
 * result, or emptied when the user explicitly clears it.
 */
const STORAGE_KEY = "ecosort:last-result";

let current: ClassificationResult | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) current = JSON.parse(raw) as ClassificationResult;
  } catch {
    /* ignore unreadable storage */
  }
}

function emit() {
  listeners.forEach((l) => l());
}

function isValid(result: unknown): result is ClassificationResult {
  return (
    !!result &&
    typeof result === "object" &&
    typeof (result as ClassificationResult).itemName === "string" &&
    typeof (result as ClassificationResult).category === "string"
  );
}

/** Stores a result. Null/undefined/empty responses are ignored, never stored. */
export function saveResult(result: ClassificationResult | null | undefined) {
  hydrate();
  if (!isValid(result)) {
    console.warn("[EcoSort] ignoring empty/invalid response — keeping previous result visible", result);
    return;
  }
  current = result;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  } catch {
    /* storage full or unavailable — in-memory copy still works */
  }
  console.log("[EcoSort] result saved:", result.itemName, "→", result.category, `(${result.confidence}%)`);
  emit();
}

/** Only called from the explicit "Clear result" button. */
export function clearStoredResult() {
  hydrate();
  current = null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  console.log("[EcoSort] result cleared by user");
  emit();
}

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  hydrate();
  return current;
}

function getServerSnapshot(): ClassificationResult | null {
  return null;
}

export function useLastResult() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
