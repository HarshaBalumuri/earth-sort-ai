const LOVABLE_AIG_RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

// Returns a fetch wrapper that resends a known gateway run id and captures the
// one the gateway mints, so calls correlate with AI usage logs.
export function createLovableAiGatewayRunIdFetch(initialRunId?: string) {
  let runId = initialRunId?.trim() || undefined;

  return {
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has(LOVABLE_AIG_RUN_ID_HEADER)) {
        headers.set(LOVABLE_AIG_RUN_ID_HEADER, runId);
      }
      const response = await fetch(input, { ...init, headers });
      const minted = response.headers.get(LOVABLE_AIG_RUN_ID_HEADER)?.trim();
      if (!runId && minted) runId = minted;
      return response;
    }) as typeof fetch,
    getRunId: () => runId,
  };
}
