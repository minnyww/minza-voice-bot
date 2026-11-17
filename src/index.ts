import { Client, Events, GatewayIntentBits } from 'discord.js';
import { config } from './config.js';
import {
  handlePrefixMessage,
  handleSlashCommand,
  slashCommands,
} from './commands/handlers.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`🤖 มินซ่าออนไลน์แล้ว! Logged in as ${readyClient.user.tag}`);

  try {
    await readyClient.application.commands.set(
      slashCommands.map((cmd) => cmd.toJSON())
    );
    console.log('✅ Registered slash commands (/join, /leave, /ask, /reset)');
  } catch (err) {
    console.warn('⚠️ Failed to register slash commands:', err);
  }
});

client.on(Events.MessageCreate, (message) => {
  handlePrefixMessage(message).catch((err) => {
    console.error('[MessageCreate Error]', err);
  });
});

client.on(Events.InteractionCreate, (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  handleSlashCommand(interaction).catch((err) => {
    console.error('[InteractionCreate Error]', err);
  });
});

client.login(config.discordToken).catch((err) => {
  console.error('❌ Failed to login to Discord:', err);
  process.exit(1);
});
