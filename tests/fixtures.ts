/**
 * Junie test fixtures: fake WebSocket transport, fetch stub, client factory.
 */

import { vi, type Mock } from 'vitest';
import { Junie } from '../src/Junie.js';
import type { NodeStats, APITrack, NodeInfo } from '../src/types/api.js';
import type { JunieOptions, WebSocketFactory } from '../src/types/options.js';

// ---------------------------------------------------------------------------
// Fake WebSocket transport
// ---------------------------------------------------------------------------

type Listener = (...args: unknown[]) => void;

export class FakeWebSocket {
  public static instances: FakeWebSocket[] = [];
  public url: string;
  public headers: Record<string, string>;
  public listeners = new Map<string, Set<Listener>>();
  public closed = false;
  public closeCode: number | undefined;
  public closeReason: string | undefined;

  public constructor(url: string, headers: Record<string, string>) {
    this.url = url;
    this.headers = headers;
    FakeWebSocket.instances.push(this);
  }

  public on(event: string, listener: Listener): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }

  public once(event: string, listener: Listener): this {
    const wrapped: Listener = (...args: unknown[]) => {
      this.off(event, wrapped);
      listener(...args);
    };
    return this.on(event, wrapped);
  }

  public off(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  public close(code = 1000, reason = ''): void {
    if (this.closed) return;
    this.closed = true;
    this.closeCode = code;
    this.closeReason = reason;
    // Mirror the real `ws` behaviour: closing eventually emits 'close'.
    this.emit('close', code, Buffer.from(reason));
  }

  // --- test drivers ---
  public open(): void {
    this.emit('open');
  }

  public message(data: unknown): void {
    this.emit('message', JSON.stringify(data));
  }

  public emitClose(code = 1006, reason = 'abnormal'): void {
    this.closed = true;
    this.emit('close', code, Buffer.from(reason));
  }

  public emitError(error: Error): void {
    this.emit('error', error);
  }

  private emit(event: string, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      listener(...args);
    }
  }
}

export const fakeWebSocketFactory: WebSocketFactory = (url, headers) =>
  new FakeWebSocket(url, headers) as unknown as ReturnType<WebSocketFactory>;

export function resetSockets(): void {
  FakeWebSocket.instances = [];
}

export function lastSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  if (!socket) throw new Error('No fake websocket was created.');
  return socket;
}

// ---------------------------------------------------------------------------
// Fetch stub
// ---------------------------------------------------------------------------

export interface FetchCall {
  url: string;
  method: string;
  body?: Record<string, unknown> | unknown[];
}

export type Responder = (url: URL, init: RequestInit) => Response | Promise<Response>;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function textResponse(text: string, status = 200): Response {
  return new Response(text, { status });
}

export function createFetchStub(responder: Responder = () => jsonResponse({})): {
  fetch: Mock;
  calls: FetchCall[];
  respond: (next: Responder) => void;
} {
  let current = responder;
  const calls: FetchCall[] = [];
  const fetch = vi.fn(async (url: unknown, init: RequestInit = {}) => {
    calls.push({
      url: String(url),
      method: String(init.method ?? 'GET'),
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as FetchCall['body']) : undefined,
    });
    return current(new URL(String(url)), init);
  });
  return { fetch, calls, respond: (next: Responder) => { current = next; } };
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

export interface TestClient {
  junie: Junie;
  sendToShard: Mock;
  socket: FakeWebSocket;
}

export function createTestClient(overrides: Partial<JunieOptions> = {}): TestClient {
  resetSockets();
  const sendToShard = vi.fn(async () => undefined);
  const junie = new Junie({
    nodes: [
      { id: 'test', host: 'localhost', port: 2333, authorization: 'youshallnotpass' },
    ],
    sendToShard,
    logLevel: 'silent',
    webSocketFactory: fakeWebSocketFactory,
    ...overrides,
  });
  junie.init('111222333444555666');
  const socket = lastSocket();
  return { junie, sendToShard, socket };
}

/** Drive the node's WebSocket through a successful ready handshake. */
export async function connectNode(
  socket: FakeWebSocket,
  options: { sessionId?: string; resumed?: boolean; settle?: boolean } = {},
): Promise<void> {
  socket.open();
  socket.message({
    op: 'ready',
    resumed: options.resumed ?? false,
    sessionId: options.sessionId ?? 'sess-1',
  });
  if (options.settle === false) return;
  // Let async ready handling (resume PATCH etc.) settle.
  await new Promise((resolve) => setTimeout(resolve, 10));
}

/** Deliver a matching pair of Discord voice packets. */
export function deliverVoice(
  junie: Junie,
  guildId: string,
  channelId: string,
  sessionLabel = '1',
): void {
  junie.sendRawData({
    t: 'VOICE_STATE_UPDATE',
    d: {
      user_id: junie.userId,
      guild_id: guildId,
      channel_id: channelId,
      session_id: `voice-session-${sessionLabel}`,
    },
  });
  junie.sendRawData({
    t: 'VOICE_SERVER_UPDATE',
    d: { guild_id: guildId, token: `token-${sessionLabel}`, endpoint: 'eu-central586.discord.media' },
  });
}

// ---------------------------------------------------------------------------
// Track / stats fixtures
// ---------------------------------------------------------------------------

let trackCounter = 0;

export function makeApiTrack(title = 'Track', overrides: Partial<APITrack['info']> = {}): APITrack {
  trackCounter += 1;
  return {
    encoded: `encoded-${trackCounter}-${title.replace(/\W+/g, '')}`,
    info: {
      identifier: `id-${trackCounter}`,
      isSeekable: true,
      author: 'Artist',
      length: 180_000,
      isStream: false,
      position: 0,
      title,
      uri: `https://example.com/${trackCounter}`,
      artworkUrl: null,
      isrc: null,
      sourceName: 'youtube',
      ...overrides,
    },
    pluginInfo: {},
    userData: {},
  };
}

export function makeStats(overrides: {
  players?: number;
  playingPlayers?: number;
  systemLoad?: number;
  lavalinkLoad?: number;
  nulled?: number;
  deficit?: number;
} = {}): NodeStats {
  return {
    op: 'stats',
    players: overrides.players ?? 0,
    playingPlayers: overrides.playingPlayers ?? 0,
    uptime: 60_000,
    memory: { free: 100, used: 200, allocated: 300, reservable: 400 },
    cpu: {
      cores: 8,
      systemLoad: overrides.systemLoad ?? 0.1,
      lavalinkLoad: overrides.lavalinkLoad ?? 0.05,
    },
    frameStats: { sent: 1000, nulled: overrides.nulled ?? 0, deficit: overrides.deficit ?? 0 },
  };
}

export function makeInfo(): NodeInfo {
  return {
    version: { semver: '4.0.8', major: 4, minor: 0, patch: 8 },
    buildTime: Date.now(),
    git: { commit: 'abcdef', commitTime: Date.now() },
    enabledSources: { youtube: true },
    plugins: [{ name: 'lavasrc', version: '1.0.0' }],
  };
}
