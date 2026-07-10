import type { GeneratedDocumentItem } from '@/hooks/use-generated-documents';
import type { BackgroundJobClientItem } from '@/lib/background-jobs/types';

export interface DocumentCollection {
  id: string;
  label: string;
  documents: GeneratedDocumentItem[];
  unreadCount: number;
}

const TWO_WORD_STARTERS = new Set(['monte carlo', '7-day']);

function mainSegment(title: string): string {
  return title.split(/\s*[—–-]\s*/)[0]?.trim() ?? title;
}

function normalizeTitle(title: string): string {
  return title
    .replace(/\s*[—–-]\s*(Overview|Final Report|Working Draft|.*Edition|.*Deck|.*Key).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleClusterKey(title: string): string {
  const main = mainSegment(title);
  const words = main.split(/\s+/).filter(Boolean);
  if (words.length === 0) return title.toLowerCase();

  const firstWord = words[0]!.toLowerCase();
  if (TWO_WORD_STARTERS.has(firstWord)) {
    return firstWord;
  }

  const twoWord = `${words[0]} ${words[1] ?? ''}`.trim().toLowerCase();
  if (words.length >= 2 && TWO_WORD_STARTERS.has(twoWord)) {
    return twoWord;
  }

  return firstWord;
}

function isOverviewTitle(title: string): boolean {
  return /\boverview\b/i.test(title);
}

function isWeakLabel(label: string): boolean {
  const trimmed = label.trim();
  if (!trimmed) return true;
  if (/^\d+$/.test(trimmed)) return true;
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length === 1 && trimmed.length <= 9;
}

function longestCommonWordPrefix(segments: string[]): string {
  const wordLists = segments.map((segment) => segment.split(/\s+/).filter(Boolean));
  if (wordLists.length === 0) return '';

  const common: string[] = [];
  const minLen = Math.min(...wordLists.map((words) => words.length));

  for (let index = 0; index < minLen; index++) {
    const word = wordLists[0]![index]!;
    if (wordLists.every((words) => words[index]?.toLowerCase() === word.toLowerCase())) {
      common.push(word);
    } else {
      break;
    }
  }

  return common.join(' ');
}

function matchJobTitleForCluster(
  documents: GeneratedDocumentItem[],
  backgroundJobs: BackgroundJobClientItem[],
): string | null {
  const segments = documents.map((doc) => mainSegment(doc.title).toLowerCase());
  const allText = segments.join(' ');

  for (const job of backgroundJobs) {
    const jobWords = job.title
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 3);
    if (jobWords.length === 0) continue;

    const matches = jobWords.filter((word) => allText.includes(word));
    if (matches.length >= Math.min(2, jobWords.length)) {
      return job.title;
    }
  }

  return null;
}

function inferCollectionLabel(
  documents: GeneratedDocumentItem[],
  backgroundJobs: BackgroundJobClientItem[] = [],
): string {
  if (documents.length === 0) return 'Documents';

  if (documents.length === 1) {
    const main = mainSegment(documents[0]!.title);
    return main.length > 0 ? main : documents[0]!.title;
  }

  const matchedJobTitle = matchJobTitleForCluster(documents, backgroundJobs);
  if (matchedJobTitle) return matchedJobTitle;

  const segments = documents.map((doc) => mainSegment(doc.title));

  const overviewDoc = documents.find((doc) => isOverviewTitle(doc.title));
  if (overviewDoc) {
    const fromOverview = normalizeTitle(overviewDoc.title);
    if (fromOverview.length >= 10 && !isWeakLabel(fromOverview)) {
      return fromOverview;
    }
  }

  const prefix = longestCommonWordPrefix(segments);
  const prefixWords = prefix.split(/\s+/).filter(Boolean);
  if (prefixWords.length >= 2 && !isWeakLabel(prefix)) {
    return prefix;
  }
  if (
    prefixWords.length === 1 &&
    prefixWords[0]!.length > 6 &&
    !/^\d+$/.test(prefixWords[0]!) &&
    !isWeakLabel(prefix)
  ) {
    return prefix;
  }

  const nonOverviewSegments = documents
    .filter((doc) => !isOverviewTitle(doc.title))
    .map((doc) => mainSegment(doc.title));
  const candidates = nonOverviewSegments.length > 0 ? nonOverviewSegments : segments;
  const sorted = [...candidates].sort((a, b) => a.length - b.length);
  const descriptive = sorted.find((segment) => segment.length >= 12);
  if (descriptive) return descriptive;

  return sorted[sorted.length - 1] ?? 'Documents';
}

function sortDocumentsInCollection(documents: GeneratedDocumentItem[]): GeneratedDocumentItem[] {
  return [...documents].sort((a, b) => {
    const activityDifference =
      Math.max(b.createdAt, b.updatedAt) - Math.max(a.createdAt, a.updatedAt);
    if (activityDifference !== 0) return activityDifference;
    if (Boolean(a.readAt) !== Boolean(b.readAt)) return a.readAt ? 1 : -1;
    return b.createdAt - a.createdAt;
  });
}

function sortCollections(collections: DocumentCollection[]): DocumentCollection[] {
  return [...collections].sort((a, b) => {
    const aNewest = Math.max(...a.documents.map((doc) => Math.max(doc.createdAt, doc.updatedAt)));
    const bNewest = Math.max(...b.documents.map((doc) => Math.max(doc.createdAt, doc.updatedAt)));
    if (aNewest !== bNewest) return bNewest - aNewest;
    return b.unreadCount - a.unreadCount;
  });
}

function buildJobDocumentMap(jobs: BackgroundJobClientItem[]): Map<string, BackgroundJobClientItem> {
  const map = new Map<string, BackgroundJobClientItem>();
  for (const job of jobs) {
    for (const documentId of job.documentIds) {
      map.set(documentId, job);
    }
  }
  return map;
}

function resolveJobForDocument(
  document: GeneratedDocumentItem,
  jobByDocumentId: Map<string, BackgroundJobClientItem>,
  jobsById: Map<string, BackgroundJobClientItem>,
): BackgroundJobClientItem | undefined {
  if (document.jobId) {
    const byId = jobsById.get(document.jobId);
    if (byId) return byId;
  }
  return jobByDocumentId.get(document.id);
}

export function groupDocumentsIntoCollections(
  documents: GeneratedDocumentItem[],
  backgroundJobs: BackgroundJobClientItem[] = [],
): DocumentCollection[] {
  if (documents.length === 0) return [];

  const jobByDocumentId = buildJobDocumentMap(backgroundJobs);
  const jobsById = new Map(backgroundJobs.map((job) => [job.id, job]));

  const jobGroups = new Map<string, { label: string; documents: GeneratedDocumentItem[] }>();
  const orphanDocuments: GeneratedDocumentItem[] = [];

  for (const document of documents) {
    const job = resolveJobForDocument(document, jobByDocumentId, jobsById);
    if (job) {
      const existing = jobGroups.get(job.id);
      if (existing) {
        existing.documents.push(document);
      } else {
        jobGroups.set(job.id, { label: job.title, documents: [document] });
      }
    } else {
      orphanDocuments.push(document);
    }
  }

  const clusterBuckets = new Map<string, GeneratedDocumentItem[]>();
  for (const document of orphanDocuments) {
    const key = titleClusterKey(document.title);
    const bucket = clusterBuckets.get(key) ?? [];
    bucket.push(document);
    clusterBuckets.set(key, bucket);
  }

  const collections: DocumentCollection[] = [];

  for (const [jobId, group] of jobGroups) {
    const sorted = sortDocumentsInCollection(group.documents);
    collections.push({
      id: `job:${jobId}`,
      label: group.label,
      documents: sorted,
      unreadCount: sorted.filter((doc) => !doc.readAt).length,
    });
  }

  for (const [clusterKey, clusterDocs] of clusterBuckets) {
    const sorted = sortDocumentsInCollection(clusterDocs);
    const isSingleton = sorted.length === 1;
    const id = isSingleton ? `quick:${sorted[0]!.id}` : `cluster:${clusterKey}`;

    collections.push({
      id,
      label: inferCollectionLabel(sorted, backgroundJobs),
      documents: sorted,
      unreadCount: sorted.filter((doc) => !doc.readAt).length,
    });
  }

  const sortedCollections = sortCollections(collections);

  const multiDocCollections = sortedCollections.filter((collection) => collection.documents.length > 1);
  const singletonCollections = sortedCollections.filter((collection) => collection.documents.length === 1);

  if (singletonCollections.length > 1) {
    const quickSaves: DocumentCollection = {
      id: 'quick-saves',
      label: 'Quick saves',
      documents: sortDocumentsInCollection(singletonCollections.flatMap((c) => c.documents)),
      unreadCount: singletonCollections.reduce((sum, c) => sum + c.unreadCount, 0),
    };
    return sortCollections([...multiDocCollections, quickSaves]);
  }

  if (singletonCollections.length === 1 && multiDocCollections.length === 0) {
    return singletonCollections;
  }

  return sortCollections([...multiDocCollections, ...singletonCollections]);
}
