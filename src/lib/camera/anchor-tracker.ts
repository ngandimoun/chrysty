/**
 * Lightweight client-side anchor tracking for Live Guide.
 *
 * When the model returns guide directives, their coordinates refer to the
 * reference frame that was sent for that turn. The camera keeps moving, so we
 * track a small grayscale patch around each directive anchor from the
 * reference frame into the live feed (coarse-to-fine zero-mean template
 * matching on a downscaled canvas) and report a per-anchor translation.
 * No external dependencies — plain canvas 2D.
 */

const ANALYSIS_WIDTH = 240;
const PATCH_HALF = 10; // 21x21 patch
const COARSE_RADIUS = 22;
const COARSE_STEP = 2;
const REFINE_RADIUS = 2;
/** Mean absolute difference (gray levels, zero-mean) above which a match is untrusted. */
const MAX_TRUSTED_DIFF = 42;

export interface AnchorPoint {
  id: string;
  /** Normalized 0-1 position on the reference frame. */
  x: number;
  y: number;
}

export interface TrackedAnchor {
  id: string;
  /** Normalized translation to apply to the directive's points. */
  dx: number;
  dy: number;
  /** 0-1; below ~0.5 the caller should freeze/dim the directive. */
  confidence: number;
}

interface GrayFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface AnchorState {
  id: string;
  template: Float32Array;
  templateMean: number;
  /** Current best position in analysis pixels. */
  px: number;
  py: number;
  /** Original position in analysis pixels. */
  originX: number;
  originY: number;
  confidence: number;
}

function toGray(imageData: ImageData): Uint8ClampedArray {
  const { data, width, height } = imageData;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }
  return gray;
}

function extractPatch(frame: GrayFrame, cx: number, cy: number): Float32Array | null {
  const size = PATCH_HALF * 2 + 1;
  if (
    cx - PATCH_HALF < 0 ||
    cy - PATCH_HALF < 0 ||
    cx + PATCH_HALF >= frame.width ||
    cy + PATCH_HALF >= frame.height
  ) {
    return null;
  }

  const patch = new Float32Array(size * size);
  let index = 0;
  for (let y = cy - PATCH_HALF; y <= cy + PATCH_HALF; y += 1) {
    const rowOffset = y * frame.width;
    for (let x = cx - PATCH_HALF; x <= cx + PATCH_HALF; x += 1) {
      patch[index] = frame.data[rowOffset + x];
      index += 1;
    }
  }
  return patch;
}

function patchMean(patch: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < patch.length; i += 1) {
    sum += patch[i];
  }
  return sum / patch.length;
}

/** Zero-mean mean-absolute-difference between the stored template and a frame window. */
function matchScore(
  frame: GrayFrame,
  cx: number,
  cy: number,
  template: Float32Array,
  templateMean: number,
): number | null {
  if (
    cx - PATCH_HALF < 0 ||
    cy - PATCH_HALF < 0 ||
    cx + PATCH_HALF >= frame.width ||
    cy + PATCH_HALF >= frame.height
  ) {
    return null;
  }

  let windowSum = 0;
  let index = 0;
  for (let y = cy - PATCH_HALF; y <= cy + PATCH_HALF; y += 1) {
    const rowOffset = y * frame.width;
    for (let x = cx - PATCH_HALF; x <= cx + PATCH_HALF; x += 1) {
      windowSum += frame.data[rowOffset + x];
      index += 1;
    }
  }
  const windowMean = windowSum / index;

  let diff = 0;
  index = 0;
  for (let y = cy - PATCH_HALF; y <= cy + PATCH_HALF; y += 1) {
    const rowOffset = y * frame.width;
    for (let x = cx - PATCH_HALF; x <= cx + PATCH_HALF; x += 1) {
      diff += Math.abs(frame.data[rowOffset + x] - windowMean - (template[index] - templateMean));
      index += 1;
    }
  }

  return diff / index;
}

function searchBestMatch(
  frame: GrayFrame,
  startX: number,
  startY: number,
  template: Float32Array,
  templateMean: number,
): { x: number; y: number; diff: number } | null {
  let best: { x: number; y: number; diff: number } | null = null;

  for (let dy = -COARSE_RADIUS; dy <= COARSE_RADIUS; dy += COARSE_STEP) {
    for (let dx = -COARSE_RADIUS; dx <= COARSE_RADIUS; dx += COARSE_STEP) {
      const score = matchScore(frame, startX + dx, startY + dy, template, templateMean);
      if (score !== null && (best === null || score < best.diff)) {
        best = { x: startX + dx, y: startY + dy, diff: score };
      }
    }
  }

  if (!best) return null;

  for (let dy = -REFINE_RADIUS; dy <= REFINE_RADIUS; dy += 1) {
    for (let dx = -REFINE_RADIUS; dx <= REFINE_RADIUS; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const score = matchScore(frame, best.x + dx, best.y + dy, template, templateMean);
      if (score !== null && score < best.diff) {
        best = { x: best.x + dx, y: best.y + dy, diff: score };
      }
    }
  }

  return best;
}

export class AnchorTracker {
  private anchors: AnchorState[] = [];
  private analysisWidth = ANALYSIS_WIDTH;
  private analysisHeight = 0;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;

  /**
   * Capture templates for each anchor from the reference frame the model saw.
   * Anchors whose patch falls outside the frame edge are tracked as static.
   */
  async initialize(referenceFrame: Blob, anchors: AnchorPoint[]): Promise<void> {
    this.anchors = [];
    if (anchors.length === 0) return;

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(referenceFrame);
    } catch {
      return;
    }

    try {
      const aspect = bitmap.height / bitmap.width;
      this.analysisHeight = Math.max(Math.round(this.analysisWidth * aspect), 1);

      const canvas = document.createElement('canvas');
      canvas.width = this.analysisWidth;
      canvas.height = this.analysisHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(bitmap, 0, 0, this.analysisWidth, this.analysisHeight);
      const frame: GrayFrame = {
        data: toGray(ctx.getImageData(0, 0, this.analysisWidth, this.analysisHeight)),
        width: this.analysisWidth,
        height: this.analysisHeight,
      };

      for (const anchor of anchors) {
        const px = Math.round(anchor.x * this.analysisWidth);
        const py = Math.round(anchor.y * this.analysisHeight);
        const clampedX = Math.min(Math.max(px, PATCH_HALF), this.analysisWidth - PATCH_HALF - 1);
        const clampedY = Math.min(Math.max(py, PATCH_HALF), this.analysisHeight - PATCH_HALF - 1);
        const template = extractPatch(frame, clampedX, clampedY);
        if (!template) continue;

        this.anchors.push({
          id: anchor.id,
          template,
          templateMean: patchMean(template),
          px: clampedX,
          py: clampedY,
          originX: clampedX,
          originY: clampedY,
          confidence: 1,
        });
      }

      this.canvas = canvas;
      this.context = ctx;
    } finally {
      bitmap.close();
    }
  }

  hasAnchors(): boolean {
    return this.anchors.length > 0;
  }

  /** Match anchors against the current live frame; returns per-anchor translation. */
  track(video: HTMLVideoElement): TrackedAnchor[] {
    if (
      this.anchors.length === 0 ||
      !this.canvas ||
      !this.context ||
      video.videoWidth === 0 ||
      video.videoHeight === 0 ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      return this.snapshot();
    }

    this.context.drawImage(video, 0, 0, this.analysisWidth, this.analysisHeight);
    const frame: GrayFrame = {
      data: toGray(this.context.getImageData(0, 0, this.analysisWidth, this.analysisHeight)),
      width: this.analysisWidth,
      height: this.analysisHeight,
    };

    for (const anchor of this.anchors) {
      const best = searchBestMatch(frame, anchor.px, anchor.py, anchor.template, anchor.templateMean);
      if (!best) {
        anchor.confidence = Math.max(anchor.confidence - 0.2, 0);
        continue;
      }

      const confidence = Math.max(0, 1 - best.diff / MAX_TRUSTED_DIFF);
      if (confidence >= 0.5) {
        anchor.px = best.x;
        anchor.py = best.y;
        anchor.confidence = confidence;
      } else {
        // Keep the last trusted position; decay confidence so the UI can dim.
        anchor.confidence = Math.max(Math.min(anchor.confidence, confidence + 0.25), 0);
      }
    }

    return this.snapshot();
  }

  private snapshot(): TrackedAnchor[] {
    if (this.analysisHeight === 0) return [];

    return this.anchors.map((anchor) => ({
      id: anchor.id,
      dx: (anchor.px - anchor.originX) / this.analysisWidth,
      dy: (anchor.py - anchor.originY) / this.analysisHeight,
      confidence: anchor.confidence,
    }));
  }

  stop(): void {
    this.anchors = [];
    this.canvas = null;
    this.context = null;
  }
}
