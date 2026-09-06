# Publishing & releasing Junie

Everything you need to go from this repo to a published, community-visible
package. Work top-to-bottom on release day.

---

## 0. Prerequisites (one-time)

- [ ] npm account with 2FA enabled: `npm login`
- [ ] GitHub repo created (`junie-labs/junie` or your own org)
- [ ] `git remote add origin git@github.com:<you>/junie.git` (if not cloned from it)
- [ ] Node 22+ locally (the version that builds `dist/`)

## 1. Verify the release candidate

Run everything the CI runs — locally:

```bash
npm run typecheck     # strict TS, zero errors
npm test              # unit suite (vitest)
npm run build         # dual CJS + ESM into dist/
node scripts/e2e.mjs  # 29-check battle test against a fake Lavalink over real sockets
cd examples/battle-bot && npm install && npm run dry   # installability + wiring
```

Optional but recommended before protocol-facing changes — the real-server smoke:

```bash
# requires Java 17+ and the jar in ../lavalink-real/ (see scripts/real-smoke.mjs)
node scripts/real-smoke.mjs
```

Then confirm the tarball contains exactly what users should get (and nothing else):

```bash
npm publish --dry-run
```

Expect: `dist/**`, `README.md`, `LICENSE`, `CHANGELOG.md`, `docs/**` — nothing else.

## 2. Version & changelog

1. Bump `JUNIE_VERSION` in `src/constants.ts` (single source of truth — headers
   and the default `Client-Name` derive from it).
2. Bump `version` in `package.json` to match.
3. Add a `CHANGELOG.md` entry (Keep-a-Changelog style, date + unreleased→version).

## 3. Push

```bash
git add -A
git commit -m "release: v1.x.y"
git tag "v1.x.y"
git push origin main --tags
```

CI runs on the tag push; do not publish if CI is red.

## 4. Publish to npm

```bash
npm publish --access public
```

With npm provenance (recommended — requires the repo to be public on GitHub):

```bash
npm publish --access public --provenance
```

After publishing, verify from a clean directory:

```bash
mkdir /tmp/check && cd /tmp/check && npm init -y >/dev/null
npm install junie@1.x.y
node -e "const {Junie}=require('junie'); console.log('CJS', typeof Junie)"
node --input-type=module -e "import('junie').then(m=>console.log('ESM', typeof m.Junie))"
```

## 5. GitHub release

```bash
gh release create v1.x.y --title "v1.x.y" --notes-file <(sed -n '/## \[1.x.y/,/## \[/p' CHANGELOG.md | head -n -1)
```

Or manually: Releases → Draft new release → pick the tag → paste the changelog
section.

## 6. Tell the world (first release)

Post the ready-made drafts from `marketing/`:

| Asset | Where | Notes |
|---|---|---|
| `marketing/discord-announcement.md` | Lavalink Discord, bot-dev servers | Follow each server's self-promo rules; some require a wait period after joining |
| `marketing/reddit-post.md` | r/Discord_Bots, r/discordbots | Flair as "Library / Resource" where available |
| `marketing/devto-article.md` | dev.to | Long-form; publish after the quick posts so links resolve to v1.x.y |
| `marketing/x-thread.md` | X / Twitter | Thread; pin to profile |

Rules of engagement (they matter more than the code):

- **Answer every issue within 48h** for the first two months — responsiveness is
  the #1 adoption driver for new wrappers.
- Don't trash competitors; the comparison table in the README is the edge of it.
- Ship protocol updates within days of Lavalink releases (see `PROTOCOL.md`).
- Be honest about version 1.x rough edges — trust compounds.

## 7. Landing page (optional)

`site/index.html` is a zero-dependency single file. Enable GitHub Pages:
Settings → Pages → Deploy from branch → `main` → `/site`. Point the README's
badges at it if you like.

---

## Rollback

If a published version is broken:

1. `npm deprecate junie@1.x.y "Use 1.x.z — fixes <issue>"`
2. Fix forward on a patch release (fastest path to user trust).
3. Never `unpublish` after 72h (npm blocks it; users already depend on it).
