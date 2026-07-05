export type ChrystyWorker = {
  slug: string;
  /** Supabase `worker_slug` when it differs from the app slug (e.g. learning → tutor). */
  platformSlug?: string;
  name: string;
  url: string;
  summary: string;
  signals: string[];
};

export const EXCLUDED_ACTIVITY_SLUGS = ['chrysty'] as const;

export function getPlatformSlug(worker: ChrystyWorker): string {
  return worker.platformSlug ?? worker.slug;
}

export function getWorkerByPlatformSlug(platformSlug: string): ChrystyWorker | undefined {
  return CHRYSTY_PROD_WORKERS.find((worker) => getPlatformSlug(worker) === platformSlug);
}

export function getWorkerBySlug(slug: string): ChrystyWorker | undefined {
  return CHRYSTY_PROD_WORKERS.find((worker) => worker.slug === slug);
}

export function resolveDisplaySlug(platformSlug: string): string | null {
  if ((EXCLUDED_ACTIVITY_SLUGS as readonly string[]).includes(platformSlug)) {
    return null;
  }

  const worker = getWorkerByPlatformSlug(platformSlug);
  return worker?.slug ?? platformSlug;
}

export const CHRYSTY_PROD_WORKERS: ChrystyWorker[] = [
  {
    slug: 'business-advisor',
    name: 'Business Advisor',
    url: 'https://advisor.chrysty.dev',
    summary:
      'Upload business files and get natural-language Q&A over finances, revenue, operations, and growth.',
    signals: ['finances', 'revenue', 'spreadsheets', 'growth', 'operations', 'profit', 'payroll'],
  },
  {
    slug: 'ledger',
    name: 'Chrysty AI Ledger',
    url: 'https://ledger.chrysty.dev',
    summary:
      'Small-business bookkeeping — receipts, invoices, expenses, and AI finance chat with structured reports.',
    signals: [
      'bookkeeping',
      'receipts',
      'invoices',
      'expenses',
      'accounting',
      'taxes',
      'cash flow',
      'quickbooks',
    ],
  },
  {
    slug: 'stylist',
    name: 'Chrysty AI Stylist',
    url: 'https://stylist.chrysty.dev',
    summary:
      'Wardrobe-aware outfit recommendations, occasion planning, and visual lookbooks from clothes you own.',
    signals: ['outfits', 'wardrobe', 'fashion', 'what to wear', 'style', 'clothes', 'dress'],
  },
  {
    slug: 'learning',
    platformSlug: 'tutor',
    name: 'Chrysty AI Learning',
    url: 'https://learn.chrysty.dev',
    summary:
      'Adaptive learning paths with Learn, Practice, and Think modes across subjects and skill levels.',
    signals: ['study', 'learn', 'homework', 'practice problems', 'think mode', 'math', 'education'],
  },
  {
    slug: 'practice',
    name: 'Chrysty AI Practice',
    url: 'https://practice.chrysty.dev',
    summary:
      'Voice roleplay practice for interviews, pitches, sales, and real-time communication coaching.',
    signals: [
      'interview prep',
      'pitch practice',
      'roleplay',
      'sales coaching',
      'presentation',
      'communication training',
    ],
  },
  {
    slug: 'recording',
    name: 'Chrysty Recording',
    url: 'https://recording.chrysty.dev',
    summary:
      'Voice capture and observation-first pipeline that structures spoken notes into a knowledge base.',
    signals: [
      'voice notes',
      'observations',
      'capture knowledge',
      'field notes',
      'dictation',
      'record thoughts',
    ],
  },
  {
    slug: 'content',
    name: 'Chrysty Creative Library',
    url: 'https://content.chrysty.dev',
    summary: 'AI-generated stories, podcasts, and audiobooks in a creative library workspace.',
    signals: ['stories', 'podcasts', 'audiobooks', 'creative writing', 'narrative', 'fiction'],
  },
];
