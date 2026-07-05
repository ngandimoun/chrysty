import type { BenchmarkValidator } from './benchmark-validate';
import {
  validateBudgetSpreadsheetStyle,
  validateChartMarketTrends,
  validateCodeMonteCarlo,
  validateMathPhysicsProjectile,
  validateResearchComparisonTable,
  validateStudyKitMulti,
  validateVisualTravelGuide,
} from './benchmark-validate';

export const BENCHMARK_ASTRA_KEY = 'ak_chrysty_benchmark_suite';

export interface BackgroundJobBenchmarkCase {
  id: string;
  title: string;
  objective: string;
  timeoutMs: number;
  validate: BenchmarkValidator;
}

export const BACKGROUND_JOB_BENCHMARK_CASES: BackgroundJobBenchmarkCase[] = [
  {
    id: 'research-comparison-table',
    title: 'Agent framework comparison',
    objective:
      'Research and compare five major AI agent frameworks (LangGraph, Mastra, CrewAI, AutoGen, OpenAI Agents SDK). ' +
      'Create separate polished markdown documents: (1) an executive summary with a GFM comparison table covering strengths, weaknesses, licensing, and best use cases; ' +
      '(2) a detailed research notes document with inline markdown links to authoritative sources for every major claim. ' +
      'Use web search. Keep each document self-contained and well-formatted.',
    timeoutMs: 20 * 60_000,
    validate: validateResearchComparisonTable,
  },
  {
    id: 'chart-market-trends',
    title: 'Renewable energy market trends',
    objective:
      'Research current global renewable energy adoption trends. Save: (1) a chart document (kind chart) with at least 5 countries, bar or line chart, showing renewable share or capacity with real researched numbers; ' +
      '(2) a text executive summary explaining the trends with a short markdown table of key statistics and source links. Use web search for current data.',
    timeoutMs: 20 * 60_000,
    validate: validateChartMarketTrends,
  },
  {
    id: 'math-physics-projectile',
    title: 'Projectile motion study guide',
    objective:
      'Create a concise physics study guide on projectile motion for a high-school student. Include: kinematic equations with KaTeX math ($...$ and $$...$$), ' +
      'three fully worked numbered examples (different launch angles), a small reference table of formulas, and five practice problems with answers at the end. ' +
      'Save as one polished markdown document.',
    timeoutMs: 15 * 60_000,
    validate: validateMathPhysicsProjectile,
  },
  {
    id: 'code-monte-carlo',
    title: 'Monte Carlo pi estimation',
    objective:
      'Use the code runner to implement Monte Carlo estimation of pi in Python with sample sizes 1,000 / 10,000 / 100,000 / 1,000,000. ' +
      'Save one markdown document with the complete Python code in a fenced block, a results markdown table (sample size, pi estimate, absolute error), ' +
      'and a brief explanation of why Monte Carlo works. Run the code — do not fabricate results.',
    timeoutMs: 10 * 60_000,
    validate: validateCodeMonteCarlo,
  },
  {
    id: 'study-kit-multi',
    title: 'Photosynthesis study kit',
    objective:
      'Build a complete photosynthesis study kit as three separate markdown documents: (1) a study guide explaining the process clearly; ' +
      '(2) at least 15 flashcards in Q&A format; (3) a 10-question quiz with an answer key. ' +
      'Each document must be saved separately with createDocument. Suitable for a student exam tomorrow.',
    timeoutMs: 25 * 60_000,
    validate: validateStudyKitMulti,
  },
  {
    id: 'budget-spreadsheet-style',
    title: 'Europe trip budget planner',
    objective:
      'Create a detailed 7-day Europe trip budget planner (Paris + Amsterdam) for one traveler under $2,000 USD total. ' +
      'Save one markdown document with a day-by-day budget table (category, planned cost, notes), subtotals, currency conversions where helpful, ' +
      'and a final summary row. Use calculations and unit/currency conversion tools where appropriate. Format currency clearly.',
    timeoutMs: 20 * 60_000,
    validate: validateBudgetSpreadsheetStyle,
  },
  {
    id: 'visual-travel-guide',
    title: 'Kyoto travel guide',
    objective:
      'Create a polished 3-day Kyoto travel guide markdown document with neighborhood highlights, sample daily itinerary, and practical tips. ' +
      'Include imageSearches for real-world reference photos of key landmarks (temples, bamboo grove, markets). Use fetch/web search for accurate current info.',
    timeoutMs: 20 * 60_000,
    validate: (docs, options) =>
      validateVisualTravelGuide(docs, Boolean(options?.pexelsConfigured)),
  },
];

export function getBackgroundJobBenchmarkCases(filterId?: string): BackgroundJobBenchmarkCase[] {
  if (!filterId) return BACKGROUND_JOB_BENCHMARK_CASES;
  return BACKGROUND_JOB_BENCHMARK_CASES.filter((item) => item.id === filterId);
}
