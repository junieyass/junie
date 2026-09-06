/**
 * FakeLavalink — a faithful, dependency-light Lavalink v4 server for
 * battle-testing Junie over a REAL network stack (TCP, HTTP, WebSocket).
 *
 * Implements:
 * - REST v4: /version, /info, /loadtracks, /decode (GET+POST), /stats,
 *   /sessions/{id} (PATCH), /sessions/{id}/players/{gid} (GET/PATCH/DELETE),
 *   Authorization header enforcement, structured error bodies.
 * - WebSocket /v4/websocket: handshake headers (Authorization, User-Id,
 *   Client-Name, Session-Id), ready/resume, voiceUpdate, playerUpdate
 *   broadcasting, Track(Start|End)Event dispatch, periodic stats.
 * - Failure injection: killSockets() (network partition — abnormal close,
 *   session store kept for resume), stop() (full server death).
 *
 * Deterministic by design: tracks are generated from the identifier, track
 * end events are triggered manually via finishCurrentTrack() rather than
 * wall-clock playback, so e2e assertions never race.
 */

import http from 'node:http';
import { WebSocketServer } from 'ws';

let trackCounter = 0;

/** Deterministic APITrack factory (mirrors Lavalink's track shape). */
function makeTrack(title) {
  trackCounter += 1;
  const id = String(trackCounter);
  return {
    encoded: `QAAA${Buffer.from(`junie-${id}-${title}`).toString('base64')}`,
    info: {
      identifier: `id-${id}`,
      isSeekable: true,
      author: 'Junie e2e',
      length: 120_000,
      isStream: false,
      position: 0,
      title,
      uri: `https://example.com/tracks/${id}`,
      artworkUrl: null,
      isrc: null,
      sourceName: 'youtube',
    },
    pluginInfo: {},
    userData: {},
  };
}

/** Map a loadtracks identifier to deterministic results. */
function loadIdentifier(identifier) {
  const clean = identifier
    .replace(/^(ytsearch|ytmsearch|scsearch):/, '')
    .trim();
  if (clean.length === 0) {
    return { loadType: 'empty', data: {} };
  }
  // "fail" queries simulate upstream source errors.
  if (clean.toLowerCase() === 'fail') {
    return {
      loadType: 'error',
      data: { message: 'Something went wrong', severity: 'common', cause: 'e2e' },
    };
  }
  const tracks = [1, 2, 3].map((i) => makeTrack(`${clean} #${i}`));
  return {
    loadType: 'search',
    playlistInfo: { name: '', selectedTrack: -1 },
    data: tracks,
  };
}

export class FakeLavalink {
  /**
   * @param {object} options
   * @param {number} options.port
   * @param {string} [options.password]
   * @param {string} [options.version] reported by GET /version
   * @param {number} [options.statsIntervalMs]
   */
  constructor(options = {}) {
    this.port = options.port ?? 0;
    this.password = options.password ?? 'youshallnotpass';
    this.version = options.version ?? '4.0.8';
    this.statsIntervalMs = options.statsIntervalMs ?? 400;
    this.startedAt = 0;

    /** sessionId -> { resuming, timeout, players: Map, voice: Map } */
    this.sessions = new Map();
    /** All REST requests seen: { method, url, body, authed } */
    this.requestLog = [];
    /** WS messages received from clients: { sessionId, payload } */
    this.received = [];

    this.http = null;
    this.wss = null;
    this.clients = new Set();
    this.statsTimer = null;
    this.sessionCounter = 0;
    this.pendingStarts = new Map(); // guildId -> timeout
    this.listening = false;
  }

  // -------------------------------------------------------------------------

  /** Boot the server. Returns the bound port. */
  async start() {
    this.startedAt = Date.now();
    await new Promise((resolve, reject) => {
      this.http = http.createServer((req, res) => this.handleRest(req, res));
      this.http.on('error', reject);
      this.http.listen(this.port, '127.0.0.1', () => {
        this.port = this.http.address().port;
        resolve(undefined);
      });
    });

    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', (socket, request) => this.onConnection(socket, request));

    this.http.on('upgrade', (request, socket, head) => {
      const { pathname } = new URL(request.url, 'http://localhost');
      if (pathname !== '/v4/websocket') {
        socket.destroy();
        return;
      }
      if (request.headers.authorization !== this.password) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit('connection', ws, request);
      });
    });

    this.statsTimer = setInterval(() => this.broadcastStats(), this.statsIntervalMs);
    this.listening = true;
    return this.port;
  }

  /** Abnormal WS death (network partition). REST + sessions stay alive. */
  killSockets() {
    for (const client of this.clients) {
      client.socket.terminate();
    }
    this.clients.clear();
  }

  /** Full death: WS + REST gone. start() brings it back (sessions kept). */
  async stop() {
    this.listening = false;
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
    for (const client of this.clients) client.socket.terminate();
    this.clients.clear();
    for (const timer of this.pendingStarts.values()) clearTimeout(timer);
    this.pendingStarts.clear();
    await new Promise((resolve) => {
      if (!this.http) return resolve(undefined);
      this.wss?.close();
      this.http.close(() => resolve(undefined));
    });
  }

  // -- inspection helpers ----------------------------------------------------

  authedRequests() {
    return this.requestLog.filter((entry) => entry.authed);
  }

  findRequests(method, urlPart) {
    return this.requestLog.filter(
      (entry) => entry.method === method && entry.url.includes(urlPart),
    );
  }

  voiceUpdates() {
    return this.received.filter((entry) => entry.payload.op === 'voiceUpdate');
  }

  players(sessionId) {
    return this.sessions.get(sessionId)?.players ?? new Map();
  }

  /** Emit a TrackEndEvent for the guild's current track (deterministic). */
  finishCurrentTrack(sessionId, guildId, reason = 'finished') {
    const session = this.sessions.get(sessionId);
    const player = session?.players.get(guildId);
    if (!player) return;
    this.sendToSession(sessionId, {
      op: 'event',
      type: 'TrackEndEvent',
      guildId,
      track: player.track,
      reason,
    });
    player.track = null;
  }

  // -- REST ------------------------------------------------------------------

  handleRest(req, res) {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : '';
      const authed = req.headers.authorization === this.password;
      this.requestLog.push({
        method: req.method,
        url: req.url,
        body: body ? tryParse(body) : undefined,
        authed,
      });

      if (!authed) {
        respondJson(res, 401, { status: 401, error: 'Unauthorized', message: 'Invalid password.' });
        return;
      }

      const { pathname, searchParams } = new URL(req.url, 'http://localhost');
      const send = (status, payload) => {
        if (payload === undefined) res.writeHead(status).end();
        else respondJson(res, status, payload);
      };

      // Root routes
      if (req.method === 'GET' && pathname === '/version') {
        res.writeHead(200, { 'content-type': 'text/plain' }).end(this.version);
        return;
      }

      // v4 routes
      const v4 = pathname.replace(/^\/v4/, '');
      if (v4 !== pathname || v4 === '') {
        if (this.handleV4(req, v4, searchParams, send)) return;
      }

      respondJson(res, 404, { status: 404, error: 'Not Found', message: `No route ${pathname}` });
    });
  }

  handleV4(req, pathname, searchParams, send) {
    // /info
    if (req.method === 'GET' && pathname === '/info') {
      send(200, {
        version: { semver: this.version, major: 4, minor: 0, patch: 8 },
        buildTime: this.startedAt,
        git: { commit: 'e2e', commitTime: this.startedAt },
        enabledSources: { youtube: true },
        plugins: [],
      });
      return true;
    }

    // /stats
    if (req.method === 'GET' && pathname === '/stats') {
      send(200, this.statsPayload());
      return true;
    }

    // /loadtracks
    if (req.method === 'GET' && pathname === '/loadtracks') {
      const identifier = searchParams.get('identifier') ?? '';
      const result = loadIdentifier(identifier);
      send(200, result);
      return true;
    }

    // /decode
    if (req.method === 'GET' && pathname === '/decode') {
      send(200, makeTrack(searchParams.get('encodedTrack') ?? 'unknown'));
      return true;
    }
    if (req.method === 'POST' && pathname === '/decode') {
      send(200, []);
      return true;
    }

    // /sessions/{sid}[/players[/{gid}]]
    const sessionMatch = pathname.match(/^\/sessions\/([^/]+)(\/players(?:\/([^/]+))?)?$/);
    if (sessionMatch) {
      const [, sessionId, playersPart, guildId] = sessionMatch;
      const session = this.sessions.get(sessionId);
      if (!session) {
        send(404, { status: 404, error: 'Not Found', message: 'Session not found' });
        return true;
      }

      if (!playersPart) {
        if (req.method === 'PATCH') {
          const body = this.lastRequestBody();
          if (body && typeof body.resuming === 'boolean') session.resuming = body.resuming;
          if (body && typeof body.timeout === 'number') session.timeout = body.timeout;
          send(200, { resuming: session.resuming, timeout: session.timeout });
          return true;
        }
        if (req.method === 'DELETE') {
          this.sessions.delete(sessionId);
          send(204);
          return true;
        }
        return false;
      }

      if (!guildId) {
        if (req.method === 'GET') {
          send(200, [...session.players.values()]);
          return true;
        }
        return false;
      }

      const player = session.players.get(guildId);
      if (req.method === 'GET') {
        if (!player) {
          send(404, { status: 404, error: 'Not Found', message: 'Player not found' });
          return true;
        }
        send(200, player);
        return true;
      }
      if (req.method === 'DELETE') {
        session.players.delete(guildId);
        send(204);
        return true;
      }
      if (req.method === 'PATCH') {
        const body = this.lastRequestBody();
        this.applyPlayerPatch(session, sessionId, guildId, body, searchParams);
        send(200, session.players.get(guildId));
        return true;
      }
    }

    return false;
  }

  applyPlayerPatch(session, sessionId, guildId, body, searchParams) {
    let player = session.players.get(guildId);
    if (!player) {
      player = { guildId, track: null, volume: 100, paused: false, position: 0, voice: null, filters: {} };
      session.players.set(guildId, player);
    }
    if (body?.voice) {
      player.voice = body.voice;
      // Voice arrived: acknowledge with a playerUpdate.
      this.sendToSession(sessionId, {
        op: 'playerUpdate',
        guildId,
        state: { time: Date.now(), position: player.position, connected: true, ping: 20 },
      });
    }
    const noReplace = searchParams.get('noReplace') === 'true';
    if (body?.track && body.track.encoded !== undefined && !noReplace) {
      player.track = body.track;
      if (body.position !== undefined) player.position = body.position;
      if (body.paused !== undefined) player.paused = body.paused;
      // Track set: confirm with a TrackStartEvent on the next tick.
      const timer = setTimeout(() => {
        this.pendingStarts.delete(guildId);
        if (player.track) {
          this.sendToSession(sessionId, {
            op: 'event',
            type: 'TrackStartEvent',
            guildId,
            track: player.track,
          });
        }
      }, 30);
      this.pendingStarts.set(guildId, timer);
    }
    if (body?.track === null) player.track = null;
    if (body?.paused !== undefined) player.paused = body.paused;
    if (body?.volume !== undefined) player.volume = body.volume;
    if (body?.position !== undefined) player.position = body.position;
    if (body?.filters) player.filters = body.filters;
  }

  lastRequestBody() {
    return this.requestLog[this.requestLog.length - 1]?.body;
  }

  // -- WebSocket -------------------------------------------------------------

  onConnection(socket, request) {
    const headers = request.headers;
    const claimed = headers['session-id'];
    let sessionId = null;
    let resumed = false;

    if (claimed && this.sessions.has(claimed)) {
      sessionId = claimed;
      resumed = true;
    } else {
      this.sessionCounter += 1;
      sessionId = `sess-${this.port}-${this.sessionCounter}`;
      this.sessions.set(sessionId, {
        resuming: false,
        timeout: 60,
        players: new Map(),
      });
    }

    const client = { socket, sessionId, userId: headers['user-id'], clientName: headers['client-name'] };
    this.clients.add(client);

    socket.send(JSON.stringify({ op: 'ready', resumed, sessionId }));

    socket.on('message', (data) => {
      let payload;
      try {
        payload = JSON.parse(String(data));
      } catch {
        return;
      }
      this.received.push({ sessionId, payload });

      if (payload.op === 'voiceUpdate') {
        const session = this.sessions.get(sessionId);
        if (session) {
          const player = session.players.get(payload.guildId) ?? {
            guildId: payload.guildId, track: null, volume: 100, paused: false, position: 0, voice: null, filters: {},
          };
          player.voice = payload.event;
          session.players.set(payload.guildId, player);
          this.sendToSession(sessionId, {
            op: 'playerUpdate',
            guildId: payload.guildId,
            state: { time: Date.now(), position: 0, connected: true, ping: 20 },
          });
        }
      }
    });

    socket.on('close', () => this.clients.delete(client));
    socket.on('error', () => this.clients.delete(client));
  }

  sendToSession(sessionId, payload) {
    for (const client of this.clients) {
      if (client.sessionId === sessionId && client.socket.readyState === 1) {
        client.socket.send(JSON.stringify(payload));
      }
    }
  }

  broadcastStats() {
    const payload = this.statsPayload();
    for (const client of this.clients) {
      if (client.socket.readyState === 1) {
        client.socket.send(JSON.stringify(payload));
      }
    }
  }

  statsPayload() {
    let players = 0;
    let playing = 0;
    for (const session of this.sessions.values()) {
      players += session.players.size;
      for (const player of session.players.values()) {
        if (player.track && !player.paused) playing += 1;
      }
    }
    return {
      op: 'stats',
      players,
      playingPlayers: playing,
      uptime: Date.now() - this.startedAt,
      memory: { free: 100, used: 200, allocated: 300, reservable: 400 },
      cpu: { cores: 8, systemLoad: 0.15, lavalinkLoad: 0.05 },
      frameStats: { sent: 1000, nulled: 0, deficit: 0 },
    };
  }
}

function respondJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body);
}

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export { makeTrack };
