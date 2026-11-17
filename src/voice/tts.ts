import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { Readable } from 'node:stream';
import { config } from '../config.js';

function sanitizeForTts(text: string): string {
  return text
    .replace(/&/g, 'และ')
    .replace(/[<>"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitIntoChunks(text: string, maxLen = 180): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let splitIdx = remaining.lastIndexOf(' ', maxLen);
    if (splitIdx <= 0) splitIdx = maxLen;
    chunks.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks;
}

async function synthesizeGoogleBuffer(text: string): Promise<Buffer> {
  const chunks = splitIntoChunks(text, 180);
  const buffers = await Promise.all(
    chunks.map(async (chunk) => {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=th&client=tw-ob&q=${encodeURIComponent(chunk)}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Google TTS HTTP ${res.status}`);
      }
      return Buffer.from(await res.arrayBuffer());
    })
  );
  return Buffer.concat(buffers);
}

async function synthesizeEdgeBuffer(text: string): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(
        config.ttsVoice,
        OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
      );

      const { audioStream } = tts.toStream(text);
      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        audioStream.on('data', (chunk: Buffer) => chunks.push(chunk));
        audioStream.on('end', () => resolve(Buffer.concat(chunks)));
        audioStream.on('error', (err: Error) => reject(err));
      });

      if (buffer.length > 0) return buffer;
      lastError = new Error('Edge TTS returned empty audio buffer');
    } catch (err) {
      lastError = err;
      console.warn(`[Edge TTS] Attempt ${attempt} failed:`, (err as Error)?.message || err);
    } finally {
      tts.close();
    }
  }
  throw lastError;
}

/**
 * Synthesizes Thai/English speech.
 * Defaults to fast Google TTS (~240ms), or Edge Neural TTS with automatic fallback to Google TTS.
 */
export async function synthesizeSpeechStream(rawText: string): Promise<Readable> {
  const text = sanitizeForTts(rawText);
  if (!text) {
    throw new Error('Empty text passed to TTS');
  }

  if (config.ttsProvider === 'edge') {
    try {
      const buffer = await synthesizeEdgeBuffer(text);
      return Readable.from(buffer);
    } catch {
      console.warn('[TTS] Falling back to Google TTS');
    }
  }

  const buffer = await synthesizeGoogleBuffer(text);
  return Readable.from(buffer);
}
