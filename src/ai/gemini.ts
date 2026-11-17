import { GoogleGenAI, Content } from '@google/genai';
import { config } from '../config.js';
import { MINZA_SYSTEM_PROMPT } from '../persona.js';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

// Keep recent conversation turns per guild so Minza remembers context
const MAX_HISTORY_MESSAGES = 20;
const guildHistories = new Map<string, Content[]>();

function getHistory(guildId: string): Content[] {
  let history = guildHistories.get(guildId);
  if (!history) {
    history = [];
    guildHistories.set(guildId, history);
  }
  return history;
}

function appendHistory(guildId: string, userText: string, modelText: string): void {
  const history = getHistory(guildId);
  history.push(
    { role: 'user', parts: [{ text: userText }] },
    { role: 'model', parts: [{ text: modelText }] }
  );

  if (history.length > MAX_HISTORY_MESSAGES) {
    history.splice(0, history.length - MAX_HISTORY_MESSAGES);
  }
}

function sanitizeForSpeech(text: string): string {
  return text
    .replace(/[*_`#>]/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function clearGuildHistory(guildId: string): void {
  guildHistories.delete(guildId);
}

/**
 * Sends a user's voice clip (WAV) directly to Gemini and gets Minza's conversational response.
 * Returns null if Gemini detects silence/noise ([SILENCE]).
 */
export async function generateVoiceReply(
  guildId: string,
  speakerName: string,
  wavBuffer: Buffer
): Promise<string | null> {
  const history = getHistory(guildId);
  const audioBase64 = wavBuffer.toString('base64');

  const contents: Content[] = [
    ...history,
    {
      role: 'user',
      parts: [
        {
          text: `${speakerName} พูดใน Voice Channel:`,
        },
        {
          inlineData: {
            mimeType: 'audio/wav',
            data: audioBase64,
          },
        },
      ],
    },
  ];

  const supportsThinkingBudget = !config.geminiModel.includes('lite');

  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents,
    config: {
      systemInstruction: MINZA_SYSTEM_PROMPT,
      temperature: 0.85,
      maxOutputTokens: 120,
      ...(supportsThinkingBudget ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  });

  const rawText = response.text?.trim() || '';
  if (!rawText || rawText.includes('[SILENCE]')) {
    return null;
  }

  const reply = sanitizeForSpeech(rawText);
  if (!reply) return null;

  // Store text summary in history (we avoid storing raw audio bytes in history to keep tokens low)
  appendHistory(guildId, `${speakerName} พูดคุยด้วยเสียง`, reply);
  return reply;
}

/**
 * Generates a reply from a text prompt (e.g., !ask or /ask).
 */
export async function generateTextReply(
  guildId: string,
  speakerName: string,
  message: string
): Promise<string> {
  const history = getHistory(guildId);
  const userTurn = `${speakerName}: ${message}`;

  const contents: Content[] = [
    ...history,
    {
      role: 'user',
      parts: [{ text: userTurn }],
    },
  ];

  const supportsThinkingBudget = !config.geminiModel.includes('lite');

  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents,
    config: {
      systemInstruction: MINZA_SYSTEM_PROMPT,
      temperature: 0.85,
      maxOutputTokens: 300,
      ...(supportsThinkingBudget ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  });

  const reply = sanitizeForSpeech(response.text || 'อ๊ะ สมองมินซ่าค้างไปแป๊บนึง ลองพูดใหม่อีกทีนะ!');
  appendHistory(guildId, userTurn, reply);
  return reply;
}
