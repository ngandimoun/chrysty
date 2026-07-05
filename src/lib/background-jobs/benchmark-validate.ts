import type {
  GeneratedChartPayload,
  GeneratedTextPayload,
} from '@/lib/documents/generated-document-types';

export interface BenchmarkDocumentRow {
  id: string;
  kind: string;
  title: string;
  json_payload: string | null;
}

export interface BenchmarkValidationCheck {
  id: string;
  passed: boolean;
  detail: string;
}

export interface BenchmarkValidationResult {
  passed: boolean;
  checks: BenchmarkValidationCheck[];
}

function parseTextPayload(jsonPayload: string | null): GeneratedTextPayload | null {
  if (!jsonPayload?.trim()) return null;
  try {
    return JSON.parse(jsonPayload) as GeneratedTextPayload;
  } catch {
    return null;
  }
}

function parseChartPayload(jsonPayload: string | null): GeneratedChartPayload | null {
  if (!jsonPayload?.trim()) return null;
  try {
    return JSON.parse(jsonPayload) as GeneratedChartPayload;
  } catch {
    return null;
  }
}

function textDocs(docs: BenchmarkDocumentRow[]): BenchmarkDocumentRow[] {
  return docs.filter((doc) => doc.kind === 'text');
}

function chartDocs(docs: BenchmarkDocumentRow[]): BenchmarkDocumentRow[] {
  return docs.filter((doc) => doc.kind === 'chart');
}

function allTextContent(docs: BenchmarkDocumentRow[]): string {
  return textDocs(docs)
    .map((doc) => parseTextPayload(doc.json_payload)?.fullText ?? '')
    .join('\n\n');
}

function check(id: string, passed: boolean, detail: string): BenchmarkValidationCheck {
  return { id, passed, detail };
}

function finalize(checks: BenchmarkValidationCheck[]): BenchmarkValidationResult {
  return {
    passed: checks.every((item) => item.passed),
    checks,
  };
}

export function validateResearchComparisonTable(docs: BenchmarkDocumentRow[]): BenchmarkValidationResult {
  const checks: BenchmarkValidationCheck[] = [];
  const texts = textDocs(docs);

  checks.push(
    check(
      'min-text-docs',
      texts.length >= 2,
      `expected >=2 text docs, got ${texts.length}`,
    ),
  );

  const combined = allTextContent(docs);
  checks.push(
    check(
      'has-table',
      /\|.+\|/.test(combined) && /\|[-:\s|]+\|/.test(combined),
      'expected GFM markdown table with header separator row',
    ),
  );
  checks.push(
    check(
      'has-links',
      /https?:\/\//i.test(combined),
      'expected at least one http(s) source link in document text',
    ),
  );

  return finalize(checks);
}

export function validateChartMarketTrends(docs: BenchmarkDocumentRow[]): BenchmarkValidationResult {
  const checks: BenchmarkValidationCheck[] = [];
  const charts = chartDocs(docs);
  const texts = textDocs(docs);

  checks.push(
    check('min-chart-docs', charts.length >= 1, `expected >=1 chart doc, got ${charts.length}`),
  );
  checks.push(
    check('min-text-summary', texts.length >= 1, `expected >=1 text summary doc, got ${texts.length}`),
  );

  const chartPayload = parseChartPayload(charts[0]?.json_payload ?? null);
  const chart = chartPayload?.chart;
  checks.push(
    check(
      'chart-spec-valid',
      Boolean(chart?.series?.length && chart.data?.length),
      'expected chart with series and data rows',
    ),
  );

  return finalize(checks);
}

export function validateMathPhysicsProjectile(docs: BenchmarkDocumentRow[]): BenchmarkValidationResult {
  const checks: BenchmarkValidationCheck[] = [];
  const combined = allTextContent(docs);

  checks.push(
    check('min-text-docs', textDocs(docs).length >= 1, 'expected >=1 text doc'),
  );
  checks.push(
    check(
      'has-katex',
      /\$[^$\n]+\$/.test(combined) || /\$\$[\s\S]+?\$\$/.test(combined),
      'expected inline or block KaTeX math ($...$ or $$...$$)',
    ),
  );
  checks.push(
    check(
      'has-numbered-steps',
      /^\s*\d+\.\s/m.test(combined) || /^\s*\d+\)\s/m.test(combined),
      'expected numbered worked examples or steps',
    ),
  );

  return finalize(checks);
}

export function validateCodeMonteCarlo(docs: BenchmarkDocumentRow[]): BenchmarkValidationResult {
  const checks: BenchmarkValidationCheck[] = [];
  const combined = allTextContent(docs);

  checks.push(
    check('min-text-docs', textDocs(docs).length >= 1, 'expected >=1 text doc'),
  );
  checks.push(
    check(
      'has-python-fence',
      /```python[\s\S]+?```/i.test(combined),
      'expected fenced python code block',
    ),
  );
  checks.push(
    check(
      'has-results-table',
      /\|.+\|/.test(combined),
      'expected numeric results in a markdown table',
    ),
  );

  return finalize(checks);
}

export function validateStudyKitMulti(docs: BenchmarkDocumentRow[]): BenchmarkValidationResult {
  const checks: BenchmarkValidationCheck[] = [];

  checks.push(
    check(
      'min-text-docs',
      textDocs(docs).length >= 3,
      `expected >=3 text docs (guide + flashcards + quiz), got ${textDocs(docs).length}`,
    ),
  );

  return finalize(checks);
}

export function validateBudgetSpreadsheetStyle(docs: BenchmarkDocumentRow[]): BenchmarkValidationResult {
  const checks: BenchmarkValidationCheck[] = [];
  const combined = allTextContent(docs);

  checks.push(
    check('min-text-docs', textDocs(docs).length >= 1, 'expected >=1 text doc'),
  );
  checks.push(
    check(
      'has-budget-table',
      /\|.+\|/.test(combined) && /\|[-:\s|]+\|/.test(combined),
      'expected budget markdown table',
    ),
  );
  checks.push(
    check(
      'has-currency-or-numbers',
      /[$€£¥]|\bUSD\b|\bEUR\b|\d{1,3}(?:,\d{3})+/.test(combined),
      'expected formatted currency or large numbers',
    ),
  );

  return finalize(checks);
}

export function validateVisualTravelGuide(
  docs: BenchmarkDocumentRow[],
  pexelsConfigured: boolean,
): BenchmarkValidationResult {
  const checks: BenchmarkValidationCheck[] = [];
  const texts = textDocs(docs);

  checks.push(
    check('min-text-docs', texts.length >= 1, `expected >=1 text doc, got ${texts.length}`),
  );

  if (pexelsConfigured) {
    const hasStockImages = texts.some((doc) => {
      const payload = parseTextPayload(doc.json_payload);
      return Boolean(payload?.stockImages?.length);
    });
    checks.push(
      check(
        'has-stock-images',
        hasStockImages,
        'expected stockImages in text payload when PEXELS_API_KEY is configured',
      ),
    );
  } else {
    checks.push(
      check(
        'pexels-skipped',
        true,
        'PEXELS_API_KEY not set — skipping stockImages check',
      ),
    );
  }

  return finalize(checks);
}

export type BenchmarkValidator = (
  docs: BenchmarkDocumentRow[],
  options?: { pexelsConfigured?: boolean },
) => BenchmarkValidationResult;
