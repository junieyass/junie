/**
 * Junie × discord.js v14 — a complete, runnable music bot.
 *
 * Setup:
 *   1. npm install discord.js junie
 *   2. Run a Lavalink v4 server (see https://lavalink.dev / docs/getting-started.md)
 *   3. DISCORD_TOKEN=… LAVALINK_PASSWORD=… node bot.js
 *
 * Commands (slash):
 *   /play <query>   — join voice and play / queue
 *   /skip [n]       — skip the current (or Nth-next) track
 *   /stop           — stop playback (queue is kept; /play resumes)
 *   /pause /resume  — obvious
 *   /queue          — show the queue
 *   /nowplaying     — current track with a progress bar
 *   /volume <0-1000>— set volume
 *   /seek <mm:ss>   — seek
 *   /autoplay       — toggle endless autoplay
 *   /nightcore /vaporwave /bassboost /karaoke /eightd /normal — filters
 *   /leave          — leave voice
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  SlashCommandBuilder,
  REST,
  Routes,
  Events,
  InteractionType,
  EmbedBuilder,
} from 'discord.js';
import { Junie } from 'junie';

const TOKEN = process.env.DISCORD_TOKEN ?? 'your-bot-token';
const LAVALINK = {
  id: 'main',
  host: process.env.LAVALINK_HOST ?? 'localhost',
  port: Number(process.env.LAVALINK_PORT ?? 2333),
  authorization: process.env.LAVALINK_PASSWORD ?? 'youshallnotpass',
};

// ---------------------------------------------------------------------------
// Discord client
// ---------------------------------------------------------------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Channel],
});

// ---------------------------------------------------------------------------
// Junie — the Lavalink client
// ---------------------------------------------------------------------------

const junie = new Junie({
  nodes: [LAVALINK],
  sendToShard: (guildId, payload) => {
    const guild = client.guilds.cache.get(guildId);
    if (guild) guild.shard.send(payload);
  },
  defaultSearchSource: 'youtube',
  logLevel: 'info',
});

client.once(Events.ClientReady, () => {
  console.log(`💬 Logged in as ${client.user.tag}`);
  junie.init(client.user.id);
  console.log('🎵 Junie is connecting to Lavalink…');
});

// The critical line: forward raw voice packets.
client.on(Events.Raw, (packet) => junie.sendRawData(packet));

// ---------------------------------------------------------------------------
// Player events
// ---------------------------------------------------------------------------

junie.on('nodeConnect', (node) => console.log(`✅ Node ${node.id} connected (${node.sessionId}).`));
junie.on('nodeError', (node, error) => console.error(`❌ Node ${node.id} error: ${error.message}`));

junie.on('playerCreate', (player) => console.log(`➕ Player ${player.guildId} created.`));

junie.on('trackStart', (player, track) => {
  const channel = client.channels.cache.get(player.textChannelId ?? '');
  if (!channel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎶 Now playing')
    .setDescription(`**${track.title}**\n${track.author}`)
    .addFields(
      { name: 'Duration', value: junie.utils.formatDuration(track.length, track.isStream), inline: true },
      { name: 'Requested by', value: track.requester ? `<@${track.requester.id}>` : 'unknown', inline: true },
    )
    .setThumbnail(track.artworkUrl ?? null)
    .setFooter({ text: `Node ${player.node.id} · volume ${player.volume}%` });

  void channel.send({ embeds: [embed] }).catch(() => undefined);
});

junie.on('trackEnd', (player, track, reason) => {
  if (reason === 'loadFailed') {
    const channel = client.channels.cache.get(player.textChannelId ?? '');
    void channel?.send(`⚠️ Skipped **${track.title}** — it failed to load.`).catch(() => undefined);
  }
});

junie.on('queueEnd', (player) => {
  const channel = client.channels.cache.get(player.textChannelId ?? '');
  void channel?.send('Queue finished. Add more with `/play`, or enable `/autoplay`. 👋')
    .catch(() => undefined);
  // This example keeps the player around; use player.destroy() to leave instead.
});

// ---------------------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------------------

const commands = [
  new SlashCommandBuilder().setName('play')
    .setDescription('Play a song or add it to the queue')
    .addStringOption((o) => o.setName('query').setDescription('Song name or URL').setRequired(true)),
  new SlashCommandBuilder().setName('skip').setDescription('Skip the current track')
    .addIntegerOption((o) => o.setName('count').setDescription('How many tracks to skip').setMinValue(1)),
  new SlashCommandBuilder().setName('stop').setDescription('Stop playback (queue is kept)'),
  new SlashCommandBuilder().setName('pause').setDescription('Pause playback'),
  new SlashCommandBuilder().setName('resume').setDescription('Resume playback'),
  new SlashCommandBuilder().setName('queue').setDescription('Show the queue'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Show the current track'),
  new SlashCommandBuilder().setName('volume').setDescription('Set volume (0-1000)')
    .addIntegerOption((o) => o.setName('value').setDescription('0–1000').setRequired(true).setMinValue(0).setMaxValue(1000)),
  new SlashCommandBuilder().setName('seek').setDescription('Seek to a position')
    .addStringOption((o) => o.setName('position').setDescription('mm:ss or h:mm:ss').setRequired(true)),
  new SlashCommandBuilder().setName('autoplay').setDescription('Toggle autoplay'),
  new SlashCommandBuilder().setName('nightcore').setDescription('Nightcore mode'),
  new SlashCommandBuilder().setName('vaporwave').setDescription('Vaporwave mode'),
  new SlashCommandBuilder().setName('bassboost').setDescription('Bass boost'),
  new SlashCommandBuilder().setName('karaoke').setDescription('Remove vocals'),
  new SlashCommandBuilder().setName('eightd').setDescription('8D audio'),
  new SlashCommandBuilder().setName('normal').setDescription('Remove all filters'),
  new SlashCommandBuilder().setName('leave').setDescription('Leave the voice channel'),
].map((command) => command.toJSON());

const rest = new REST().setToken(TOKEN);
try {
  console.log(' registering slash commands…');
  await rest.put(Routes.applicationCommands(process.env.DISCORD_APP_ID ?? 'your-app-id'), { body: commands });
  console.log('✅ Slash commands registered. (Set DISCORD_APP_ID to your application id.)');
} catch (error) {
  console.error('Slash command registration failed:', error);
}

// ---------------------------------------------------------------------------
// Command handling
// ---------------------------------------------------------------------------

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.type !== InteractionType.ApplicationCommand) return;
  if (!interaction.inCachedGuild()) return;

  const { commandName } = interaction;
  const member = interaction.member;

  try {
    switch (commandName) {
      case 'play': {
        const query = interaction.options.getString('query', true);
        const voiceChannel = member.voice.channel;
        if (!voiceChannel) {
          await interaction.reply({ content: 'Join a voice channel first. 🎧', ephemeral: true });
          return;
        }

        await interaction.deferReply();

        const player = junie.createPlayer({
          guildId: interaction.guildId,
          voiceChannelId: voiceChannel.id,
          textChannelId: interaction.channelId,
        });
        if (!player.connected) await player.connect();

        const result = await junie.search(query, interaction.user);
        if (result.isEmpty) {
          await interaction.editReply(`Nothing found for **${query}**. 😢`);
          return;
        }

        const tracks = result.playlist
          ? result.playlist.tracks
          : result.tracks;

        player.queue.add(tracks);
        if (!player.playing) await player.play();

        const description = result.playlist
          ? `**${result.playlist.name}** — ${tracks.length} tracks`
          : `**${tracks[0]?.title}** — ${tracks[0]?.author}`;

        await interaction.editReply(`➕ Added ${description}`);
        return;
      }

      case 'skip': {
        const player = junie.getPlayer(interaction.guildId);
        if (!player?.playing) {
          await interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
          return;
        }
        const count = interaction.options.getInteger('count') ?? 1;
        const current = player.queue.current;
        await player.skip(count);
        await interaction.reply(`⏭️ Skipped **${current?.title ?? 'track'}**.`);
        return;
      }

      case 'stop': {
        const player = junie.getPlayer(interaction.guildId);
        if (!player) return void await interaction.reply({ content: 'No player.', ephemeral: true });
        await player.stop();
        await interaction.reply('⏹️ Stopped. The queue is kept — `/play` to resume.');
        return;
      }

      case 'pause': {
        const player = junie.requirePlayer(interaction.guildId);
        await player.pause();
        await interaction.reply('⏸️ Paused.');
        return;
      }

      case 'resume': {
        const player = junie.requirePlayer(interaction.guildId);
        await player.resume();
        await interaction.reply('▶️ Resumed.');
        return;
      }

      case 'queue': {
        const player = junie.getPlayer(interaction.guildId);
        if (!player || (player.queue.isEmpty && !player.queue.current)) {
          await interaction.reply('The queue is empty.');
          return;
        }

        const upcoming = player.queue.tracks.slice(0, 10).map((track, index) =>
          `\`${index + 1}.\` **${track.title}** — ${track.author}`,
        );
        const more = player.queue.size > 10 ? `\n…and ${player.queue.size - 10} more` : '';

        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('📋 Queue')
          .setDescription(
            (player.queue.current ? `**Now:** ${player.queue.current.title}\n\n` : '') +
            (upcoming.join('\n') || '*nothing upcoming*') + more,
          )
          .setFooter({ text: `${player.queue.size} tracks · ${junie.utils.formatDuration(player.queue.totalDuration)} total · repeat: ${player.queue.repeatMode}` });

        await interaction.reply({ embeds: [embed] });
        return;
      }

      case 'nowplaying': {
        const player = junie.getPlayer(interaction.guildId);
        const track = player?.queue.current;
        if (!player || !track) {
          await interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
          return;
        }
        const bar = track.isStream ? '🔴 LIVE' : progressBar(player.position, track.length);
        await interaction.reply(`🎶 **${track.title}** — ${track.author}\n${bar}`);
        return;
      }

      case 'volume': {
        const player = junie.requirePlayer(interaction.guildId);
        await player.setVolume(interaction.options.getInteger('value', true));
        await interaction.reply(`🔊 Volume set to **${player.volume}%**.`);
        return;
      }

      case 'seek': {
        const player = junie.requirePlayer(interaction.guildId);
        const [mm, ss] = interaction.options.getString('position', true).split(':').map(Number);
        const ms = ss === undefined ? mm * 1000 : (mm * 60 + ss) * 1000;
        await player.seek(ms);
        await interaction.reply(`⏩ Seeked to **${junie.utils.formatDuration(ms)}**.`);
        return;
      }

      case 'autoplay': {
        const player = junie.requirePlayer(interaction.guildId);
        player.setAutoplay(!player.autoplay);
        await interaction.reply(`♾️ Autoplay is now **${player.autoplay ? 'ON' : 'OFF'}**.`);
        return;
      }

      case 'nightcore':
      case 'vaporwave':
      case 'bassboost':
      case 'karaoke':
      case 'eightd': {
        const player = junie.requirePlayer(interaction.guildId);
        // One fluent chain, one REST round trip:
        await player.filters[commandName]().apply();
        await interaction.reply(`🎛️ **${commandName}** enabled.`);
        return;
      }

      case 'normal': {
        const player = junie.requirePlayer(interaction.guildId);
        await player.filters.clear();
        await interaction.reply('🎛️ Filters cleared.');
        return;
      }

      case 'leave': {
        const player = junie.getPlayer(interaction.guildId);
        if (!player) return void await interaction.reply({ content: 'No player.', ephemeral: true });
        await player.destroy('leave-command');
        await interaction.reply('👋 Left voice.');
        return;
      }
    }
  } catch (error) {
    console.error('Command error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
  }
});

function progressBar(position, total) {
  const blocks = 20;
  const filled = total > 0 ? Math.round((position / total) * blocks) : 0;
  return `\`${'▬'.repeat(filled)}${'▭'.repeat(blocks - filled)}\` ` +
    `${junie.utils.formatDuration(position)} / ${junie.utils.formatDuration(total)}`;
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function shutdown() {
  console.log('\n👋 Shutting down…');
  await junie.destroy();
  await client.destroy();
  process.exit(0);
}

client.login(TOKEN);
