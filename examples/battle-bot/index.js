/**
 * Junie battle-bot — a complete discord.js music bot in one file.
 *
 * Commands (slash):
 *   /play <query>     join voice + search + queue + play
 *   /skip             skip the current track
 *   /queue            show the queue
 *   /filters nightcore|bassboost|vaporwave|off
 *   /volume <0-150>   set volume
 *   /migrate <node>   move the player to another node (live migration)
 *   /nodes            node status + load
 *   /disconnect       leave voice
 *
 * Environment:
 *   DISCORD_TOKEN  bot token
 *   NODE_A_URL / NODE_A_AUTH / NODE_B_URL / NODE_B_AUTH   node config
 *
 * This file is intentionally dependency-light: discord.js + junie only.
 */

import { Client, GatewayIntentBits, Events, SlashCommandBuilder, REST, Routes } from 'discord.js';
import { Junie } from 'junie';

const NODES = [
  {
    id: 'node-a',
    host: process.env.NODE_A_HOST ?? 'localhost',
    port: Number(process.env.NODE_A_PORT ?? 2333),
    authorization: process.env.NODE_A_AUTH ?? 'youshallnotpass',
    regions: ['europe'],
  },
  ...(process.env.NODE_B_HOST || process.env.NODE_B_AUTH
    ? [{
        id: 'node-b',
        host: process.env.NODE_B_HOST,
        port: Number(process.env.NODE_B_PORT ?? 2333),
        authorization: process.env.NODE_B_AUTH ?? 'youshallnotpass',
        regions: ['us'],
      }]
    : []),
];

// --- Junie wiring (works with any Discord library — this is the whole glue) ---

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const junie = new Junie({
  nodes: NODES,
  clientName: `battle-bot/1.0.0 (Junie)`,
  sendToShard: (guildId, payload) => {
    const guild = client.guilds.cache.get(guildId);
    if (guild) guild.shard.send(payload);
  },
});

client.once(Events.ClientReady, async (ready) => {
  junie.init(ready.user.id);
  await registerCommands(ready.user.id);
  console.log(`[bot] logged in as ${ready.user.tag} — ${NODES.length} node(s) configured.`);
});

client.on(Events.Raw, (packet) => junie.sendRawData(packet));

junie.on('nodeConnect', (node) => console.log(`[junie] node ${node.id} connected (Lavalink ${node.lavalinkVersion}).`));
junie.on('nodeDisconnect', (node, info) => console.log(`[junie] node ${node.id} disconnected (${info.code}).`));
junie.on('nodeResumed', (node) => console.log(`[junie] node ${node.id} resumed its session.`));
junie.on('trackStart', (player, track) => console.log(`[junie] ${track.title} started in guild ${player.guildId}.`));
junie.on('queueEnd', (player) => {
  const channel = client.channels.cache.get(player.textChannelId ?? '');
  if (channel?.isTextBased()) channel.send('Queue finished. Add more with /play!').catch(() => undefined);
});

// --- commands ----------------------------------------------------------------

const commands = [
  new SlashCommandBuilder().setName('play')
    .setDescription('Play a track or playlist')
    .addStringOption((o) => o.setName('query').setDescription('Search text or URL').setRequired(true)),
  new SlashCommandBuilder().setName('skip').setDescription('Skip the current track'),
  new SlashCommandBuilder().setName('queue').setDescription('Show the queue'),
  new SlashCommandBuilder().setName('volume')
    .setDescription('Set volume')
    .addIntegerOption((o) => o.setName('value').setDescription('0-150').setRequired(true)),
  new SlashCommandBuilder().setName('filters')
    .setDescription('Toggle a preset')
    .addStringOption((o) => o.setName('preset')
      .addChoices(
        { name: 'nightcore', value: 'nightcore' },
        { name: 'bassboost', value: 'bassboost' },
        { name: 'vaporwave', value: 'vaporwave' },
        { name: 'off', value: 'off' },
      )
      .setRequired(true)),
  new SlashCommandBuilder().setName('migrate')
    .setDescription('Move the player to another node')
    .addStringOption((o) => o.setName('node').setDescription('Node id').setRequired(true)),
  new SlashCommandBuilder().setName('nodes').setDescription('Show node status'),
  new SlashCommandBuilder().setName('disconnect').setDescription('Leave voice'),
].map((command) => command.toJSON());

async function registerCommands(botUserId) {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(botUserId), { body: commands });
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    switch (interaction.commandName) {
      case 'play': {
        const voice = interaction.member?.voice?.channel;
        if (!voice) {
          await interaction.reply({ content: 'Join a voice channel first.', ephemeral: true });
          return;
        }
        const player = junie.createPlayer({
          guildId: interaction.guildId,
          voiceChannelId: voice.id,
          textChannelId: interaction.channelId,
        });
        await player.connect();

        const query = interaction.options.getString('query', true);
        const result = await junie.search(query, interaction.user);
        if (result.isEmpty) {
          await interaction.reply({ content: 'Nothing found.', ephemeral: true });
          return;
        }
        player.queue.add(result.tracks);
        if (!player.playing) await player.play();

        const first = result.tracks[0];
        await interaction.reply(
          result.playlist
            ? `Queued **${result.tracks.length}** tracks from **${result.playlist.name}**.`
            : `Now playing **${first.title}** \`[${junie.utils.formatDuration(first.length)}]\``,
        );
        break;
      }
      case 'skip': {
        const player = junie.getPlayer(interaction.guildId);
        if (!player) return void await interaction.reply({ content: 'Not playing.', ephemeral: true });
        await player.skip();
        await interaction.reply('Skipped.');
        break;
      }
      case 'queue': {
        const player = junie.getPlayer(interaction.guildId);
        if (!player || player.queue.size === 0) {
          await interaction.reply('Queue is empty.');
          return;
        }
        const lines = player.queue.tracks
          .slice(0, 15)
          .map((track, index) => `${index + 1}. **${track.title}** (${junie.utils.formatDuration(track.length)})`);
        await interaction.reply(lines.join('\n'));
        break;
      }
      case 'volume': {
        const player = junie.getPlayer(interaction.guildId);
        if (!player) return void await interaction.reply({ content: 'Not playing.', ephemeral: true });
        await player.setVolume(interaction.options.getInteger('value', true));
        await interaction.reply(`Volume set to ${player.volume}.`);
        break;
      }
      case 'filters': {
        const player = junie.getPlayer(interaction.guildId);
        if (!player) return void await interaction.reply({ content: 'Not playing.', ephemeral: true });
        const preset = interaction.options.getString('preset', true);
        if (preset === 'off') player.filters.clear();
        else player.filters[preset]();
        await player.filters.apply();
        await interaction.reply(`Filters: **${preset}**.`);
        break;
      }
      case 'migrate': {
        const player = junie.getPlayer(interaction.guildId);
        if (!player) return void await interaction.reply({ content: 'No player.', ephemeral: true });
        const nodeId = interaction.options.getString('node', true);
        await player.setNode(nodeId);
        await interaction.reply(`Player migrated to **${nodeId}** — playback continues.`);
        break;
      }
      case 'nodes': {
        const lines = junie.nodes.list().map((node) => {
          const state = node.connected ? '🟢' : '🔴';
          const penalty = node.stats ? node.penalty().toFixed(0) : 'n/a';
          return `${state} **${node.id}** — ${node.stats?.playingPlayers ?? 0} playing, penalty ${penalty}`;
        });
        await interaction.reply(lines.join('\n'));
        break;
      }
      case 'disconnect': {
        await junie.destroyPlayer(interaction.guildId, 'command');
        await interaction.reply('Left voice.');
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error('[bot] command error:', error);
    if (!interaction.replied) {
      await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true }).catch(() => undefined);
    }
  }
});

// --- shutdown hygiene ---------------------------------------------------------

process.on('SIGINT', async () => {
  console.log('[bot] shutting down...');
  await junie.destroy();
  await client.destroy();
  process.exit(0);
});

if (!process.env.DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN — copy .env.example to .env and fill it in.');
  console.error('Run `npm run dry` to validate the Junie wiring without Discord.');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
