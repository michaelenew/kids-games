/**
 * Listening, done entirely on this device.
 *
 * Vosk is an offline speech recognizer; vosk-browser is a WebAssembly build
 * of it that runs in a background thread of the page. The model (about 40 MB)
 * is downloaded once and kept in the browser's Cache Storage, so after the
 * first visit nothing is downloaded and no audio ever leaves the device.
 *
 * Each question listens for a short list of words (a "grammar"): the 26
 * letter names, or the numbers. A short list makes it far more accurate than
 * open dictation, and anything else she says comes back as "[unk]".
 */

import type { KaldiRecognizer, Model } from 'vosk-browser';

const MODEL_FILE = 'vosk-model-small-en-us-0.15.tar.gz';
const MODEL_URL = new URL(`../models/${MODEL_FILE}`, document.baseURI).href;
const CACHE = 'unicorn-rancher-voice-v1';

export type VoiceStatus = 'off' | 'loading' | 'ready' | 'failed';

export interface Heard {
  text: string;
  /** False while she's still talking (a partial guess), true once she stops. */
  final: boolean;
}

type Listener = (h: Heard) => void;

class Voice {
  status: VoiceStatus = 'off';
  /** Download progress, 0 to 1. */
  progress = 0;
  error = '';
  /** Microphone loudness, 0 to 1, for the glowing mic. */
  level = 0;

  private model: Model | null = null;
  private loading: Promise<void> | null = null;
  private progressFns: ((p: number) => void)[] = [];
  private recognizer: KaldiRecognizer | null = null;
  private listener: Listener | null = null;
  /** Held so the browser doesn't garbage-collect the audio graph mid-game. */
  audioGraph: unknown[] = [];
  private mutedUntil = 0;
  private muted = false;
  private sampleRate = 48000;

  /** Load the model. Doesn't touch the microphone, so it can start early. */
  load(onProgress?: (p: number) => void): Promise<void> {
    if (onProgress) this.progressFns.push(onProgress);
    // One download, however many callers are waiting on it.
    if (!this.loading || this.status === 'failed') this.loading = this.loadOnce();
    return this.loading;
  }

  private async loadOnce(): Promise<void> {
    if (this.model) return;
    this.status = 'loading';
    this.error = '';
    try {
      const blob = await fetchModel((p) => {
        this.progress = p;
        for (const fn of this.progressFns) fn(p);
      });
      const url = URL.createObjectURL(blob);
      const { createModel } = await import('vosk-browser');
      this.model = await createModel(url, -1);
      URL.revokeObjectURL(url);
    } catch (e) {
      this.status = 'failed';
      this.error = String(e);
      throw e;
    }
  }

  /**
   * Turn the microphone on. Needs a tap first on iPad (browsers only allow the
   * microphone and sound after the player touches the page).
   */
  async start(onProgress?: (p: number) => void): Promise<void> {
    if (this.status === 'ready') return;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('No microphone access in this browser');
      const ctx = new AudioContext();
      // Ask for the mic first, so the permission question pops up straight
      // after the tap and the model downloads meanwhile.
      const streamP = navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      const [stream] = await Promise.all([streamP, this.load(onProgress)]);
      await ctx.resume();
      this.sampleRate = ctx.sampleRate;
      const source = ctx.createMediaStreamSource(stream);
      // ScriptProcessor is old but works in every browser, Safari included.
      const node = ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (ev) => {
        const data = ev.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / (data.length / 4));
        this.level = Math.min(1, rms * 8);
        if (this.isMuted()) {
          this.level = 0;
          return;
        }
        this.feed(data, ev.inputBuffer.sampleRate);
      };
      source.connect(node);
      // Some browsers only run the processor when it's connected to the
      // speakers; it outputs silence.
      node.connect(ctx.destination);
      this.audioGraph = [ctx, source, node, stream];
      this.status = 'ready';
    } catch (e) {
      this.status = 'failed';
      this.error = this.error || String(e);
      throw e;
    }
  }

  /** Hand the recognizer audio. The microphone does this; tests do too. */
  feed(samples: Float32Array, sampleRate: number): void {
    if (!this.recognizer) return;
    try {
      this.recognizer.acceptWaveformFloat(new Float32Array(samples), sampleRate);
    } catch {
      // A dropped chunk is fine.
    }
  }

  /**
   * Listen for these words until stop() is called. `onHeard` gets her
   * partial guesses while she talks and the final result when she stops.
   */
  listen(words: string[], onHeard: Listener, sampleRate = this.sampleRate): () => void {
    this.stop();
    if (!this.model) return () => {};
    const rec = new this.model.KaldiRecognizer(sampleRate, JSON.stringify([...words, '[unk]']));
    this.recognizer = rec;
    this.listener = onHeard;
    rec.on('partialresult', (m) => {
      if (this.recognizer !== rec || this.isMuted()) return;
      const text = (m as { result: { partial: string } }).result.partial;
      if (text) this.listener?.({ text, final: false });
    });
    rec.on('result', (m) => {
      if (this.recognizer !== rec || this.isMuted()) return;
      const text = (m as { result: { text: string } }).result.text;
      if (text) this.listener?.({ text, final: true });
    });
    return () => {
      if (this.recognizer === rec) this.stop();
    };
  }

  stop(): void {
    if (this.recognizer) {
      try {
        this.recognizer.remove();
      } catch {
        // Already gone.
      }
    }
    this.recognizer = null;
    this.listener = null;
  }

  /** Stop hearing for a while (while the game itself is talking). */
  setMuted(on: boolean): void {
    this.muted = on;
    // A little tail after the game stops talking, for the room's echo.
    if (!on) this.mutedUntil = performance.now() + 350;
  }

  private isMuted(): boolean {
    return this.muted || performance.now() < this.mutedUntil;
  }

  get ready(): boolean {
    return this.status === 'ready';
  }
}

/** The model file, from the device's cache if we have it, else downloaded (and cached). */
async function fetchModel(onProgress: (p: number) => void): Promise<Blob> {
  const cache = 'caches' in window ? await caches.open(CACHE).catch(() => null) : null;
  const hit = await cache?.match(MODEL_URL);
  if (hit) {
    onProgress(1);
    return hit.blob();
  }
  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) throw new Error(`Model download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 41_200_000;
  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(Math.min(0.99, got / total));
  }
  const blob = new Blob(chunks, { type: 'application/gzip' });
  try {
    await cache?.put(MODEL_URL, new Response(blob));
    // Ask the browser not to clear it when space runs low.
    await navigator.storage?.persist?.();
  } catch {
    // No room to cache: it'll download again next time.
  }
  onProgress(1);
  return blob;
}

export const voice = new Voice();
