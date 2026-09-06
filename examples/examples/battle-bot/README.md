# Junie battle-bot

A complete, runnable discord.js music bot built on **Junie** — and the
installability proof: its only audio dependency is the Junie package itself
(`file:../..`, which packages identically to the published tarball).

## Setup

```bash
cp .env.example .env       # fill in your bot token + Lavalink nodes
npm install
npm run dry                # validate the install WITHOUT Discord (no token needed)
npm start                  # run the bot for real
```

## Commands

| Command | What it does |
|---|---|
| `/play <query>` | joins your voice channel, searches, queues, plays |
| `/skip` | skips the current track |
| `/queue` | lists the queue |
| `/volume <0-150>` | sets player volume |
| `/filters <preset>` | nightcore / bassboost / vaporwave / off |
| `/migrate <node>` | **live player migration** between nodes (zero gap) |
| `/nodes` | node status: connectivity, playing players, penalty score |
| `/disconnect` | leaves voice |

## What this example demonstrates

- **The entire Discord glue is two functions** — `sendToShard` and
  `client.on('raw', ...)`. That's Junie's whole library-agnostic contract.
- Requester typing flows end-to-end (`junie.search(query, interaction.user)`).
- Node failover needs zero code: kill a node and the player migrates by itself.
- Clean shutdown on SIGINT (`junie.destroy()`).

## Requirements

- Node ≥ 18.17
- One or two Lavalink v4 servers (see `../../docs/getting-started.md`)
- A Discord application with the `applications.commands` scope
