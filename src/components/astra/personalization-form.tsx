'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Search, Upload } from 'lucide-react';

import { DocumentStrip } from '@/components/astra/document-strip';
import { touchButtonClass } from '@/components/astra/camera-tool-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCompanionProfile } from '@/hooks/use-companion-profile';
import { useReferenceDocuments } from '@/hooks/use-reference-documents';
import type {
  InteractionPreferenceArrayField,
  InteractionPreferenceTextField,
} from '@/lib/client/companion-profile';
import {
  MAX_REFERENCE_DOCUMENTS,
  REFERENCE_DOCUMENT_ACCEPT_SCAN,
  REFERENCE_DOCUMENT_ACCEPT_UPLOAD,
} from '@/lib/documents/types';
import {
  GEMINI_LIVE_LANGUAGES,
  type LanguagePreference,
} from '@/lib/language/language-resolution';
import { cn } from '@/lib/utils';

const chipBaseClassName =
  'h-auto rounded-full border px-3 py-1.5 text-xs whitespace-normal transition';
const chipIdleClassName =
  'border-border bg-muted text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-foreground';
const chipSelectedClassName =
  'border-primary/60 bg-primary/10 text-foreground shadow-sm';

type PresetOption = {
  label: string;
  value: string;
  description?: string;
};

const RESPONSE_DEPTH_OPTIONS: PresetOption[] = [
  { label: 'Quick', value: 'Quick replies with minimal detail' },
  { label: 'Balanced', value: 'Balanced answers with useful context' },
  { label: 'Deep', value: 'Deep explanations with examples and reasoning' },
  { label: 'Ask first', value: 'Ask before giving a long answer' },
];

const TONE_OPTIONS: PresetOption[] = [
  { label: 'Warm', value: 'Warm' },
  { label: 'Calm', value: 'Calm' },
  { label: 'Funny', value: 'Funny' },
  { label: 'Playful', value: 'Playful' },
  { label: 'Direct', value: 'Direct' },
  { label: 'Motivating', value: 'Motivating' },
  { label: 'Gentle', value: 'Gentle' },
  { label: 'High energy', value: 'High energy' },
];

const RELATIONSHIP_MODE_OPTIONS: PresetOption[] = [
  { label: 'Assistant', value: 'Assistant' },
  { label: 'Friend', value: 'Friend' },
  { label: 'Mentor', value: 'Mentor' },
  { label: 'Coach', value: 'Coach' },
  { label: 'Accountability partner', value: 'Accountability partner' },
  { label: 'Teacher', value: 'Teacher' },
  { label: 'Affectionate companion', value: 'Affectionate companion' },
];

const GUIDANCE_STYLE_OPTIONS: PresetOption[] = [
  { label: 'Give steps', value: 'Give steps' },
  { label: 'Ask questions', value: 'Ask questions' },
  { label: 'Challenge me gently', value: 'Challenge me gently' },
  { label: 'Make decisions with me', value: 'Make decisions with me' },
  { label: 'Teach me', value: 'Teach me' },
  { label: 'Brainstorm with me', value: 'Brainstorm with me' },
  { label: 'Encourage me', value: 'Encourage me' },
];

const EXPERTISE_LENS_OPTIONS: PresetOption[] = [
  { label: 'Computer/tech guy', value: 'Computer/tech guy' },
  { label: 'Philosopher', value: 'Philosopher' },
  { label: 'Actor/storyteller', value: 'Actor/storyteller' },
  { label: 'Business strategist', value: 'Business strategist' },
  { label: 'Fashion stylist', value: 'Fashion stylist' },
  { label: 'Fitness coach', value: 'Fitness coach' },
  { label: 'Chef', value: 'Chef' },
  { label: 'Study tutor', value: 'Study tutor' },
  { label: 'Creative writer', value: 'Creative writer' },
];

const OUTPUT_FORMAT_OPTIONS: PresetOption[] = [
  { label: 'Plain conversation', value: 'Plain conversation' },
  { label: 'Bullets', value: 'Bullets' },
  { label: 'Step-by-step', value: 'Step-by-step' },
  { label: 'Examples first', value: 'Examples first' },
  { label: 'Pros and cons', value: 'Pros and cons' },
  { label: 'Visual when useful', value: 'Visual explanation when useful' },
];

interface PersonalizationFormProps {
  active?: boolean;
}

function PresetChip({
  option,
  selected,
  onClick,
}: {
  option: PresetOption;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(chipBaseClassName, selected ? chipSelectedClassName : chipIdleClassName)}
    >
      {option.label}
    </Button>
  );
}

function SinglePresetGroup({
  label,
  description,
  options,
  value,
  onSelect,
}: {
  label: string;
  description?: string;
  options: PresetOption[];
  value?: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <PresetChip
            key={option.value}
            option={option}
            selected={value === option.value}
            onClick={() => onSelect(value === option.value ? '' : option.value)}
          />
        ))}
      </div>
    </div>
  );
}

function MultiPresetGroup({
  label,
  description,
  options,
  values,
  onToggle,
}: {
  label: string;
  description?: string;
  options: PresetOption[];
  values?: string[];
  onToggle: (value: string) => void;
}) {
  const selectedValues = values ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <PresetChip
            key={option.value}
            option={option}
            selected={selectedValues.includes(option.value)}
            onClick={() => onToggle(option.value)}
          />
        ))}
      </div>
    </div>
  );
}

function LanguageSelector({
  value,
  onChange,
}: {
  value?: LanguagePreference;
  onChange: (value?: LanguagePreference) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = GEMINI_LIVE_LANGUAGES.filter((language) => {
    const needle = query.trim().toLocaleLowerCase();
    return !needle ||
      language.label.toLocaleLowerCase().includes(needle) ||
      language.code.toLocaleLowerCase().includes(needle);
  });

  return (
    <div className="relative">
      <button
        id="preferred-language"
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls="preferred-language-list"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm"
      >
        <span>{value ? `${value.label} (${value.code})` : 'Choose a language'}</span>
        <Search className="size-4 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-popover p-2 shadow-xl">
          <div className="flex items-center gap-2 border-b border-border px-2">
            <Search className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search language or code"
              aria-label="Search languages"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <div id="preferred-language-list" role="listbox" className="max-h-56 overflow-y-auto py-1">
            {filtered.map((language) => (
              <button
                key={language.code}
                type="button"
                role="option"
                aria-selected={value?.code === language.code}
                onClick={() => {
                  onChange(language);
                  setQuery('');
                  setOpen(false);
                }}
                className="flex min-h-10 w-full items-center justify-between rounded-lg px-2 text-left text-sm hover:bg-accent"
              >
                <span>{language.label}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {language.code}
                  {value?.code === language.code ? <Check className="size-4 text-primary" /> : null}
                </span>
              </button>
            ))}
          </div>
          {value ? (
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className="mt-1 w-full rounded-lg px-2 py-2 text-left text-xs text-muted-foreground hover:bg-accent"
            >
              Use device/request language
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PersonalizationForm({ active = true }: PersonalizationFormProps) {
  const {
    profile,
    updateField,
    updatePreferredLanguage,
    updateInteractionPreference,
    toggleInteractionPreference,
  } = useCompanionProfile();
  const interactionPreferences = profile.interactionPreferences ?? {};
  const scanInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const {
    documents,
    isAtLimit,
    isLoading,
    error,
    clearError,
    addFromFile,
    remove,
    refresh,
  } = useReferenceDocuments();

  useEffect(() => {
    if (active) {
      void refresh();
    }
  }, [active, refresh]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    clearError();
    let remaining = MAX_REFERENCE_DOCUMENTS - documents.length;

    for (const file of Array.from(files)) {
      if (remaining <= 0) break;

      try {
        await addFromFile(file);
        remaining -= 1;
      } catch {
        break;
      }
    }
  };

  const selectInteractionPreference = (field: InteractionPreferenceTextField, value: string) => {
    updateInteractionPreference(field, value);
  };

  const toggleInteractionPreset = (field: InteractionPreferenceArrayField, value: string) => {
    toggleInteractionPreference(field, value);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-1 pb-2">
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-foreground">Basics</h3>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="preferred-name">
            Preferred name
          </Label>
          <Input
            id="preferred-name"
            value={profile.preferredName ?? ''}
            onChange={(event) => updateField('preferredName', event.target.value)}
            placeholder="Alex"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="occupation" className="text-foreground">
            Work or role
          </Label>
          <Input
            id="occupation"
            value={profile.occupation ?? ''}
            onChange={(event) => updateField('occupation', event.target.value)}
            placeholder="Nurse, student, parent…"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="preferred-language">Preferred language</Label>
          <div>
            <LanguageSelector
              value={profile.preferredLanguage}
              onChange={updatePreferredLanguage}
            />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-muted/40 p-3">
        <h3 className="text-sm font-medium text-foreground">How Chrysty should interact with you</h3>

        <SinglePresetGroup
          label="Response depth"
          options={RESPONSE_DEPTH_OPTIONS}
          value={interactionPreferences.responseDepth}
          onSelect={(value) => selectInteractionPreference('responseDepth', value)}
        />

        <MultiPresetGroup
          label="Tone"
          options={TONE_OPTIONS}
          values={interactionPreferences.tones}
          onToggle={(value) => toggleInteractionPreset('tones', value)}
        />

        <SinglePresetGroup
          label="Relationship mode"
          options={RELATIONSHIP_MODE_OPTIONS}
          value={interactionPreferences.relationshipMode}
          onSelect={(value) => selectInteractionPreference('relationshipMode', value)}
        />

        <MultiPresetGroup
          label="Guidance style"
          options={GUIDANCE_STYLE_OPTIONS}
          values={interactionPreferences.guidanceStyles}
          onToggle={(value) => toggleInteractionPreset('guidanceStyles', value)}
        />

        <MultiPresetGroup
          label="Expertise lens"
          options={EXPERTISE_LENS_OPTIONS}
          values={interactionPreferences.expertiseLenses}
          onToggle={(value) => toggleInteractionPreset('expertiseLenses', value)}
        />

        <SinglePresetGroup
          label="Output format"
          options={OUTPUT_FORMAT_OPTIONS}
          value={interactionPreferences.outputFormat}
          onSelect={(value) => selectInteractionPreference('outputFormat', value)}
        />

        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="custom-tone" className="text-foreground">
              Custom tone
            </Label>
            <Input
              id="custom-tone"
              value={interactionPreferences.customTone ?? ''}
              onChange={(event) => updateInteractionPreference('customTone', event.target.value)}
              placeholder="Talk like a calm storyteller"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="custom-expertise" className="text-foreground">
              Custom role or lens
            </Label>
            <Input
              id="custom-expertise"
              value={interactionPreferences.customExpertise ?? ''}
              onChange={(event) => updateInteractionPreference('customExpertise', event.target.value)}
              placeholder="Explain like a senior engineer"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="custom-instruction" className="text-foreground">
            Custom interaction instruction
          </Label>
          <Textarea
            id="custom-instruction"
            value={interactionPreferences.customInstruction ?? ''}
            onChange={(event) => updateInteractionPreference('customInstruction', event.target.value)}
            placeholder="For important decisions, ask me two clarifying questions first. For casual chat, keep it light."
            className="min-h-24"
          />
        </div>
      </section>

      <details className="group rounded-xl border border-border bg-muted/30 px-3 py-2">
        <summary className="cursor-pointer list-none text-sm font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
          Optional details
        </summary>

        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="food-preferences" className="text-foreground">
              Food & diet
            </Label>
            <Textarea
              id="food-preferences"
              value={profile.foodPreferences ?? ''}
              onChange={(event) => updateField('foodPreferences', event.target.value)}
              placeholder="Vegetarian, loves Italian, no shellfish"
              className="min-h-20"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="health-notes" className="text-foreground">
              Health & allergies
            </Label>
            <Textarea
              id="health-notes"
              value={profile.healthNotes ?? ''}
              onChange={(event) => updateField('healthNotes', event.target.value)}
              placeholder="Nut allergy, diabetic — only if you want me to know"
              className="min-h-20"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interests" className="text-foreground">
              Interests
            </Label>
            <Textarea
              id="interests"
              value={profile.interests ?? ''}
              onChange={(event) => updateField('interests', event.target.value)}
              placeholder="Running, sci-fi, cooking"
              className="min-h-20"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="topics-to-avoid" className="text-foreground">
              Topics to avoid
            </Label>
            <Textarea
              id="topics-to-avoid"
              value={profile.topicsToAvoid ?? ''}
              onChange={(event) => updateField('topicsToAvoid', event.target.value)}
              placeholder="Medical diagnoses, politics"
              className="min-h-20"
            />
          </div>
        </div>
      </details>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Your documents</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Scan or upload up to five reference files (images or PDF). Chrysty uses these when helpful.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isAtLimit || isLoading}
            onClick={() => scanInputRef.current?.click()}
            className={cn(
              'rounded-full border-border bg-card text-foreground hover:bg-accent',
              touchButtonClass,
            )}
          >
            <Camera className="size-4" />
            Scan document
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isAtLimit || isLoading}
            onClick={() => uploadInputRef.current?.click()}
            className={cn(
              'rounded-full border-border bg-card text-foreground hover:bg-accent',
              touchButtonClass,
            )}
          >
            <Upload className="size-4" />
            Upload file
          </Button>
        </div>

        <input
          ref={scanInputRef}
          type="file"
          accept={REFERENCE_DOCUMENT_ACCEPT_SCAN}
          capture="environment"
          className="hidden"
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <input
          ref={uploadInputRef}
          type="file"
          accept={REFERENCE_DOCUMENT_ACCEPT_UPLOAD}
          multiple
          className="hidden"
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = '';
          }}
        />

        {isAtLimit ? (
          <p className="text-sm text-amber-200/90">
            Maximum {MAX_REFERENCE_DOCUMENTS} documents. Remove one to add another.
          </p>
        ) : null}

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading documents…</p>
        ) : documents.length > 0 ? (
          <DocumentStrip documents={documents} onRemove={(id) => void remove(id)} />
        ) : (
          <p className="text-sm text-muted-foreground">No documents yet.</p>
        )}
      </section>

    </div>
  );
}
