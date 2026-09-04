# Contributing to Junie

Thanks for wanting to help! This document covers the practical bits.

## Development setup

```bash
git clone https://github.com/junie-labs/junie && cd junie
npm install
npm test        # 111 tests — no Lavalink server needed
npm run build   # dual CJS + ESM output in dist/
```

Requirements: Node.js ≥ 18.17.

## Ground rules

1. **Design principles first.** Read the [project principles](./README.md#project-principles).
   Correctness under failure, small honest API, types as documentation, zero lock-in.
2. **Every network path gets a timeout. Every teardown gets a `finally`.**
   If your change adds an `await` on I/O, think about what happens when it hangs —
   then handle it.
3. **No breaking changes without an entry in [CHANGELOG](./CHANGELOG.md)** and, when
   needed, a migration note in the affected doc page.

## Testing

- Behavioural tests live in `tests/*.test.ts`. The fixtures (`tests/fixtures.ts`)
  provide a fake WebSocket transport, a fetch stub, and client factories — use them
  instead of spinning up servers.
- Bug fixes must come with a test that fails before the fix.
- New features need coverage of their observable behaviour (events emitted, REST
  bodies sent, state transitions).

```bash
npm test               # run everything
npx vitest run tests/queue.test.ts   # one file
npx vitest             # watch mode
```

## Pull requests

- Keep them focused; one concern per PR.
- `npm run typecheck`, `npm test`, `npm run build` must all pass.
- Document public API changes in the relevant `docs/*.md` page and the README tour.

## Reporting bugs

Open an issue with: Junie version, Node version, Lavalink version, a minimal
reproduction, and logs at `logLevel: 'debug'` (or `'trace'` with the `raw` event
subscribed). The [troubleshooting page](./docs/troubleshooting.md) may already
have your answer.

## License

By contributing you agree that your contributions are licensed under the
[MIT license](./LICENSE).
