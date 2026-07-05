import { pickBestScore, scoreVideoFrame } from './capture';
import { prepareVideoFrameForModel, type PreparedImageForModel } from './encode';
import type { CapturedFrame, FrameScore } from './types';

const SAMPLE_INTERVAL_MS = 200;
const MAX_SCORES = 30;

interface RetainedBestFrame {
  score: FrameScore;
  prepared: PreparedImageForModel;
}

export class FrameBuffer {
  private scores: FrameScore[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private video: HTMLVideoElement | null = null;
  private bestRetained: RetainedBestFrame | null = null;
  private sampleInFlight = false;

  start(video: HTMLVideoElement): void {
    this.stop();
    this.video = video;
    this.scores = [];
    this.bestRetained = null;

    this.intervalId = setInterval(() => {
      void this.sampleScore();
    }, SAMPLE_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.video = null;
    this.scores = [];
    this.bestRetained = null;
    this.sampleInFlight = false;
  }

  async stopAsync(): Promise<CapturedFrame | null> {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const video = this.video;
    this.video = null;

    if (video) {
      await this.tryRetainCandidate(video);
    }

    const bestScore = pickBestScore(this.scores);
    this.scores = [];

    if (!video || !bestScore) {
      return null;
    }

    let prepared: PreparedImageForModel | null = null;

    if (
      this.bestRetained &&
      this.bestRetained.score.sharpness >= bestScore.sharpness
    ) {
      prepared = this.bestRetained.prepared;
    } else {
      prepared = await prepareVideoFrameForModel(video);
    }

    this.bestRetained = null;

    if (!prepared) {
      return null;
    }

    return {
      blob: prepared.blob,
      mimeType: prepared.mimeType,
      width: prepared.width,
      height: prepared.height,
      sharpness: bestScore.sharpness,
      capturedAt: bestScore.capturedAt,
    };
  }

  private async tryRetainCandidate(video: HTMLVideoElement): Promise<void> {
    const score = scoreVideoFrame(video);
    if (!score) return;

    this.scores.push(score);

    if (this.bestRetained && score.sharpness <= this.bestRetained.score.sharpness) {
      return;
    }

    const prepared = await prepareVideoFrameForModel(video);
    if (!prepared) return;

    this.bestRetained = { score, prepared };
  }

  private async sampleScore(): Promise<void> {
    if (!this.video || this.scores.length >= MAX_SCORES || this.sampleInFlight) return;

    this.sampleInFlight = true;
    try {
      await this.tryRetainCandidate(this.video);
    } finally {
      this.sampleInFlight = false;
    }
  }
}
