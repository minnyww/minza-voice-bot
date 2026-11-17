import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  discordToken: requireEnv('DISCORD_TOKEN'),
  discordClientId: process.env.DISCORD_CLIENT_ID?.trim() || '',
  geminiApiKey: requireEnv('GEMINI_API_KEY'),
  geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
  ttsProvider: (process.env.TTS_PROVIDER?.trim() || 'google') as 'google' | 'edge',
  ttsVoice: process.env.TTS_VOICE?.trim() || 'th-TH-PremwadeeNeural',
  commandPrefix: process.env.COMMAND_PREFIX?.trim() || '!',
};
