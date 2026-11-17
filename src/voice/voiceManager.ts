import {
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  EndBehaviorType,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnection,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { Guild, TextBasedChannel, VoiceBasedChannel } from 'discord.js';
import prism from 'prism-media';
import { generateVoiceReply } from '../ai/gemini.js';
import {
  downsample48kStereoTo16kMono,
  getPcmDurationMs,
  getPcmRms,
  pcmToWav,
} from './audioUtils.js';
import { synthesizeSpeechStream } from './tts.js';

interface GuildVoiceSession {
  connection: VoiceConnection;
  player: AudioPlayer;
  textChannel?: TextBasedChannel;
  activeListeners: Set<string>;
  processingQueue: Promise<void>;
  isSpeaking: boolean;
}

const sessions = new Map<string, GuildVoiceSession>();

const MIN_AUDIO_DURATION_MS = 450;
const MAX_AUDIO_DURATION_MS = 25000;
const MIN_AUDIO_RMS = 250;

export function getSession(guildId: string): GuildVoiceSession | undefined {
  return sessions.get(guildId);
}

export async function joinChannel(
  voiceChannel: VoiceBasedChannel,
  textChannel?: TextBasedChannel
): Promise<GuildVoiceSession> {
  const guildId = voiceChannel.guild.id;
  const existing = sessions.get(guildId);
  if (existing) {
    existing.textChannel = textChannel ?? existing.textChannel;
    return existing;
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Pause,
    },
  });

  connection.subscribe(player);

  const session: GuildVoiceSession = {
    connection,
    player,
    textChannel,
    activeListeners: new Set<string>(),
    processingQueue: Promise.resolve(),
    isSpeaking: false,
  };

  sessions.set(guildId, session);

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      leaveChannel(guildId);
    }
  });

  connection.on('error', (err) => {
    console.error(`[VoiceConnection Error][${guildId}]`, err);
  });

  player.on('error', (err) => {
    console.error(`[AudioPlayer Error][${guildId}]`, err);
    session.isSpeaking = false;
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
  setupVoiceReceiver(voiceChannel.guild, session);

  return session;
}

export function leaveChannel(guildId: string): boolean {
  const session = sessions.get(guildId);
  const connection = session?.connection ?? getVoiceConnection(guildId);

  if (session) {
    session.player.stop(true);
    session.activeListeners.clear();
    sessions.delete(guildId);
  }

  if (connection) {
    connection.destroy();
    return true;
  }

  return false;
}

export async function speakInChannel(guildId: string, text: string): Promise<void> {
  const session = sessions.get(guildId);
  if (!session) return;

  session.isSpeaking = true;
  try {
    const audioStream = await synthesizeSpeechStream(text);
    const transcoder = new prism.FFmpeg({
      args: [
        '-analyzeduration', '0',
        '-loglevel', '0',
        '-i', '-',
        '-filter:a', 'atempo=1.18',
        '-f', 's16le',
        '-ar', '48000',
        '-ac', '2',
      ],
    });
    const spedUpStream = audioStream.pipe(transcoder);
    const resource = createAudioResource(spedUpStream, {
      inputType: StreamType.Raw,
    });

    session.player.play(resource);
    await entersState(session.player, AudioPlayerStatus.Playing, 10_000).catch(() => {});
    await entersState(session.player, AudioPlayerStatus.Idle, 60_000).catch(() => {});
  } finally {
    session.isSpeaking = false;
  }
}

function setupVoiceReceiver(guild: Guild, session: GuildVoiceSession): void {
  const receiver = session.connection.receiver;

  receiver.speaking.on('start', (userId) => {
    if (session.activeListeners.has(userId)) return;

    const member = guild.members.cache.get(userId);
    if (member?.user.bot) return;

    // Avoid picking up audio while Minza is speaking
    if (session.isSpeaking) return;

    session.activeListeners.add(userId);
    const speakerName = member?.displayName || member?.user.username || 'เพื่อน';

    const opusStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 500,
      },
    });

    const decoder = new prism.opus.Decoder({
      rate: 48000,
      channels: 2,
      frameSize: 960,
    });

    const pcmChunks: Buffer[] = [];
    const decodedStream = opusStream.pipe(decoder);

    decodedStream.on('data', (chunk: Buffer) => {
      pcmChunks.push(chunk);
    });

    const cleanup = () => {
      session.activeListeners.delete(userId);
      if (!opusStream.destroyed) opusStream.destroy();
      if (!decoder.destroyed) decoder.destroy();
    };

    decodedStream.on('error', (err) => {
      console.error(`[Decoder Error][${speakerName}]`, err);
      cleanup();
    });

    opusStream.on('error', (err) => {
      console.error(`[OpusStream Error][${speakerName}]`, err);
      cleanup();
    });

    decodedStream.on('end', () => {
      cleanup();
      if (pcmChunks.length === 0) return;

      const pcmBuffer = Buffer.concat(pcmChunks);
      const durationMs = getPcmDurationMs(pcmBuffer);
      const rms = getPcmRms(pcmBuffer);

      if (
        durationMs < MIN_AUDIO_DURATION_MS ||
        durationMs > MAX_AUDIO_DURATION_MS ||
        rms < MIN_AUDIO_RMS
      ) {
        return;
      }

      const mono16k = downsample48kStereoTo16kMono(pcmBuffer);
      const wavBuffer = pcmToWav(mono16k, 16000, 1, 16);

      // Serialize AI generation + playback per guild so responses don't collide
      session.processingQueue = session.processingQueue
        .then(async () => {
          if (!sessions.has(guild.id)) return;

          const t0 = Date.now();
          console.log(
            `[Voice] Heard ${speakerName} (${Math.round(durationMs)}ms, RMS=${Math.round(rms)})`
          );

          const reply = await generateVoiceReply(guild.id, speakerName, wavBuffer);
          if (!reply) {
            console.log(`[Voice] Ignored silence/noise from ${speakerName}`);
            return;
          }

          console.log(`[Minza -> ${speakerName}] (${Date.now() - t0}ms): ${reply}`);

          if (session.textChannel && 'send' in session.textChannel) {
            session.textChannel.send(`**มินซ่า:** ${reply}`).catch(() => {});
          }

          await speakInChannel(guild.id, reply);
        })
        .catch((err) => {
          console.error('[Voice Processing Error]', err);
        });
    });
  });
}
