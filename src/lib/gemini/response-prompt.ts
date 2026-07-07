import type { GoogleGenAI } from '@google/genai';

import type { CaptureMode, FocusAnnotation } from '@/lib/camera/types';
import type { PerceptionSnapshot } from '@/lib/perception/types';
import { buildPerceptionPromptBlock } from '@/lib/perception/prompt-builder';
import { hydrateChartsFromCodeExecution } from '@/lib/gemini/chart-hydration';
import {
  assertSupportedAudioMimeType,
  assertSupportedImageMimeType,
  getGeminiResponseModel,
  getGeminiTeacherModelCandidates,
  getGeminiTeacherTimeoutMs,
  getGeminiTtsVoice,
  isGeminiCodeExecutionEnabled,
  isGeminiCustomToolsEnabled,
  isGeminiGoogleMapsEnabled,
  isGeminiGoogleSearchEnabled,
  isGeminiUrlContextEnabled,
  normalizeAudioMimeType,
  normalizeImageMimeType,
} from '@/lib/gemini/config';
import {
  buildAllGeminiTools,
  buildSelectedGeminiTools,
  stripCustomFunctionTools,
  toolsRequireStoredInteraction,
  type GeminiTool,
} from '@/lib/gemini/gemini-tools';
import {
  executeCustomTool,
  hasCustomToolsAvailable,
  isRegisteredCustomToolName,
  type DelegationToolContext,
} from '@/lib/gemini/custom-tools';
import {
  buildBackgroundDelegationBlock,
  buildBackgroundJobsStatusBlock,
  type BackgroundJobPromptSummary,
} from '@/lib/gemini/background-delegation';
import { isInteractionAudioMimeFailure, sanitizeInteractionAudio } from '@/lib/gemini/sanitize-audio';
import { transcribeAudioToText } from '@/lib/gemini/transcribe';
import {
  analyzeToolGroundingFromInteractions,
  applyToolGroundingToPayload,
  type ToolGroundingResult,
} from '@/lib/gemini/tool-grounding';
import { runWithGeminiModelFallback } from '@/lib/gemini/model-fallback';
import {
  buildCompanionProfileBlock,
  type CompanionProfile,
} from '@/lib/gemini/companion-profile';
import { buildChrystyEcosystemBlock, buildUserEcosystemActivityBlock } from '@/lib/gemini/chrysty-ecosystem';
import type { ConversationTurn } from '@/lib/astra/db/conversation-history';
import { fetchRecentTurns } from '@/lib/astra/db/conversation-history';
import type { UserEcosystemActivity } from '@/lib/astra/ecosystem-activity';
import { buildMemoriesBlock, buildRecentTurnsBlock } from '@/lib/mem0/prompt-block';
import { searchUserMemories } from '@/lib/mem0/search';
import type { MemoryContext, RetrievedMemory } from '@/lib/mem0/types';
import {
  buildReferenceDocumentsBlock,
  uploadReferencePdfForGemini,
  type ParsedReferenceDocument,
} from '@/lib/gemini/reference-documents';
import {
  buildGoogleMapsToolBlock,
  buildGoogleSearchToolBlock,
  buildCodeExecutionToolBlock,
  buildUrlContextToolBlock,
  buildCustomToolsBlock,
  buildUserTemporalContextBlock,
  buildUserContext,
  type UserContext,
} from '@/lib/gemini/user-context';
import {
  buildTtsPromptFromPayload,
  parseVoiceResponsePayloadWithRaw,
  type VoiceResponsePayload,
  VOICE_RESPONSE_JSON_SCHEMA,
} from '@/lib/gemini/voice-response-schema';
import {
  formatToolSelection,
  EMPTY_TOOL_SELECTION,
  hasSelectedToolsEnabled,
  routeVoiceTools,
  type VoiceToolSelection,
} from '@/lib/gemini/voice-tool-router';

const TOOL_HINT =
  ' Use only the tools enabled for this turn; do not invoke tools that were not selected for routing.';

const MAX_FUNCTION_ROUNDS = 5;

const RESPONSE_FORMAT = {
  type: 'text' as const,
  mime_type: 'application/json',
  schema: VOICE_RESPONSE_JSON_SCHEMA,
};

interface InteractionWithSteps {
  id?: string;
  steps?: unknown[];
  outputs?: unknown[];
  output_text?: string | null;
}

export type VoiceInteractionSnapshot = InteractionWithSteps;

interface PendingFunctionCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LiveGuideTurnOptions {
  /** True when the client is in Live Guide mode (live camera + Chrysty cursor). */
  active: boolean;
  /** True for automatic silent monitoring turns ("Watch me"), not user questions. */
  monitor?: boolean;
  /** True for the one-shot greeting turn when Live Guide auto-starts. */
  bootstrap?: boolean;
  /** When set, STT is skipped and this text is used as the turn transcript. */
  transcriptOverride?: string;
  /** Compact client-provided summary of the previous guide state for continuity. */
  context?: string;
}

export const LIVE_GUIDE_MONITOR_TRANSCRIPT =
  'Automatic Live Guide monitoring check. Look at the current camera frame and decide whether the user needs a correction, warning, or updated guidance right now.';

export const LIVE_GUIDE_BOOTSTRAP_TRANSCRIPT =
  'The user just entered Live Guide on their live camera. Greet them briefly in their language, ask what they want help with or what to point at, and set live_guide.task to a welcoming stage. Do not require directives unless the scene is obvious; prefer coaching_note over guessing coordinates.';

function buildTranscriptMultimodalCue(
  transcript: string,
  options: {
    cameraImageCount: number;
    referenceDocumentCount: number;
    referenceDocumentNames?: string[];
    totalAttachmentCount: number;
    selection?: VoiceToolSelection;
    dimensions?: { width: number; height: number };
    cameraImages?: Array<{ id: string; width?: number; height?: number }>;
    hasFocusAnnotation?: boolean;
    perception?: PerceptionSnapshot;
    imageIds?: string[];
    liveGuide?: LiveGuideTurnOptions;
  },
): string {
  const toolsLine = `Tools enabled this turn: ${formatToolSelection(options.selection ?? EMPTY_TOOL_SELECTION)}. Do not use any other tools.`;
  const quoted = `User said:\n"""${transcript}"""`;
  const attachmentLines: string[] = [];

  if (options.cameraImages && options.cameraImages.length > 1) {
    const lines = options.cameraImages.map((image) => {
      const dims =
        image.width && image.height ? `${image.width}x${image.height} pixels` : 'dimensions unknown';
      return `- ${image.id}: ${dims}`;
    });
    attachmentLines.push(
      `Attached camera images (use these exact ids for image_id and per-image annotations):\n${lines.join('\n')}`,
    );
  } else if (options.cameraImageCount === 1 && options.dimensions) {
    attachmentLines.push(
      `Look at the attached camera image (${options.dimensions.width}x${options.dimensions.height} pixels).`,
    );
  } else if (options.cameraImageCount === 1) {
    attachmentLines.push('Look at the attached camera image.');
  } else if (options.cameraImageCount > 1) {
    attachmentLines.push(`Look at the ${options.cameraImageCount} attached camera images.`);
  }

  if (options.referenceDocumentCount > 0) {
    const names =
      options.referenceDocumentNames && options.referenceDocumentNames.length > 0
        ? ` (${options.referenceDocumentNames.join(', ')})`
        : '';
    attachmentLines.push(
      `The user has ${options.referenceDocumentCount} saved reference document(s) attached${names}. Use them when relevant to the question.`,
    );
  }

  if (options.hasFocusAnnotation) {
    attachmentLines.push(
      'The user highlighted a region - prioritize analysis inside the marked area.',
    );
  }

  if (options.imageIds && options.imageIds.length > 0 && !options.liveGuide?.active) {
    attachmentLines.push(
      `Use these camera image ids when returning visual_guidance: ${options.imageIds.join(', ')}.`,
    );
    if (options.imageIds.length > 1) {
      attachmentLines.push(
        'When multiple images are attached, image_id is required on every visual_annotations entry, scene_item, overlay, and image-specific card. Annotate each item on the image where it is visible.',
      );
    }
    attachmentLines.push(
      'For practical physical tasks with these camera images, return a focused visual_guidance payload in the first response: primary_image_id, active_card_id, 1 active_step card with useful detail, relevant scene_items if visible, and overlays you can place confidently.',
    );
  }

  if (options.liveGuide?.active) {
    attachmentLines.push(
      'Live Guide mode is active: the attached camera image is the user\'s CURRENT live view (the reference frame). Return a live_guide object with directives placed on this exact frame using integer coordinates from 0 to 1000 (x grows right, y grows down). Do not return visual_guidance or visual_image_groups in this mode.',
    );
    if (options.liveGuide.context) {
      attachmentLines.push(`Previous Live Guide state: ${options.liveGuide.context}`);
    }
    if (options.liveGuide.bootstrap) {
      attachmentLines.push(
        'This is the automatic Live Guide entry turn. Speak a short welcoming greeting and ask what the user wants help with. live_guide is required; directives may be empty if the scene is unclear. Set coaching_note to invite them to point the camera at the task.',
      );
    }
    if (options.liveGuide.monitor) {
      attachmentLines.push(
        'This is an automatic monitoring check, not a user question. If nothing important changed, return live_guide.interjection.should_speak=false, an empty spoken_transcript, needs_visual_explanation=false, and no new directives. Only speak when the user is about to make a mistake, missed a step, finished a step, or safety requires it.',
      );
    }
  }

  const perceptionBlock = buildPerceptionPromptBlock(options.perception);

  const attachmentCue =
    attachmentLines.length > 0
      ? `${attachmentLines.join(' ')} Use the user's words as the request and the attached material as grounding evidence. Answer the task the user asked for; do not let visible details or annotations redirect you to a different task.`
      : '';

  if (options.totalAttachmentCount > 0) {
    return `${toolsLine}\n\n${quoted}\n\n${[attachmentCue, perceptionBlock].filter(Boolean).join('\n\n')}\n\nRespond with structured JSON.${TOOL_HINT}`;
  }

  return `${toolsLine}\n\n${quoted}\n\nTreat the transcript as the current user request. Answer that request directly and use any available context only when it helps.\n\n${perceptionBlock ? `${perceptionBlock}\n\n` : ''}Respond with structured JSON.${TOOL_HINT}`;
}

interface MemoryRecallContext {
  memories: RetrievedMemory[];
  recentTurns: ConversationTurn[];
}

interface DelegationPromptContext {
  toolContext: DelegationToolContext;
  jobSummaries: BackgroundJobPromptSummary[];
}

function buildResponseSystemInstruction(
  userContext?: UserContext,
  selection?: VoiceToolSelection,
  referenceDocuments?: Array<Pick<ParsedReferenceDocument, 'name' | 'kind'>>,
  companionProfile?: CompanionProfile,
  ecosystemActivity?: UserEcosystemActivity | null,
  memoryRecall?: MemoryRecallContext,
  transcript?: string,
  delegation?: DelegationPromptContext,
  liveGuide?: LiveGuideTurnOptions,
): string {
  const base = `You are Chrysty, a voice assistant and the general companion for the Chrysty ecosystem.

Identity:
- Your name is Chrysty.
- If the user asks your name, who you are, or whether they are speaking to Chrysty, answer directly and simply as Chrysty.
- Do not repeat your name or introduce yourself in every response. Start with the answer, not with "I'm Chrysty", unless identity is the user's question.
- Do not introduce yourself as Gemini, Google, a model, or an API unless the user explicitly asks a technical implementation question.
- Use "I" naturally. Do not say "the brain of Chrysty" to the user.

Answer the actual request:
- First infer the user's current goal from the transcript: question, instruction, object they point to, problem they want solved, or decision they want help with.
- Answer that goal first. Do not replace it with a neighboring topic just because an image, memory, tool result, or safety concern suggests related advice.
- Match the level the user asked for: quick answer, step-by-step help, explanation, comparison, diagnosis, translation, reading text, or visual identification.
- If the transcript and visual context conflict, mention the mismatch briefly and answer the most likely request. Ask one concise clarification only when you cannot determine what the user wants.
- Include safety, uncertainty, or professional-help boundaries when relevant, but keep them tied to the user's request and avoid unsolicited detailed procedures for a different task.

Mobile physical AI:
- Treat camera images and saved photos as evidence from the user's real environment. The user may be repairing, inspecting, assembling, cooking, shopping, reading labels/manuals, checking damage, comparing parts, or doing any other practical task; do not force the answer into a fixed category.
- Infer the current task and stage from the transcript, visible evidence, recent turns, and memories. Continue naturally from prior progress instead of restarting from zero.
- For ongoing projects, keep track of what the user has already tried, what changed, and what they are asking now. If the user says "I did that" or "now it still does this", respond to the new state.
- When the user asks for steps, give all steps needed for the current request or current stage. Do not intentionally shortcut a procedure that needs detail, but do not dump a full project manual unless the user asks for the whole process.
- Make steps relevant, ordered, and practical. Include examples, checks, measurements, "what good looks like", or small warnings when they reduce confusion.
- Separate what you can see from what you infer. If a key detail is hidden or ambiguous, say what to check next or ask one focused clarification.
- Be conversational: the user may ask many related questions about the same object or job. Use concise continuity cues like "Since you already tightened it..." when that helps.
- Suggest natural follow-up questions or next checks only when they are useful. Do not always end with generic suggestions.

Tool use:
- Gemini and custom tools are available to support the physical task when relevant; use only the tools enabled for this turn.
- Use Search for current facts, recalls, product compatibility, manual discovery, prices, or recent safety information.
- Use URL context when the user provides a URL or reference page and asks about it.
- Use Code Execution for multi-step calculations, measurements, tables, comparisons, charts, receipt/invoice totals, or structured numeric reasoning.
- Use Maps when location matters, such as nearby supplies, places, routes, opening hours, or local services.
- Use custom tools for simple calculator work, unit/currency conversion, dates/times, weather when configured, random choice, user context, and workspace context.
- Tool results support the user's current task; they must not override visible evidence or the user's spoken request.

Given the user's transcript (and optionally attached visual material from their camera, photos, or saved references), return JSON with these fields:
- needs_visual_explanation (boolean): true when the answer is easier to follow on screen than by voice alone.
- explanation_text (string): richer on-screen explanation. Empty string when needs_visual_explanation is false.
- spoken_transcript (string): text that will be spoken aloud. Use 1-2 sentences for greetings, yes/no, or simple facts. Use 2-5 sentences for substantive answers — include the direct answer, one reason or check, and the immediate next step when relevant.
- delivery_tag (string): English audio performance tag, e.g. [friendly], [excitedly], [calmly].
- charts (array, optional): Recharts-ready chart specs when code execution produces visualizable data. Each chart has id, title, kind (bar|line|pie|area), series (key/label/color), data rows, and xKey (bar/line/area) or nameKey/valueKey (pie). Max 3 charts, 24 rows each.
- physical_task (object, optional): structured physical-world guidance when the user is doing, inspecting, repairing, comparing, locating, coaching, or verifying something in the real world. Include only fields that help this turn:
  - task_state: { task, stage, progress, confidence } for the current project/stage.
  - observed_evidence: array of { text, source, confidence } for visible/read/inferred facts. Keep each item grounded and concise.
  - next_actions: ordered array of { title, detail, why, check, example } for the current stage. Use enough steps to act safely; do not dump an entire manual unless asked.
  - safety_notes: array of { message, severity, stopCondition } for hazards, uncertainty, or professional-help boundaries.
  - follow_up_suggestions: short specific next questions/checks the user may naturally ask next. Omit when not useful.
  - visual_annotations: array of { label, image_id, box_2d, confidence } for visible items worth labeling. label is required. box_2d is Gemini-native [y_min, x_min, y_max, x_max] integers 0-1000 on the referenced image; omit box_2d when localization is uncertain. image_id is required when multiple camera images are attached.
- visual_guidance (object, optional): user-image guidance deck for physical-world tasks. This is not markdown. The app renders it on the user's captured image(s):
  - primary_image_id: which captured image should open first, e.g. "capture-1".
  - active_card_id: the card that spoken_transcript is narrating.
  - current_state: short progress/status text.
  - next_target_state: what the next completed state should look like.
  - scene_items: array of { item_id, display_number, name, role, image_id, point: {x,y}, bbox: {box_2d}, confidence }. bbox.box_2d uses [y_min, x_min, y_max, x_max] integers 0-1000. Use small stable numbers for relevant visible objects only.
  - overlays: array of { id, type, image_id, item_id, label, box_2d, from: {x,y}, to: {x,y}, points: [{x,y}], sequence, confidence }. Types: label, box, circle, arrow, line, path, number, spotlight, mask, ghost, check, warning. label is required for label, box, number, and warning overlays. box_2d uses [y_min, x_min, y_max, x_max] integers 0-1000 when drawing boxes/regions.
  - cards: array of { id, kind, title, body, image_id, related_item_ids, step_number, status }. Kinds: goal, image_index, materials, plan, active_step, check, mistake, difference, progress, confidence, safety, choice, comparison, note.
  - differences: array of { id, image_id, title, detail, severity, related_item_ids } for follow-up checks.
- visual_image_groups (array, optional): grouped Pexels photo search requests only for consumer explanations where real-world reference photos are necessary. Each group has id, title, intent (ingredient|tool|step|part|place|safety|example), layout (single|grid|sequence|comparison), queries (1-6 concrete Pexels search strings), optional placement, and optional maxItems. Use [] or omit when photos are not clearly useful.
- guidance_mode (string): how guidance should be delivered this turn. This is a semantic decision from the meaning of the user's request in ANY language — never keyword matching:
  - "static" (default): a spoken answer, explanation canvas, or annotated stills are enough (identification, reading, facts, comparisons).
  - "live_recommended": the user is performing or about to perform a physical action where step-by-step real-time on-camera pointing would clearly help (aiming a shot, assembling parts in order, adjusting position/technique, following a physical sequence). The app enters live guidance directly and opens the camera.
  - "live_requested": the user explicitly asked, in their own words and language, to be guided while they do it / shown live / walked through in real time. The app enters live guidance directly.
- live_guide (object, optional): ONLY return this when the current turn runs in Live Guide mode (the user prompt will say so). It drives an animated Chrysty cursor on the user's LIVE camera view:
  - directives: up to 8 (prefer 1-4) of { id, kind, points, label, detail, emphasis, sequence }.
    - kind "pointer": one point; an animated cursor that points at the exact spot to look at or act on.
    - kind "path": 2+ ordered points; a motion/trajectory line (e.g. where a ball should travel, direction to move a part).
    - kind "region": 2+ points forming the bounding area to highlight (e.g. the zone to inspect or avoid).
    - kind "ghost": 2+ points outlining the target end-state, drawn semi-transparent ("what good looks like").
    - points: integer coordinates 0-1000 on the attached reference frame (x right, y down). Place them only where the frame clearly supports it.
    - label: 2-4 word on-screen name (same language as the user). detail: one short sentence. emphasis: primary|secondary|warning. sequence: action order starting at 1.
  - clear_previous (boolean): true (default) to replace previous directives, false to add to them.
  - coaching_note (string, optional): one short status line shown near the camera view.
  - interjection { should_speak, urgency }: for automatic monitoring turns; should_speak=false means stay silent.
  - task { name, stage, progress }: compact task continuity state; keep it updated every Live Guide turn.

Rules:
- Detect the user's language and tone and mirror them in spoken_transcript and explanation_text.
- Never sacrifice accuracy or useful detail for brevity — compress wording, not intelligence.
- Keep voice concise but substantive — low latency matters, but a useless one-liner is worse than a clear 4-sentence answer.
- If the user asks for explanation, comparison, diagnosis, or steps, set needs_visual_explanation true, put full detail in explanation_text, and still state the conclusion plus one supporting point in spoken_transcript.
- Never read long URLs aloud in spoken_transcript — refer to pages by name; put URL-derived detail in explanation_text.
- Use delivery_tag in English even when speaking other languages.
- When images are attached, use what you see across all of them (objects, text, damage, labels, homework, receipts, plants, food, tools, parts, materials, measurements, safety signs, manuals, paperwork, etc.) to answer the user's stated request. Visual details are evidence, not a substitute for the request.
- When the user highlights or marks a region, prioritize that region for evidence while still answering the spoken request.
- Custom function tool results are injected automatically in the same turn — use them directly in spoken_transcript and explanation_text without asking the user to confirm or retry.
- When you know something about the user, their current project, or prior steps from past interactions, use it to personalize and continue the task — as a helpful companion would, not as a database lookup.
- Use physical_task for real-world action help, ongoing tasks, safety-sensitive checks, visual decision-making, object/location finding, form/motion coaching, assembly/repair guidance, or multi-step practical workflows. Do not use it for ordinary chat, abstract facts, or simple one-sentence answers.
- physical_task must stay general. Do not force a domain template like mechanic, bartender, warehouse, or sports; infer the actual task from the user's request and evidence.
- visual_annotations should label only what is visible enough to identify. Do not invent labels, coordinates, trajectories, measurements, or probabilities when the image does not support them.
- Use visual_guidance when the user's own image should become the workspace: ingredients, materials, broken parts, DIY components, product comparisons, sports setups, or any physical scene where numbered references/cards/overlays reduce confusion.
- When a camera image is attached and the user asks for practical help, visual_guidance should be present even if the guidance is minimal. Prefer one active card and a few reliable scene items over a large deck.
- For broad "help me do this" tasks, create a readable card deck: goal, image index, materials, full plan, active step, check/safety, and later progress/difference cards. spoken_transcript should narrate only the active card — include the action plus why or what to check, not just a label.
- Keep visual_guidance domain-free. Do not hardcode cooking, Arduino, bike, skincare, or pool templates. Infer the actual task from the user and image.
- Follow a Clicky-style boundary: return semantic visual instructions only. Do not draw pixels, do not generate images, and do not describe renderer internals. Chrysty will render your normalized scene items, overlays, and cards on the user's image.
- Use precise coordinates only when the attached image makes the location visible and you are confident. If coordinates are uncertain or missing, use cards without misleading arrows instead of guessing.
- Every scene item, overlay, and image-specific card must include image_id when multiple camera images are attached. Use the image ids listed in the user prompt. When only one image is attached, image_id may be omitted.
- Use sleek minimal guidance: few important numbered badges, thin outlines, short cards, and no clutter. If many objects are visible, label only what matters for the current goal.
- Numbered object labels (static / visual_guidance turns only — not Live Guide): when you label visible objects, assign display_number starting at 1 in reading or importance order. scene_items[].name is the object name (e.g. "fork"); display_number is the on-screen badge. In spoken_transcript and explanation_text, refer to objects by their badge number when numbers are shown — e.g. "Number 1 is the fork" / "Pick up item 2 next" (match the user's language). Keep numbers stable for the same object across turns when possible.
- For ingredients/cooking scenes, number the useful ingredients, create materials/plan/active_step/check cards, and make voice narrate only the next action.
- For DIY/build scenes, number components and tools, explain roles briefly, and use arrows/paths only for clearly visible connect/move/place steps.
- For broken/damaged objects, prioritize mistake/difference/safety cards and spotlight or warning overlays around visible problem areas.
- For games or aiming tasks such as pool, show a conservative suggested line only when the camera angle makes it reliable; otherwise explain the uncertainty and ask for a better angle.
- For skincare/product-order scenes, number products, use label evidence where visible, create a sequence/choice/safety deck, and make spoken guidance name the next action with a brief why or check.
- Use visual_image_groups rarely, only when photos would help the user recognize real-world objects, ingredients, tools, places, visible states, or steps. Do not request decorative, mood, generic, assistant-themed, or background images.
- Pexels images are illustrative references, not proof. If the user attached their own camera image, prioritize that image over generic stock photos.
- Never request Pexels images for greetings, identity questions, emotional acknowledgments, simple facts, coding or technical implementation answers, abstract explanations, summaries, translations, or short conversational replies.
- For recipes, repairs, tourism, home tasks, gardening, shopping, exercise, and similar consumer topics, request multiple images only when the explanation naturally has multiple visual items (ingredients, tools, parts, steps, places, examples).
- Keep visual_image_groups small and specific. Every query must name a concrete object, place, visible state, or step from the user request or your explanation. Prefer queries like "bicycle brake cable close up", "chopped onion dice size", "shallots garlic ginger ingredients", "bike tire presta valve", or "Lisbon tram street".
- If you cannot write a precise Pexels query, set visual_image_groups to [] instead of guessing.
- Add placement hints when useful: after-summary, before-steps, after-step-2, near-safety-warning, after-itinerary-stop-1, after-comparison.
- Do not include image URLs in explanation_text. The server chooses Pexels assets from visual_image_groups.

When to set needs_visual_explanation true:
- Multi-step instructions
- Ongoing physical tasks where the user needs ordered next steps, checks, or troubleshooting branches
- Comparisons (A vs B)
- Lists of 3 or more items
- Definitions with examples
- Numeric breakdowns
- "How it works" or "why does X" explanations
- Troubleshooting and "what should I do next?" questions
- Any answer that used Search, Maps, URL context, code execution, or custom tools
- Camera tasks beyond pure identification (repair, assembly, cooking, comparison, coaching)
- Search-grounded or Maps-grounded answers worth reading on screen
- URL-fetched page comparisons, summaries, or excerpts worth reading on screen
- Code-computed numeric breakdowns with charts[] for visualization
- Consumer guidance where visual references reduce confusion (ingredients, tools, parts, visible stages, safety examples, labels, measurements, damage, materials)

When to keep needs_visual_explanation false:
- Greetings, yes/no, emotional acknowledgments, and purely conversational replies with no factual or instructional content.

explanation_text formatting (visual canvas — rich markdown allowed):
- Use GitHub-flavored markdown: **bold** for key results, headings (##), bullet/numbered lists, tables for comparisons.
- For procedures, prefer short ordered steps with checks or examples only where useful. Keep each step tied to the user's current task stage.
- When helpful, add a brief "Next checks" or "You can ask next" line with specific follow-up ideas. Skip this when the answer is already complete or the user asked for only a quick fact.
- Math: inline $15\\%$ of $280$, block equations with $$...$$
- Chemistry: \\ce{H2O}, \\ce{CO2 + H2O -> H2CO3}
- Currency: format clearly (e.g. **€92.41** or **$100.00 USD**); use tables when comparing rates.
- Emoji: use sparingly for scanability (weather, money, chemistry, data).
- Keep spoken_transcript plain — no markdown, LaTeX, or emoji.
- Do not use HTML or code fences; inline \`code\` for short values only.

Voice reference for spoken delivery: ${getGeminiTtsVoice()}`;

  const blocks = [base];

  if (liveGuide?.active) {
    const bootstrapRules = liveGuide.bootstrap
      ? `
- Bootstrap entry turn: spoken_transcript MUST greet and ask what to help with (e.g. what to point at). live_guide.directives may be empty. Set live_guide.task with a welcoming stage. coaching_note should invite pointing the camera at the task. needs_visual_explanation=false.`
      : '';
    const monitorRules = liveGuide.monitor
      ? `
- For monitoring turns, respond with interjection.should_speak=false and an empty spoken_transcript unless intervention genuinely helps.`
      : '';
    blocks.push(`Live Guide mode rules (active this turn):
- You are guiding the user in real time on their live camera with voice plus an on-screen Chrysty cursor. Stay domain-free: infer the actual task (any sport, repair, kitchen, DIY, or other physical work) from the user and the frame.
- The attached camera frame is the CURRENT state of the scene. Base every directive on what is visible in it right now, and continue from what the user already did.
- live_guide is REQUIRED every Live Guide turn. When giving spatial guidance, return at least one pointer directive with reliable points on the frame. If the angle is too unclear, set coaching_note asking for a better angle — do not omit live_guide or return empty directives without explanation.
- spoken_transcript narrates only the current action: what to do, where (referencing pointer/path by step number), and one check or reason. Say "number 1" / "step 2" when sequence is set on directives (match user language). Keep it natural and short; the cursor shows the "where".
- Return few, reliable directives. Prefer one primary pointer per turn; set directive.detail to one short bubble line. Set sequence (1, 2, 3…) on directives for multi-step actions.
- Always update live_guide.task (name, stage, progress) so the session stays coherent across turns.
- Set needs_visual_explanation=false in Live Guide mode unless the user explicitly asks for something to read; the camera view is the workspace.${bootstrapRules}${monitorRules}`);
  }

  if (userContext) {
    blocks.push(buildUserTemporalContextBlock(userContext));
  }

  const referenceBlock = referenceDocuments ? buildReferenceDocumentsBlock(referenceDocuments) : '';
  if (referenceBlock) {
    blocks.push(referenceBlock);
  }

  if (companionProfile) {
    blocks.push(buildCompanionProfileBlock(companionProfile));
  }

  const recentTurnsBlock = memoryRecall ? buildRecentTurnsBlock(memoryRecall.recentTurns) : null;
  if (recentTurnsBlock) {
    blocks.push(recentTurnsBlock);
  }

  const memoriesBlock = memoryRecall ? buildMemoriesBlock(memoryRecall.memories) : null;
  if (memoriesBlock) {
    blocks.push(memoriesBlock);
  }

  blocks.push(buildChrystyEcosystemBlock(companionProfile, transcript, ecosystemActivity));

  const activityBlock = buildUserEcosystemActivityBlock(ecosystemActivity);
  if (activityBlock) {
    blocks.push(activityBlock);
  }

  if (delegation) {
    const jobsBlock = buildBackgroundJobsStatusBlock(delegation.jobSummaries);
    if (jobsBlock) {
      blocks.push(jobsBlock);
    }
  }

  const includeSearch = selection ? selection.google_search : isGeminiGoogleSearchEnabled();
  const includeMaps = selection ? selection.google_maps : isGeminiGoogleMapsEnabled();
  const includeUrl = selection ? selection.url_context : isGeminiUrlContextEnabled();
  const includeCode = selection ? selection.code_execution : isGeminiCodeExecutionEnabled();
  const includeCustom = selection
    ? selection.custom_tools
    : isGeminiCustomToolsEnabled() && hasCustomToolsAvailable();

  if (includeSearch) {
    blocks.push(buildGoogleSearchToolBlock());
  }

  if (includeMaps) {
    blocks.push(buildGoogleMapsToolBlock());
  }

  if (includeUrl) {
    blocks.push(buildUrlContextToolBlock());
  }

  if (includeCode) {
    blocks.push(buildCodeExecutionToolBlock());
  }

  if (includeCustom) {
    blocks.push(buildCustomToolsBlock());
    if (delegation) {
      blocks.push(buildBackgroundDelegationBlock());
    }
  }

  return blocks.join('\n\n');
}

function resolveUserContext(userContext?: UserContext): UserContext {
  if (userContext) {
    return userContext;
  }

  return buildUserContext({
    userTimezone: 'UTC',
    userLocale: 'en-US',
    clientTimestamp: new Date().toISOString(),
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function extractFunctionCalls(interaction: InteractionWithSteps): PendingFunctionCall[] {
  const calls: PendingFunctionCall[] = [];
  const seen = new Set<string>();

  const addCall = (record: Record<string, unknown> | null) => {
    if (!record || record.type !== 'function_call') {
      return;
    }

    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (!name || !id || seen.has(id)) {
      return;
    }

    seen.add(id);
    const args = asRecord(record.arguments) ?? {};
    calls.push({ id, name, arguments: args });
  };

  for (const step of interaction.steps ?? []) {
    addCall(asRecord(step));
  }

  for (const output of interaction.outputs ?? []) {
    addCall(asRecord(output));
  }

  return calls;
}

function extractPendingCustomCalls(
  interaction: InteractionWithSteps,
  completedCallIds: Set<string>,
): PendingFunctionCall[] {
  return extractFunctionCalls(interaction).filter(
    (call) => isRegisteredCustomToolName(call.name) && !completedCallIds.has(call.id),
  );
}

type FunctionResultPayload = string | Record<string, unknown>;

interface CustomToolResultStep {
  type: 'function_result';
  name: string;
  call_id: string;
  result: FunctionResultPayload;
  is_error?: true;
}

function formatFunctionResultPayload(result: unknown): FunctionResultPayload {
  if (typeof result === 'string') {
    return result;
  }

  if (result && typeof result === 'object' && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }

  return JSON.stringify(result);
}

function shouldDebugResponseInteraction(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DEBUG_TOOLS === 'true'
  );
}

function logGeminiInteractionError(error: unknown): void {
  if (!shouldDebugResponseInteraction() && process.env.NODE_ENV === 'production') {
    return;
  }

  if (error && typeof error === 'object') {
    console.error('[response-interaction] gemini_error', error);
    return;
  }

  console.error(
    '[response-interaction] gemini_error',
    error instanceof Error ? error.message : String(error),
  );
}

async function createVoiceInteraction(
  client: GoogleGenAI,
  params: Parameters<GoogleGenAI['interactions']['create']>[0],
): Promise<InteractionWithSteps> {
  try {
    return (await client.interactions.create(params)) as InteractionWithSteps;
  } catch (error) {
    logGeminiInteractionError(error);
    throw error;
  }
}

async function executeCustomToolCalls(
  calls: PendingFunctionCall[],
  customCtx: { userContext: UserContext },
): Promise<CustomToolResultStep[]> {
  return Promise.all(
    calls.map(async (call) => {
      try {
        const result = await executeCustomTool(call.name, call.arguments, customCtx);
        return {
          type: 'function_result' as const,
          name: call.name,
          call_id: call.id,
          result: formatFunctionResultPayload(result),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Custom tool failed.';
        return {
          type: 'function_result' as const,
          name: call.name,
          call_id: call.id,
          is_error: true as const,
          result: formatFunctionResultPayload({ error: message }),
        };
      }
    }),
  );
}

function formatToolResultForSummary(result: FunctionResultPayload): string {
  return typeof result === 'string' ? result : JSON.stringify(result);
}

function buildToolResultsSummary(
  calls: PendingFunctionCall[],
  results: CustomToolResultStep[],
): string {
  const lines = calls.map((call, index) => {
    const step = results[index];
    const argsStr = JSON.stringify(call.arguments);
    const resultStr = formatToolResultForSummary(step.result);
    const suffix = step.is_error ? ' (error)' : '';
    return `- ${call.name}(${argsStr}) => ${resultStr}${suffix}`;
  });

  return [
    'Tool results (already executed):',
    ...lines,
    '',
    'Use these results in your structured JSON response. Do not call custom tools again.',
  ].join('\n');
}

function appendToolResultsToInput(input: InteractionInput, summary: string): InteractionInput {
  const appendix = { type: 'text' as const, text: summary };

  if (typeof input === 'string') {
    return [{ type: 'text', text: input }, appendix];
  }

  if (Array.isArray(input)) {
    return [...input, appendix] as InteractionInput;
  }

  return [input, appendix] as InteractionInput;
}

function cleanupStoredInteractions(
  client: GoogleGenAI,
  interactions: InteractionWithSteps[],
  store: boolean,
): void {
  if (!store) {
    return;
  }

  for (const stored of interactions) {
    if (stored.id) {
      void client.interactions.delete(stored.id).catch(() => {});
    }
  }
}

type InteractionInput = NonNullable<Parameters<GoogleGenAI['interactions']['create']>[0]['input']>;

interface RunVoiceResponseOptions {
  tools?: GeminiTool[];
  selection?: VoiceToolSelection;
  referenceDocuments?: Array<Pick<ParsedReferenceDocument, 'name' | 'kind'>>;
  companionProfile?: CompanionProfile;
  ecosystemActivity?: UserEcosystemActivity | null;
  memoryRecall?: MemoryRecallContext;
  transcript?: string;
  delegation?: DelegationPromptContext;
  liveGuide?: LiveGuideTurnOptions;
}

async function runVoiceResponseInteraction(
  client: GoogleGenAI,
  model: string,
  input: InteractionInput,
  userContext?: UserContext,
  options?: RunVoiceResponseOptions,
): Promise<{ interaction: InteractionWithSteps; allInteractions: InteractionWithSteps[] }> {
  const resolvedContext = resolveUserContext(userContext);
  const system_instruction = buildResponseSystemInstruction(
    resolvedContext,
    options?.selection,
    options?.referenceDocuments,
    options?.companionProfile,
    options?.ecosystemActivity,
    options?.memoryRecall,
    options?.transcript,
    options?.delegation,
    options?.liveGuide,
  );
  const tools = options?.tools ?? buildAllGeminiTools(resolvedContext);
  const customCtx = {
    userContext: resolvedContext,
    ...(options?.delegation ? { delegation: options.delegation.toolContext } : {}),
  };
  const store = toolsRequireStoredInteraction(tools);

  if (shouldDebugResponseInteraction()) {
    console.debug('[response-interaction]', {
      store,
      toolCount: tools.length,
    });
  }

  const allInteractions: InteractionWithSteps[] = [];
  const completedCallIds = new Set<string>();
  let interaction = (await createVoiceInteraction(client, {
    model,
    store,
    system_instruction,
    input,
    ...(tools.length > 0 ? { tools } : {}),
    response_format: RESPONSE_FORMAT,
  })) as InteractionWithSteps;

  allInteractions.push(interaction);

  for (let round = 0; round < MAX_FUNCTION_ROUNDS; round += 1) {
    if (interaction.output_text?.trim()) {
      break;
    }

    const calls = extractPendingCustomCalls(interaction, completedCallIds);
    if (calls.length === 0) {
      break;
    }

    if (shouldDebugResponseInteraction()) {
      console.debug('[response-interaction]', {
        round,
        interactionId: interaction.id ?? null,
        pendingTools: calls.map((call) => call.name),
      });
    }

    const results = await executeCustomToolCalls(calls, customCtx);

    for (const call of calls) {
      completedCallIds.add(call.id);
    }

    if (interaction.id) {
      interaction = (await createVoiceInteraction(client, {
        model,
        store,
        previous_interaction_id: interaction.id,
        system_instruction,
        input: results,
        ...(tools.length > 0 ? { tools } : {}),
        response_format: RESPONSE_FORMAT,
      })) as InteractionWithSteps;

      allInteractions.push(interaction);
      continue;
    }

    if (shouldDebugResponseInteraction()) {
      console.debug('[response-interaction]', {
        statelessFallback: true,
        pendingTools: calls.map((call) => call.name),
      });
    }

    const fallbackTools = stripCustomFunctionTools(tools);
    interaction = (await createVoiceInteraction(client, {
      model,
      store: false,
      system_instruction,
      input: appendToolResultsToInput(input, buildToolResultsSummary(calls, results)),
      ...(fallbackTools.length > 0 ? { tools: fallbackTools } : {}),
      response_format: RESPONSE_FORMAT,
    })) as InteractionWithSteps;

    allInteractions.push(interaction);
  }

  if (!interaction.output_text?.trim()) {
    throw new Error('Model did not return structured JSON after custom tool execution.');
  }

  cleanupStoredInteractions(client, allInteractions, store);

  return { interaction, allInteractions };
}

const EMPTY_GROUNDING: ToolGroundingResult = {
  usedSearch: false,
  usedMaps: false,
  usedUrlContext: false,
  usedCodeExecution: false,
  usedCustomTools: false,
  webCitations: [],
  places: [],
  codeImages: [],
  customToolCalls: [],
  retrievedUrlCount: 0,
};

type InlineOrUri =
  | { kind: 'inline'; base64Data: string; mimeType: string }
  | { kind: 'uri'; uri: string; mimeType: string };

interface VoiceResponseInteractionResult {
  payload: VoiceResponsePayload;
  grounding: ToolGroundingResult;
  allInteractions: InteractionWithSteps[];
}

function buildVoiceResponsePayloadFromInteraction(
  raw: string,
  allInteractions: InteractionWithSteps[],
  grounding: ToolGroundingResult,
  imageIds?: string[],
): VoiceResponsePayload {
  const { payload: parsedPayload, rawRecord } = parseVoiceResponsePayloadWithRaw(raw, { imageIds });
  const hydrated = hydrateChartsFromCodeExecution(parsedPayload, {
    usedCodeExecution: grounding.usedCodeExecution,
    interactions: allInteractions,
    rawCharts: rawRecord.charts,
  });

  return applyToolGroundingToPayload(hydrated, grounding);
}

function toInline(bytes: Buffer, mimeType: string): InlineOrUri {
  return { kind: 'inline', base64Data: bytes.toString('base64'), mimeType };
}

type InteractionContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; data?: string; uri?: string; mime_type: string }
  | { type: 'document'; data?: string; uri?: string; mime_type: string };

async function createVoiceResponseFromTranscriptAndImages(
  client: GoogleGenAI,
  model: string,
  transcript: string,
  imageInputs: InlineOrUri[] = [],
  documentInputs: Array<{ uri: string; mime_type: string }> = [],
  cueContext: {
    cameraImageCount: number;
    referenceDocumentCount: number;
    referenceDocumentNames: string[];
    referenceDocuments: Array<Pick<ParsedReferenceDocument, 'name' | 'kind'>>;
    primaryImageDimensions?: { width: number; height: number };
    cameraImages?: Array<{ id: string; width?: number; height?: number }>;
    hasFocusAnnotation?: boolean;
    perception?: PerceptionSnapshot;
    imageIds?: string[];
    liveGuide?: LiveGuideTurnOptions;
  },
  userContext?: UserContext,
  selection?: VoiceToolSelection,
  companionProfile?: CompanionProfile,
  ecosystemActivity?: UserEcosystemActivity | null,
  memoryRecall?: MemoryRecallContext,
  delegation?: DelegationPromptContext,
): Promise<VoiceResponseInteractionResult> {
  const resolvedSelection = selection ?? {
    google_search: false,
    google_maps: false,
    url_context: false,
    code_execution: false,
    custom_tools: false,
  };

  const cue = buildTranscriptMultimodalCue(transcript, {
    cameraImageCount: cueContext.cameraImageCount,
    referenceDocumentCount: cueContext.referenceDocumentCount,
    referenceDocumentNames: cueContext.referenceDocumentNames,
    totalAttachmentCount: imageInputs.length + documentInputs.length,
    selection: resolvedSelection,
    dimensions: cueContext.primaryImageDimensions,
    cameraImages: cueContext.cameraImages,
    hasFocusAnnotation: cueContext.hasFocusAnnotation,
    perception: cueContext.perception,
    imageIds: cueContext.imageIds,
    liveGuide: cueContext.liveGuide,
  });

  const inputParts: InteractionContentPart[] = [{ type: 'text', text: cue }];

  for (const imageInput of imageInputs) {
    inputParts.push(
      imageInput.kind === 'inline'
        ? { type: 'image', data: imageInput.base64Data, mime_type: imageInput.mimeType }
        : { type: 'image', uri: imageInput.uri, mime_type: imageInput.mimeType },
    );
  }

  for (const documentInput of documentInputs) {
    inputParts.push({
      type: 'document',
      uri: documentInput.uri,
      mime_type: documentInput.mime_type,
    });
  }

  const tools = buildSelectedGeminiTools(userContext, resolvedSelection, {
    includeDelegation: Boolean(delegation),
  });
  const toolsEnabled = hasSelectedToolsEnabled(resolvedSelection);

  const { result: interactionResult } = await runWithGeminiModelFallback(
    getGeminiTeacherModelCandidates(model),
    (candidateModel) =>
      runVoiceResponseInteraction(
        client,
        candidateModel,
        inputParts as InteractionInput,
        userContext,
        {
          tools,
          selection: resolvedSelection,
          referenceDocuments:
            cueContext.referenceDocuments.length > 0 ? cueContext.referenceDocuments : undefined,
          companionProfile,
          ecosystemActivity,
          memoryRecall,
          transcript,
          delegation,
          liveGuide: cueContext.liveGuide,
        },
      ),
    { timeoutMs: getGeminiTeacherTimeoutMs() },
  );
  const { interaction, allInteractions } = interactionResult;

  const raw = interaction.output_text?.trim();
  if (!raw) {
    throw new Error('Response model returned empty JSON.');
  }

  const grounding = toolsEnabled
    ? analyzeToolGroundingFromInteractions(allInteractions)
    : EMPTY_GROUNDING;
  const payload = buildVoiceResponsePayloadFromInteraction(
    raw,
    allInteractions,
    grounding,
    cueContext.imageIds,
  );

  return { payload, grounding, allInteractions };
}

async function createVoiceResponseFromText(
  client: GoogleGenAI,
  model: string,
  userTranscript: string,
  userContext?: UserContext,
): Promise<VoiceResponseInteractionResult> {
  const { result: interactionResult } = await runWithGeminiModelFallback(
    getGeminiTeacherModelCandidates(model),
    (candidateModel) =>
      runVoiceResponseInteraction(
        client,
        candidateModel,
        `User said:\n"""${userTranscript}"""`,
        userContext,
        { transcript: userTranscript },
      ),
    { timeoutMs: getGeminiTeacherTimeoutMs() },
  );
  const { interaction, allInteractions } = interactionResult;

  const raw = interaction.output_text?.trim();
  if (!raw) {
    throw new Error('Response model returned empty JSON.');
  }

  const grounding = analyzeToolGroundingFromInteractions(allInteractions);
  const payload = buildVoiceResponsePayloadFromInteraction(raw, allInteractions, grounding);

  return { payload, grounding, allInteractions };
}

export interface RunVoiceToolTurnOptions {
  userContext?: UserContext;
  /** When set, skips the router and uses this tool selection. */
  selection?: VoiceToolSelection;
  imageInputs?: InlineOrUri[];
  primaryImageDimensions?: { width: number; height: number };
  hasFocusAnnotation?: boolean;
  hasImages?: boolean;
  imageCount?: number;
  delegation?: DelegationPromptContext;
}

export interface RunVoiceToolTurnResult extends VoiceResponseInteractionResult {
  routeMs: number;
  llmMs: number;
  selection: VoiceToolSelection;
  rawSelection?: VoiceToolSelection;
  reasoning?: string | null;
}

export async function runVoiceToolTurn(
  client: GoogleGenAI,
  transcript: string,
  options?: RunVoiceToolTurnOptions,
): Promise<RunVoiceToolTurnResult> {
  const model = getGeminiResponseModel();
  const imageInputs = options?.imageInputs ?? [];
  const hasImages = options?.hasImages ?? imageInputs.length > 0;
  const imageCount = options?.imageCount ?? imageInputs.length;

  let selection: VoiceToolSelection;
  let rawSelection: VoiceToolSelection | undefined;
  let reasoning: string | null | undefined;
  let routeMs = 0;

  if (options?.selection) {
    selection = options.selection;
  } else {
    const routed = await routeVoiceTools(client, transcript, {
      hasImages,
      imageCount,
      userContext: options?.userContext,
    });
    selection = routed.selection;
    rawSelection = routed.rawSelection;
    reasoning = routed.reasoning;
    routeMs = routed.routeMs;
  }

  const llmStartedAt = performance.now();
  const result = await createVoiceResponseFromTranscriptAndImages(
    client,
    model,
    transcript,
    imageInputs,
    [],
    {
      cameraImageCount: imageInputs.length,
      referenceDocumentCount: 0,
      referenceDocumentNames: [],
      referenceDocuments: [],
      primaryImageDimensions: options?.primaryImageDimensions,
      hasFocusAnnotation: options?.hasFocusAnnotation,
    },
    options?.userContext,
    selection,
    undefined,
    undefined,
    undefined,
    options?.delegation,
  );
  const llmMs = performance.now() - llmStartedAt;

  return {
    ...result,
    routeMs,
    llmMs,
    selection,
    ...(rawSelection !== undefined ? { rawSelection } : {}),
    ...(reasoning !== undefined ? { reasoning } : {}),
  };
}

export interface MultimodalImageInput {
  imageId?: string;
  bytes: Buffer;
  mimeType: string;
  captureMode?: CaptureMode;
  width?: number;
  height?: number;
  focusAnnotations?: FocusAnnotation[];
  perception?: PerceptionSnapshot;
}

export type { DelegationPromptContext };

export async function buildVoiceResponseFromMultimodal(
  client: GoogleGenAI,
  audioBytes: Buffer,
  mimeType: string,
  images?: MultimodalImageInput[],
  userContext?: UserContext,
  audioDurationMs = 0,
  referenceDocuments: ParsedReferenceDocument[] = [],
  companionProfile?: CompanionProfile,
  ecosystemActivity?: UserEcosystemActivity | null,
  memoryContext?: MemoryContext,
  delegation?: DelegationPromptContext,
  liveGuide?: LiveGuideTurnOptions,
): Promise<{
  payload: VoiceResponsePayload;
  ttsPrompt: string | null;
  transcript: string;
  understandingMs: number;
  sttMs: number;
  routeMs: number;
  llmMs: number;
  grounding: ToolGroundingResult;
}> {
  const useTranscriptOverride = Boolean(
    liveGuide?.transcriptOverride?.trim() || liveGuide?.monitor || liveGuide?.bootstrap,
  );

  if (!useTranscriptOverride) {
    const normalizedMimeType = normalizeAudioMimeType(mimeType);
    assertSupportedAudioMimeType(normalizedMimeType);
  }

  const normalizedImages = (images ?? []).map((image, index) => ({
    ...image,
    imageId: image.imageId?.trim() || `capture-${index + 1}`,
    normalizedMimeType: normalizeImageMimeType(image.mimeType),
  }));

  for (const image of normalizedImages) {
    assertSupportedImageMimeType(image.normalizedMimeType);
  }

  const referenceImageDocs = referenceDocuments.filter((doc) => doc.kind === 'image');
  const referencePdfDocs = referenceDocuments.filter((doc) => doc.kind === 'pdf');

  for (const doc of referenceImageDocs) {
    assertSupportedImageMimeType(normalizeImageMimeType(doc.mimeType));
  }

  const model = getGeminiResponseModel();
  const pipelineStartedAt = performance.now();

  let transcript: string;
  let sttMs = 0;

  if (useTranscriptOverride) {
    transcript =
      liveGuide?.transcriptOverride?.trim() ||
      (liveGuide?.bootstrap ? LIVE_GUIDE_BOOTSTRAP_TRANSCRIPT : LIVE_GUIDE_MONITOR_TRANSCRIPT);
  } else {
    const normalizedMimeType = normalizeAudioMimeType(mimeType);
    const { bytes: preparedAudioBytes, mimeType: interactionMimeType } = sanitizeInteractionAudio(
      audioBytes,
      normalizedMimeType,
    );
    const sttResult = await transcribeAudioToText(
      preparedAudioBytes,
      interactionMimeType,
      audioDurationMs,
    );
    transcript = sttResult.transcript;
    sttMs = sttResult.sttMs;
  }

  const totalImageCount = normalizedImages.length + referenceImageDocs.length;
  const routeContext = {
    hasImages: totalImageCount > 0,
    imageCount: totalImageCount,
    userContext,
  };
  const isMonitorTurn = Boolean(liveGuide?.monitor);
  const isFrameOnlyTurn = Boolean(liveGuide?.monitor || liveGuide?.bootstrap);

  const [{ selection, routeMs }, memories, recentTurns] = await Promise.all([
    isFrameOnlyTurn
      ? Promise.resolve({ selection: EMPTY_TOOL_SELECTION, routeMs: 0 })
      : routeVoiceTools(client, transcript, routeContext),
    memoryContext && !isFrameOnlyTurn
      ? searchUserMemories(memoryContext.memoryUserId, transcript)
      : Promise.resolve([]),
    memoryContext && !isFrameOnlyTurn
      ? fetchRecentTurns({
          workspaceId: memoryContext.workspaceId,
          astraKey: memoryContext.astraKey,
        })
      : Promise.resolve([]),
  ]);

  const memoryRecall: MemoryRecallContext | undefined = memoryContext
    ? { memories, recentTurns }
    : undefined;

  const imageInputs: InlineOrUri[] = [
    ...normalizedImages.map((image) => toInline(image.bytes, image.normalizedMimeType)),
    ...referenceImageDocs.map((doc) => toInline(doc.bytes, normalizeImageMimeType(doc.mimeType))),
  ];

  const documentInputs = await Promise.all(
    referencePdfDocs.map(async (doc) => {
      const uploaded = await uploadReferencePdfForGemini(client, doc.bytes);
      return {
        uri: uploaded.uri,
        mime_type: uploaded.mimeType,
      };
    }),
  );

  const primaryImageDimensions =
    normalizedImages[0]?.width && normalizedImages[0]?.height
      ? { width: normalizedImages[0].width, height: normalizedImages[0].height }
      : undefined;
  const cameraImages = normalizedImages.map((image) => ({
    id: image.imageId,
    ...(image.width && image.height ? { width: image.width, height: image.height } : {}),
  }));
  const cueContext = {
    cameraImageCount: normalizedImages.length,
    referenceDocumentCount: referenceDocuments.length,
    referenceDocumentNames: referenceDocuments.map((doc) => doc.name),
    referenceDocuments: referenceDocuments.map((doc) => ({ name: doc.name, kind: doc.kind })),
    primaryImageDimensions,
    cameraImages,
    hasFocusAnnotation: normalizedImages.some((image) => (image.focusAnnotations?.length ?? 0) > 0),
    perception: normalizedImages.find((image) => image.perception)?.perception,
    imageIds: normalizedImages.map((image) => image.imageId),
    ...(liveGuide?.active ? { liveGuide } : {}),
  };

  const llmStartedAt = performance.now();
  let result: VoiceResponseInteractionResult;

  try {
    result = await createVoiceResponseFromTranscriptAndImages(
      client,
      model,
      transcript,
      imageInputs,
      documentInputs,
      cueContext,
      userContext,
      selection,
      companionProfile,
      ecosystemActivity,
      memoryRecall,
      delegation,
    );
  } catch (error) {
    if (isInteractionAudioMimeFailure(error) && selection.code_execution) {
      result = await createVoiceResponseFromTranscriptAndImages(
        client,
        model,
        transcript,
        imageInputs,
        documentInputs,
        cueContext,
        userContext,
        { ...selection, code_execution: false },
        companionProfile,
        ecosystemActivity,
        memoryRecall,
        delegation,
      );
    } else {
      throw error;
    }
  }

  const llmMs = performance.now() - llmStartedAt;

  // Silent Live Guide monitoring turns legitimately return no spoken transcript.
  const ttsPrompt = result.payload.spoken_transcript.trim()
    ? buildTtsPromptFromPayload(result.payload)
    : isMonitorTurn
      ? null
      : buildTtsPromptFromPayload(result.payload);

  return {
    payload: result.payload,
    ttsPrompt,
    transcript,
    understandingMs: performance.now() - pipelineStartedAt,
    sttMs,
    routeMs,
    llmMs,
    grounding: result.grounding,
  };
}

export type { MemoryContext } from '@/lib/mem0/types';

/** @deprecated Use buildVoiceResponseFromMultimodal */
export async function buildVoiceResponseFromAudio(
  client: GoogleGenAI,
  audioBytes: Buffer,
  mimeType: string,
  userContext?: UserContext,
): Promise<{ payload: VoiceResponsePayload; ttsPrompt: string; understandingMs: number }> {
  const result = await buildVoiceResponseFromMultimodal(client, audioBytes, mimeType, undefined, userContext);
  return {
    payload: result.payload,
    // Non-live turns always produce a TTS prompt.
    ttsPrompt: result.ttsPrompt ?? '',
    understandingMs: result.understandingMs,
  };
}

/** @deprecated Use buildVoiceResponseFromMultimodal */
export async function buildSpokenResponsePromptFromAudio(
  client: GoogleGenAI,
  audioBytes: Buffer,
  mimeType: string,
): Promise<{ ttsPrompt: string; understandingMs: number }> {
  const result = await buildVoiceResponseFromMultimodal(client, audioBytes, mimeType);
  return {
    ttsPrompt: result.ttsPrompt ?? '',
    understandingMs: result.understandingMs,
  };
}

export async function buildSpokenResponsePrompt(
  userTranscript: string,
  userContext?: UserContext,
): Promise<string> {
  const { GoogleGenAI } = await import('@google/genai');
  const { getGeminiApiKey } = await import('@/lib/gemini/config');

  const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  const model = getGeminiResponseModel();
  const { payload } = await createVoiceResponseFromText(client, model, userTranscript, userContext);

  return buildTtsPromptFromPayload(payload);
}

export type { ToolGroundingResult, PlaceCard } from '@/lib/gemini/tool-grounding';
