/**
 * Wraps raw PCM audio data (16-bit signed little-endian) with a standard 44-byte RIFF/WAV header.
 */
export function pcmToWav(
  pcmBuffer: Buffer,
  sampleRate = 48000,
  channels = 2,
  bitDepth = 16
): Buffer {
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Estimates audio duration in milliseconds for 48kHz stereo 16-bit PCM.
 */
export function getPcmDurationMs(
  pcmBuffer: Buffer,
  sampleRate = 48000,
  channels = 2,
  bytesPerSample = 2
): number {
  const bytesPerSecond = sampleRate * channels * bytesPerSample;
  return (pcmBuffer.length / bytesPerSecond) * 1000;
}

/**
 * Computes root-mean-square (RMS) amplitude of 16-bit PCM samples to filter out silent/noise-only clips.
 */
export function getPcmRms(pcmBuffer: Buffer): number {
  const sampleCount = Math.floor(pcmBuffer.length / 2);
  if (sampleCount === 0) return 0;

  let sumSquares = 0;
  for (let i = 0; i < sampleCount; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2);
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / sampleCount);
}

/**
 * Downsamples 48kHz stereo 16-bit PCM to 16kHz mono 16-bit PCM (6x smaller payload for Gemini).
 */
export function downsample48kStereoTo16kMono(pcm48kStereo: Buffer): Buffer {
  const frameSize = 12; // 3 stereo frames * 4 bytes per stereo frame
  const outSamples = Math.floor(pcm48kStereo.length / frameSize);
  const out = Buffer.allocUnsafe(outSamples * 2);

  for (let i = 0; i < outSamples; i++) {
    const offset = i * frameSize;
    const left = pcm48kStereo.readInt16LE(offset);
    const right = pcm48kStereo.readInt16LE(offset + 2);
    const mono = Math.round((left + right) / 2);
    out.writeInt16LE(mono, i * 2);
  }

  return out;
}
