# Junie × discord.js — example bot

A complete, production-shaped music bot: play, skip, pause, queue views, volume, seek,
autoplay, and one-line filters.

## Run it

```bash
# 1. Install dependencies (junie resolves to the local package in this repo)
npm install

# 2. Start a Lavalink v4 server
docker run -d --name lavalink -p 2333:2333 \
  ghcr.io/lavalink-devs/lavalink:4 --port 2333 --password youshallnotpass

# 3. Configure & launch
export DISCORD_TOKEN=your-bot-token
export DISCORD_APP_ID=your-application-id      # for slash command registration
export LAVALINK_HOST=localhost
export LAVALINK_PORT=2333
export LAVALINK_PASSWORD=youshallnotpass

npm start
```

> Slash commands are registered automatically on boot (global commands — available after
> Discord propagates them, usually under a minute). For instant guild-only commands during
> development, swap `Routes.applicationCommands(appId)` for
> `Routes.applicationGuildCommands(appId, guildId)` in `bot.js`.

## What to look at

| Concern | Where |
|---|---|
| Client construction + `sendToShard` | top of `bot.js` |
| **Raw voice packet forwarding** (the one critical line) | `client.on(Events.Raw, …)` |
| Creating & connecting a player | `/play` handler |
| Search with requester typing | `/play` handler |
| Queue manipulation | `/play`, `/skip`, `/queue` |
| The fluent filter API | `/nightcore` & friends — one chain, one REST call |
| Graceful shutdown | `shutdown()` |

## Commands

`/play`, `/skip [n]`, `/stop`, `/pause`, `/resume`, `/queue`, `/nowplaying`,
`/volume <0-1000>`, `/seek <mm:ss>`, `/autoplay`, `/nightcore`, `/vaporwave`,
`/bassboost`, `/karaoke`, `/eightd`, `/normal`, `/leave`.
