'use client';

import { Bell, Check, Clock3, X } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ManageCapabilityInput, ScheduledCapability } from '@/lib/capabilities/types';

export function CapabilitiesSheet({
  open,
  onOpenChange,
  capabilities,
  onAction,
  onEnableNotifications,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  capabilities: ScheduledCapability[];
  onAction: (input: ManageCapabilityInput) => void;
  onEnableNotifications: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton
        className="max-h-[min(85dvh,34rem)] rounded-t-3xl border-white/10 bg-slate-950/95 text-cyan-50 backdrop-blur-md"
      >
        <SheetHeader>
          <SheetTitle className="text-cyan-50">Timers and reminders</SheetTitle>
          <SheetDescription className="text-slate-400">
            Your active timers, reminders, and checkpoints.
          </SheetDescription>
        </SheetHeader>
        <div className="mb-3 px-1">
          <button
            type="button"
            onClick={onEnableNotifications}
            className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/25 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-500/10"
          >
            <Bell className="size-3.5" aria-hidden />
            Enable notifications
          </button>
        </div>
        <ul className="flex flex-1 flex-col gap-3 overflow-y-auto px-1 pb-4">
          {capabilities.length === 0 ? (
            <li className="py-8 text-center text-sm text-slate-400">No active scheduled items.</li>
          ) : (
            capabilities.map((capability) => (
              <li key={capability.id} className="rounded-2xl border border-white/10 bg-slate-900/60 p-3">
                <div className="flex items-start gap-2">
                  <Clock3 className="mt-0.5 size-4 shrink-0 text-cyan-300" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{capability.title}</p>
                    <p className="text-xs text-slate-400">
                      {capability.status === 'due'
                        ? 'Due now'
                        : new Date(capability.fireAt).toLocaleString([], {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                            timeZone: capability.timezone,
                          })}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onAction({
                        action: 'snooze',
                        capability_id: capability.id,
                        expected_revision: capability.revision,
                        snooze_minutes: 10,
                        confirmed_user_intent: true,
                      })
                    }
                    className="rounded-full border border-cyan-400/25 px-3 py-1.5 text-xs hover:bg-cyan-500/10"
                  >
                    Snooze 10m
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onAction({
                        action: 'complete',
                        capability_id: capability.id,
                        expected_revision: capability.revision,
                        confirmed_user_intent: true,
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 px-3 py-1.5 text-xs hover:bg-emerald-500/10"
                  >
                    <Check className="size-3" aria-hidden /> Complete
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onAction({
                        action: 'cancel',
                        capability_id: capability.id,
                        expected_revision: capability.revision,
                        confirmed_user_intent: true,
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-full border border-rose-400/25 px-3 py-1.5 text-xs hover:bg-rose-500/10"
                  >
                    <X className="size-3" aria-hidden /> Cancel
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
