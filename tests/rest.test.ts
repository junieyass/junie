/**
 * Unit tests for the REST manager.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { RestManager } from '../src/node/Rest.js';
import type { RestDependencies } from '../src/node/Rest.js';
import { JunieRestError, JunieErrorCode } from '../src/errors.js';
import { createFetchStub, jsonResponse, textResponse } from './fixtures.js';

function makeRest(overrides: Partial<RestDependencies> = {}): {
  rest: RestManager;
  onSessionInvalid: ReturnType<typeof vi.fn>;
} {
  const onSessionInvalid = vi.fn();
  const deps: RestDependencies = {
    origin: 'http://localhost:2333',
    baseUrl: 'http://localhost:2333/v4',
    authorization: 'youshallnotpass',
    clientName: 'Junie/1.0.0',
    options: { timeout: 500, retries: 1, headers: {} },
    getSessionId: () => 'sess-1',
    onSessionInvalid,
    ...overrides,
  };
  return { rest: new RestManager(deps), onSessionInvalid };
}

describe('RestManager', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    globalThis.fetch = realFetch;
  });

  it('sends authorized JSON requests and parses responses', async () => {
    const { fetch, calls } = createFetchStub(() => jsonResponse({ version: { semver: '4.0.8' } }));
    vi.stubGlobal('fetch', fetch);
    const { rest } = makeRest();

    const info = await rest.getInfo();
    expect(info.version.semver).toBe('4.0.8');
    expect(calls[0]).toMatchObject({
      url: 'http://localhost:2333/v4/info',
      method: 'GET',
    });
  });

  it('PATCHes player updates with body and noReplace', async () => {
    const { fetch, calls } = createFetchStub(() => jsonResponse({ guildId: 'g1' }));
    vi.stubGlobal('fetch', fetch);
    const { rest } = makeRest();

    await rest.updatePlayer('g1', { track: { encoded: 'abc' } }, true);

    const call = calls[0]!;
    expect(call.method).toBe('PATCH');
    expect(call.url).toContain('/v4/sessions/sess-1/players/g1?noReplace=true');
    expect(call.body).toEqual({ track: { encoded: 'abc' } });
  });

  it('maps Lavalink error bodies to JunieRestError', async () => {
    const body = {
      timestamp: Date.now(),
      status: 400,
      error: 'Bad Request',
      message: 'Invalid track',
      path: '/v4/loadtracks',
      trace: 'stack',
    };
    const { fetch } = createFetchStub(() => jsonResponse(body, 400));
    vi.stubGlobal('fetch', fetch);
    const { rest } = makeRest();

    await expect(rest.loadTracks('ytsearch:x')).rejects.toMatchObject({
      code: JunieErrorCode.REST_REQUEST_FAILED,
      status: 400,
      lavalink: expect.objectContaining({ message: 'Invalid track' }),
    });
  });

  it('signals session invalidation on 404 for our own session', async () => {
    const { fetch } = createFetchStub((url) =>
      jsonResponse({ timestamp: 1, status: 404, error: 'Not Found', message: 'Session not found', path: url.pathname }, 404),
    );
    vi.stubGlobal('fetch', fetch);
    const { rest, onSessionInvalid } = makeRest();

    await expect(rest.getPlayer('g1')).rejects.toThrow(JunieRestError);
    expect(onSessionInvalid).toHaveBeenCalledTimes(1);
  });

  it('does not signal session invalidation when told to ignore it', async () => {
    const { fetch } = createFetchStub(() =>
      jsonResponse({ timestamp: 1, status: 404, error: 'Not Found', message: 'Session not found', path: '/' }, 404),
    );
    vi.stubGlobal('fetch', fetch);
    const { rest, onSessionInvalid } = makeRest();

    await expect(rest.destroyPlayer('g1')).rejects.toThrow(JunieRestError);
    expect(onSessionInvalid).not.toHaveBeenCalled();
  });

  it('retries network failures then throws', async () => {
    let attempts = 0;
    const { fetch, calls } = createFetchStub(() => {
      attempts += 1;
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fetch);
    const { rest } = makeRest();

    await expect(rest.getInfo()).rejects.toMatchObject({ status: 0 });
    // retries: 1 -> two attempts total.
    expect(attempts).toBe(2);
    expect(calls).toHaveLength(2);
  });

  it('retries 5xx responses then succeeds', async () => {
    let attempts = 0;
    const { fetch } = createFetchStub(() => {
      attempts += 1;
      return attempts === 1 ? jsonResponse({ error: 'boom' }, 503) : jsonResponse({ ok: true });
    });
    vi.stubGlobal('fetch', fetch);
    const { rest } = makeRest();

    await expect(rest.getInfo()).resolves.toEqual({ ok: true });
    expect(attempts).toBe(2);
  });

  it('requests the version route at the server root', async () => {
    const { fetch, calls } = createFetchStub(() => textResponse('4.0.8'));
    vi.stubGlobal('fetch', fetch);
    const { rest } = makeRest();

    await expect(rest.getVersion()).resolves.toBe('4.0.8');
    expect(calls[0]!.url).toBe('http://localhost:2333/version');
  });

  it('requires a session for player routes', async () => {
    const { rest } = makeRest({ getSessionId: () => null });
    expect(() => rest.getPlayers()).toThrow(/No session available/);
  });

  it('forwards search parameters as query strings', async () => {
    const { fetch, calls } = createFetchStub(() => jsonResponse({ loadType: 'empty', data: {} }));
    vi.stubGlobal('fetch', fetch);
    const { rest } = makeRest();

    await rest.loadTracks('ytsearch:never gonna', { async: 'true' });
    expect(calls[0]!.url).toBe(
      'http://localhost:2333/v4/loadtracks?identifier=ytsearch%3Anever%20gonna&async=true',
    );
  });
});
