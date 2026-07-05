'use client';

import { AlertTriangle, CheckCircle2, ListChecks, ScanEye, Sparkles, Tag } from 'lucide-react';

import type { PhysicalTaskResponse } from '@/lib/gemini/voice-response-schema';

interface PhysicalTaskPanelProps {
  task: PhysicalTaskResponse;
}

function hasContent(task: PhysicalTaskResponse): boolean {
  return (
    Boolean(task.task_state) ||
    task.observed_evidence.length > 0 ||
    task.next_actions.length > 0 ||
    task.safety_notes.length > 0 ||
    task.follow_up_suggestions.length > 0 ||
    task.visual_annotations.length > 0
  );
}

export function PhysicalTaskPanel({ task }: PhysicalTaskPanelProps) {
  if (!hasContent(task)) return null;

  const state = task.task_state;
  const stateChips = [
    state?.task ? { label: 'Task', value: state.task } : null,
    state?.stage ? { label: 'Stage', value: state.stage } : null,
    state?.progress ? { label: 'Progress', value: state.progress } : null,
    state?.confidence ? { label: 'Confidence', value: state.confidence } : null,
  ].filter((chip): chip is { label: string; value: string } => chip !== null);

  return (
    <div className="space-y-4">
      {stateChips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {stateChips.map((chip) => (
            <span
              key={chip.label}
              className="rounded-full border border-border bg-muted px-2.5 py-1 text-[0.7rem] text-foreground"
            >
              <span className="uppercase tracking-wide text-muted-foreground">{chip.label}: </span>
              <span className="font-medium">{chip.value}</span>
            </span>
          ))}
        </div>
      ) : null}

      {task.next_actions.length > 0 ? (
        <section className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
            <ListChecks className="size-3.5" aria-hidden="true" />
            Next steps
          </h4>
          <ol className="space-y-2">
            {task.next_actions.map((action, index) => (
              <li
                key={`${action.title}-${index}`}
                className="rounded-xl border border-border bg-card p-3"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-foreground">{action.title}</p>
                    {action.detail ? (
                      <p className="text-sm leading-relaxed text-muted-foreground">{action.detail}</p>
                    ) : null}
                    {action.why ? (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        <span className="font-medium text-foreground">Why: </span>
                        {action.why}
                      </p>
                    ) : null}
                    {action.check ? (
                      <p className="flex items-start gap-1 text-xs leading-relaxed text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                        {action.check}
                      </p>
                    ) : null}
                    {action.example ? (
                      <p className="text-xs italic leading-relaxed text-muted-foreground">{action.example}</p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {task.observed_evidence.length > 0 ? (
        <section className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
            <ScanEye className="size-3.5" aria-hidden="true" />
            What I can see
          </h4>
          <ul className="space-y-1.5">
            {task.observed_evidence.map((item, index) => (
              <li key={`${item.text}-${index}`} className="text-sm leading-relaxed text-foreground">
                <span className="mr-1.5 text-muted-foreground">-</span>
                {item.text}
                {item.confidence ? (
                  <span className="ml-1.5 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                    ({item.confidence})
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {task.visual_annotations.length > 0 ? (
        <section className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
            <Tag className="size-3.5" aria-hidden="true" />
            Labeled items
          </h4>
          <div className="flex flex-wrap gap-2">
            {task.visual_annotations.map((annotation, index) => (
              <span
                key={`${annotation.label}-${index}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[0.75rem] text-foreground"
              >
                <span className="grid size-4 place-items-center rounded-full bg-primary text-[0.6rem] font-bold text-primary-foreground">
                  {index + 1}
                </span>
                {annotation.label}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {task.safety_notes.length > 0 ? (
        <section className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            Heads up
          </h4>
          <ul className="space-y-2">
            {task.safety_notes.map((note, index) => (
              <li
                key={`${note.message}-${index}`}
                className="rounded-xl border border-amber-300/40 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950 dark:border-amber-300/20 dark:bg-amber-500/10 dark:text-amber-50"
              >
                {note.message}
                {note.stopCondition ? (
                  <span className="mt-1 block text-xs text-amber-800/80 dark:text-amber-100/70">
                    Stop if: {note.stopCondition}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {task.follow_up_suggestions.length > 0 ? (
        <section className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="size-3.5" aria-hidden="true" />
            You could also ask
          </h4>
          <div className="flex flex-wrap gap-2">
            {task.follow_up_suggestions.map((suggestion, index) => (
              <span
                key={`${suggestion}-${index}`}
                className="rounded-full border border-border bg-muted px-2.5 py-1 text-[0.75rem] text-muted-foreground"
              >
                {suggestion}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
