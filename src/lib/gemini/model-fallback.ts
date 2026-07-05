function errorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name} ${error.message}`.toLowerCase();
  }
  return String(error).toLowerCase();
}

export function isGeminiModelAvailabilityError(error: unknown): boolean {
  const text = errorText(error);
  return (
    text.includes('model not found') ||
    text.includes('not found for api version') ||
    text.includes('is not found') ||
    text.includes('unavailable') ||
    text.includes('temporarily unavailable') ||
    text.includes('deadline exceeded') ||
    text.includes('status 404') ||
    text.includes('status: 404') ||
    text.includes('status 503') ||
    text.includes('status: 503')
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, model: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Gemini model ${model} deadline exceeded after ${timeoutMs}ms.`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function runWithGeminiModelFallback<T>(
  models: string[],
  run: (model: string) => Promise<T>,
  options?: { timeoutMs?: number },
): Promise<{ model: string; result: T }> {
  const candidates = models.map((model) => model.trim()).filter(Boolean);
  if (candidates.length === 0) {
    throw new Error('No Gemini model candidates configured.');
  }

  let lastError: unknown;

  for (let index = 0; index < candidates.length; index += 1) {
    const model = candidates[index];
    try {
      return {
        model,
        result: await withTimeout(run(model), options?.timeoutMs ?? 0, model),
      };
    } catch (error) {
      lastError = error;
      const hasFallback = index < candidates.length - 1;
      if (!hasFallback || !isGeminiModelAvailabilityError(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Gemini model fallback failed.');
}
