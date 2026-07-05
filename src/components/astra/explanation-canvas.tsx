'use client';

import dynamic from 'next/dynamic';
import { Save, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

import { PhysicalTaskPanel } from '@/components/astra/physical-task-panel';
import { PlaceCard } from '@/components/astra/place-card';
import { StockImageGroups } from '@/components/astra/stock-image-groups';
import { ToolCallBadges } from '@/components/astra/tool-call-badges';
import { VisualGuidanceGallery } from '@/components/astra/visual-guidance-gallery';
import { WebSourcesList } from '@/components/astra/web-sources-list';
import type { ChartSpec, CodeExecutionImage } from '@/lib/charts/types';
import type { PhysicalTaskResponse, VisualGuidanceResponse } from '@/lib/gemini/voice-response-schema';
import type { GuidanceImage, PlaceCard as PlaceCardData, WebCitation } from '@/lib/streaming/types';
import type { StockImageGroup } from '@/lib/visuals/stock-images';

const ExplanationChart = dynamic(
  () => import('@/components/astra/explanation-chart').then((mod) => mod.ExplanationChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-60 animate-pulse rounded-xl border border-border bg-muted" />
    ),
  },
);

const CodeExecutionImageView = dynamic(
  () => import('@/components/astra/code-execution-image').then((mod) => mod.CodeExecutionImageView),
  {
    ssr: false,
    loading: () => (
      <div className="h-48 animate-pulse rounded-xl border border-border bg-muted" />
    ),
  },
);

const RichExplanationContent = dynamic(
  () => import('@/components/astra/rich-explanation-content').then((mod) => mod.RichExplanationContent),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse space-y-2">
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-5/6 rounded bg-muted" />
      </div>
    ),
  },
);

const DEFAULT_DURATION_MS = 8000;

function linkifyText(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(https?:\/\/[^\s]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    parts.push(
      <a
        key={`${match.index}-${match[0]}`}
        href={match[0]}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:opacity-80"
      >
        {match[0]}
      </a>,
    );

    lastIndex = regex.lastIndex;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

interface StreamingPreviewProps {
  text: string;
  scrollRef: RefObject<HTMLDivElement | null>;
}

function StreamingPreview({ text, scrollRef }: StreamingPreviewProps) {
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [scrollRef, text]);

  return (
    <p className="text-base leading-relaxed text-foreground whitespace-pre-wrap sm:text-[1.05rem]">
      {linkifyText(text)}
      <span
        className="ml-0.5 inline-block h-[1.1em] w-0.5 translate-y-px animate-pulse bg-primary"
        aria-hidden="true"
      />
    </p>
  );
}

interface FadeInRichContentProps {
  text: string;
  durationMs?: number | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  onComplete?: () => void;
}

function FadeInRichContent({ text, durationMs, scrollRef, onComplete }: FadeInRichContentProps) {
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    const estimatedDuration = durationMs && durationMs > 0 ? durationMs : DEFAULT_DURATION_MS;
    const frame = requestAnimationFrame(() => setOpacity(1));
    const timer = setTimeout(() => onComplete?.(), estimatedDuration);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [durationMs, onComplete, text]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [scrollRef, text, opacity]);

  return (
    <div
      className="transition-opacity ease-out"
      style={{
        opacity,
        transitionDuration: `${durationMs && durationMs > 0 ? durationMs : DEFAULT_DURATION_MS}ms`,
      }}
    >
      <RichExplanationContent text={text} />
    </div>
  );
}

interface ExplanationCanvasProps {
  fullText: string;
  isStreaming?: boolean;
  places?: PlaceCardData[];
  charts?: ChartSpec[];
  codeImages?: CodeExecutionImage[];
  stockImages?: StockImageGroup[];
  webCitations?: WebCitation[];
  customToolCalls?: string[];
  physicalTask?: PhysicalTaskResponse | null;
  visualGuidance?: VisualGuidanceResponse | null;
  userImages?: GuidanceImage[];
  active: boolean;
  durationMs?: number | null;
  onDismiss?: () => void;
  onSave?: () => void;
  saveDisabled?: boolean;
  isSaving?: boolean;
}

export function ExplanationCanvas({
  fullText,
  isStreaming = false,
  places = [],
  charts = [],
  codeImages = [],
  stockImages = [],
  webCitations = [],
  customToolCalls = [],
  physicalTask = null,
  visualGuidance = null,
  userImages = [],
  active,
  durationMs,
  onDismiss,
  onSave,
  saveDisabled = false,
  isSaving = false,
}: ExplanationCanvasProps) {
  const hasVisualExtras =
    charts.length > 0 ||
    places.length > 0 ||
    codeImages.length > 0 ||
    stockImages.length > 0 ||
    webCitations.length > 0 ||
    physicalTask !== null ||
    visualGuidance !== null ||
    userImages.length > 0;

  return (
    <ExplanationCanvasBody
      key={`${fullText}|${hasVisualExtras}`}
      fullText={fullText}
      isStreaming={isStreaming}
      places={places}
      charts={charts}
      codeImages={codeImages}
      stockImages={stockImages}
      webCitations={webCitations}
      customToolCalls={customToolCalls}
      physicalTask={physicalTask}
      visualGuidance={visualGuidance}
      userImages={userImages}
      active={active}
      durationMs={durationMs}
      onDismiss={onDismiss}
      onSave={onSave}
      saveDisabled={saveDisabled}
      isSaving={isSaving}
      hasVisualExtras={hasVisualExtras}
    />
  );
}

function ExplanationCanvasBody({
  fullText,
  isStreaming = false,
  places = [],
  charts = [],
  codeImages = [],
  stockImages = [],
  webCitations = [],
  customToolCalls = [],
  physicalTask = null,
  visualGuidance = null,
  userImages = [],
  active,
  durationMs,
  onDismiss,
  onSave,
  saveDisabled = false,
  isSaving = false,
  hasVisualExtras,
}: ExplanationCanvasProps & { hasVisualExtras: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const deferVisualExtras = Boolean(fullText && hasVisualExtras);
  const [showVisualExtras, setShowVisualExtras] = useState(!deferVisualExtras);
  const saveLabel = isSaving ? 'Saving creations' : 'Save creations';

  const handleSummaryComplete = () => {
    if (hasVisualExtras) {
      setShowVisualExtras(true);
    }
  };

  return (
    <div className="relative w-full max-w-[min(96vw,28rem)] sm:max-w-md md:max-w-xl lg:max-w-2xl">
      {(onDismiss || onSave) ? (
        <div className="absolute -right-1 -top-1 z-10 flex items-center gap-1">
          {onSave ? (
            <button
              type="button"
              onClick={onSave}
              disabled={saveDisabled || isSaving}
              aria-label={saveLabel}
              title={saveLabel}
              aria-busy={isSaving}
              className="flex size-9 items-center justify-center rounded-full
                border border-border bg-card text-muted-foreground
                transition-colors hover:bg-accent hover:text-foreground
                disabled:pointer-events-none disabled:opacity-40"
            >
              <Save className="size-4" aria-hidden="true" />
            </button>
          ) : null}
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close explanation"
              className="flex size-9 items-center justify-center rounded-full
                border border-border bg-card text-muted-foreground
                transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
      <div
        ref={scrollRef}
        className="w-full scroll-smooth
        min-h-[min(72vw,18rem)] max-h-[min(62vh,28rem)]
        sm:min-h-72 sm:max-h-128 md:min-h-80 md:max-h-144
        overflow-y-auto overflow-x-hidden rounded-2xl border border-border
        bg-card p-4 shadow-sm sm:p-5"
        aria-live="polite"
        aria-atomic="true"
        aria-label="Visual explanation"
      >
        {active && customToolCalls.length > 0 ? <ToolCallBadges toolNames={customToolCalls} /> : null}

        {active && userImages.length > 0 ? (
          <div className={fullText ? 'mb-5' : ''}>
            <VisualGuidanceGallery
              images={userImages}
              guidance={visualGuidance}
              hasCompanionGuidance={physicalTask !== null || fullText.length > 0}
            />
          </div>
        ) : null}

        {active && physicalTask ? (
          <div className={fullText || userImages.length > 0 ? 'mb-5' : ''}>
            <PhysicalTaskPanel task={physicalTask} />
          </div>
        ) : null}

        {active && fullText ? (
          isStreaming ? (
            <StreamingPreview text={fullText} scrollRef={scrollRef} />
          ) : (
            <FadeInRichContent
              key={fullText}
              text={fullText}
              durationMs={durationMs}
              scrollRef={scrollRef}
              onComplete={handleSummaryComplete}
            />
          )
        ) : null}

        {active && showVisualExtras && charts.length > 0 ? (
          <div className={`space-y-3 ${fullText ? 'mt-5' : ''}`}>
            {charts.map((chart, index) => (
              <ExplanationChart key={chart.id ?? `chart-${index}`} chart={chart} index={index} />
            ))}
          </div>
        ) : null}

        {active && showVisualExtras && stockImages.length > 0 ? (
          <div className={`${fullText || charts.length > 0 ? 'mt-5' : ''}`}>
            <StockImageGroups groups={stockImages} />
          </div>
        ) : null}

        {active && showVisualExtras && places.length > 0 ? (
          <div
            className={`space-y-3 ${
              fullText || charts.length > 0 || stockImages.length > 0 ? 'mt-5' : ''
            }`}
          >
            {places.map((place, index) => (
              <PlaceCard key={place.placeId ?? place.url ?? `${place.name}-${index}`} place={place} index={index} />
            ))}

            <div className="border-t border-border pt-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                <span translate="no">Google Maps</span> sources
              </p>
              <ul className="mt-2 space-y-1.5">
                {places
                  .filter((place) => place.url)
                  .map((place, index) => (
                    <li key={`source-${place.placeId ?? place.url ?? index}`} className="text-sm text-foreground">
                      {index + 1}.{' '}
                      <a
                        href={place.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary hover:opacity-80"
                      >
                        {place.name}
                      </a>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        ) : null}

        {active && showVisualExtras && codeImages.length > 0 ? (
          <div
            className={`space-y-3 ${
              fullText || charts.length > 0 || stockImages.length > 0 || places.length > 0
                ? 'mt-5'
                : ''
            }`}
          >
            {codeImages.map((image, index) => (
              <CodeExecutionImageView key={`code-image-${index}`} image={image} index={index} />
            ))}
          </div>
        ) : null}

        {active && showVisualExtras && webCitations.length > 0 ? (
          <div
            className={`${
              fullText ||
              charts.length > 0 ||
              stockImages.length > 0 ||
              places.length > 0 ||
              codeImages.length > 0
                ? 'mt-5'
                : ''
            }`}
          >
            <WebSourcesList citations={webCitations} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
