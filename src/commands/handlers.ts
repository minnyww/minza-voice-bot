import {
  ChatInputCommandInteraction,
  GuildMember,
  Message,
  SlashCommandBuilder,
} from 'discord.js';
import { clearGuildHistory, generateTextReply } from '../ai/gemini.js';
import { config } from '../config.js';
import { getSession, joinChannel, leaveChannel, speakInChannel } from '../voice/voiceManager.js';

export const slashCommands = [
  new SlashCommandBuilder()
    .setName('join')
    .setDescription('เรียกมินซ่าเข้าห้องเสียง (Voice Channel) เพื่อคุยโต้ตอบ'),
  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('ให้มินซ่าออกจากห้องเสียง'),
  new SlashCommandBuilder()
    .setName('reset')
    .setDescription('ล้างความจำบทสนทนาของมินซ่าในเซิร์ฟเวอร์นี้'),
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('พิมพ์คุยกับมินซ่า (ถ้าอยู่ในห้องเสียง มินซ่าจะพูดตอบด้วย)')
    .addStringOption((opt) =>
      opt.setName('message').setDescription('ข้อความที่อยากคุยกับมินซ่า').setRequired(true)
    ),
];

export async function handleSlashCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({ content: 'คำสั่งนี้ใช้ได้เฉพาะในเซิร์ฟเวอร์นะ!', ephemeral: true });
    return;
  }

  const member = interaction.member as GuildMember;
  const guildId = interaction.guild.id;

  switch (interaction.commandName) {
    case 'join': {
      const voiceChannel = member.voice.channel;
      if (!voiceChannel) {
        await interaction.reply({
          content: 'เข้าไปใน Voice Channel ก่อนสิ เดี๋ยวมินซ่าตามเข้าไป!',
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply();
      await joinChannel(voiceChannel, interaction.channel ?? undefined);
      await interaction.editReply(
        `เข้ามาในห้อง **${voiceChannel.name}** แล้วจ้า! เปิดไมค์คุยกับมินซ่าได้เลย`
      );
      await speakInChannel(
        guildId,
        'ฮัลโหล! มินซ่ามาแล้วจ้า วันนี้มีโปรเจกต์ AI หรือ Frontend อะไรน่าตื่นเต้นมาเม้าท์กันไหม!'
      );
      break;
    }

    case 'leave': {
      const left = leaveChannel(guildId);
      await interaction.reply(
        left ? 'โอเค มินซ่าออกห้องก่อนนะ ไว้มาคุยกันใหม่!' : 'ตอนนี้มินซ่าไม่ได้อยู่ในห้องเสียงนะ'
      );
      break;
    }

    case 'reset': {
      clearGuildHistory(guildId);
      await interaction.reply('รีเซ็ตความจำเรียบร้อย! เหมือนเพิ่งเปิด Context Window ใหม่เลย');
      break;
    }

    case 'ask': {
      const message = interaction.options.getString('message', true);
      await interaction.deferReply();
      const reply = await generateTextReply(guildId, member.displayName, message);
      await interaction.editReply(`**มินซ่า:** ${reply}`);

      if (getSession(guildId)) {
        await speakInChannel(guildId, reply);
      }
      break;
    }
  }
}

export async function handlePrefixMessage(message: Message): Promise<void> {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(config.commandPrefix)) return;

  const withoutPrefix = message.content.slice(config.commandPrefix.length).trim();
  if (!withoutPrefix) return;

  const [rawCommand, ...args] = withoutPrefix.split(/\s+/);
  const command = rawCommand.toLowerCase();
  const guildId = message.guild.id;
  const speakerName = message.member?.displayName || message.author.username;

  if (command === 'join') {
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
      await message.reply('เข้าไปใน Voice Channel ก่อนสิ เดี๋ยวมินซ่าตามเข้าไป!');
      return;
    }

    await joinChannel(voiceChannel, message.channel);
    await message.reply(
      `เข้ามาในห้อง **${voiceChannel.name}** แล้วจ้า! เปิดไมค์คุยกับมินซ่าได้เลย`
    );
    await speakInChannel(
      guildId,
      'ฮัลโหล! มินซ่ามาแล้วจ้า วันนี้มีโปรเจกต์ AI หรือ Frontend อะไรน่าตื่นเต้นมาเม้าท์กันไหม!'
    );
    return;
  }

  if (command === 'leave') {
    const left = leaveChannel(guildId);
    await message.reply(
      left ? 'โอเค มินซ่าออกห้องก่อนนะ ไว้มาคุยกันใหม่!' : 'ตอนนี้มินซ่าไม่ได้อยู่ในห้องเสียงนะ'
    );
    return;
  }

  if (command === 'reset') {
    clearGuildHistory(guildId);
    await message.reply('รีเซ็ตความจำเรียบร้อย! เหมือนเพิ่งเปิด Context Window ใหม่เลย');
    return;
  }

  if (command === 'ask') {
    const prompt = args.join(' ').trim();
    if (!prompt) {
      await message.reply(`พิมพ์คำถามต่อท้ายด้วยนะ เช่น \`${config.commandPrefix}ask React 19 มีอะไรใหม่\``);
      return;
    }

    const reply = await generateTextReply(guildId, speakerName, prompt);
    await message.reply(`**มินซ่า:** ${reply}`);

    if (getSession(guildId)) {
      await speakInChannel(guildId, reply);
    }
    return;
  }

  if (command === 'help') {
    const p = config.commandPrefix;
    await message.reply(
      [
        '**คำสั่งของมินซ่า (Minza Voice Bot)**',
        `• \`${p}join\` หรือ \`/join\` — เรียกมินซ่าเข้า Voice Channel`,
        `• \`${p}leave\` หรือ \`/leave\` — ให้มินซ่าออกจาก Voice Channel`,
        `• \`${p}ask <ข้อความ>\` หรือ \`/ask\` — พิมพ์คุยกับมินซ่า`,
        `• \`${p}reset\` หรือ \`/reset\` — ล้างความจำบทสนทนา`,
      ].join('\n')
    );
  }
}
