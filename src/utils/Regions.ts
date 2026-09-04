/**
 * Junie — Discord voice region parsing & zone mapping.
 *
 * Lavalink clients can route players to nodes that are geographically close
 * to Discord's voice server. Discord voice endpoints look like
 * `us-west873.discord.media` (or the legacy `*.discord.gg`); the leading
 * token identifies the region. Junie maps region tokens to coarse zones
 * ("continents") and lets the penalty strategy charge cross-zone nodes.
 */

/** Coarse geographic zones. */
export type VoiceZone = 'europe' | 'north-america' | 'south-america' | 'asia' | 'africa' | 'oceania' | 'unknown';

/** Region token -> zone. Region tokens are matched case-insensitively. */
const ZONES: ReadonlyArray<[readonly string[], VoiceZone]> = [
  [
    [
      'eu', 'eu-central', 'eu-west', 'europe', 'amsterdam', 'frankfurt', 'helsinki',
      'london', 'uk', 'milan', 'paris', 'prague', 'rotterdam', 'stockholm', 'vienna',
      'warsaw', 'russia', 'israel', 'telaviv',
    ],
    'europe',
  ],
  [
    [
      'us', 'us-central', 'us-east', 'us-south', 'us-west', 'na', 'north-america',
      'newark', 'ashburn', 'atlanta', 'baltimore', 'chicago', 'dallas', 'denver',
      'houston', 'losangeles', 'miami', 'newyork', 'philadelphia', 'sanjose',
      'seattle', 'siliconvalley', 'stlouis', 'virginia', 'canada', 'toronto',
      'montreal', 'vip-us-east', 'vip-us-west',
    ],
    'north-america',
  ],
  [
    ['brazil', 'sa', 'south-america', 'santiago', 'buenosaires', 'vip-brazil'],
    'south-america',
  ],
  [
    [
      'singapore', 'hongkong', 'hong-kong', 'japan', 'tokyo', 'osaka', 'korea',
      'south-korea', 'seoul', 'india', 'mumbai', 'dubai', 'vip-singapore', 'vip-japan',
    ],
    'asia',
  ],
  [
    ['southafrica', 'south-africa', 'africa', 'johannesburg', 'vip-southafrica'],
    'africa',
  ],
  [
    ['sydney', 'australia', 'oceania', 'vip-sydney', 'perth', 'melbourne'],
    'oceania',
  ],
];

const TOKEN_TO_ZONE = new Map<string, VoiceZone>();
for (const [tokens, zone] of ZONES) {
  for (const token of tokens) {
    // Normalize: strip spaces, underscores and dashes so lookups like
    // "us-east", "us_east" and "useast" all hit the same entry.
    TOKEN_TO_ZONE.set(token.replace(/[\s_-]/g, ''), zone);
  }
}

/**
 * Extract the region token from a Discord voice endpoint.
 * `"eu-central586.discord.media"` -> `"eu-central"`.
 */
export function parseVoiceRegion(endpoint: string | null | undefined): string | null {
  if (!endpoint) return null;
  const host = endpoint.split(':')[0];
  const match = /^([a-z]+-?[a-z]+)/i.exec(host);
  return match ? match[1].toLowerCase() : null;
}

/** Map a region token (or arbitrary node region label) to a coarse zone. */
export function regionZone(token: string | null | undefined): VoiceZone {
  if (!token) return 'unknown';
  const normalized = token.toLowerCase().replace(/[\s_-]/g, '');
  const direct = TOKEN_TO_ZONE.get(normalized);
  if (direct) return direct;
  // Try trimming trailing digits (e.g. "us-west873").
  const stripped = normalized.replace(/\d+$/, '');
  return TOKEN_TO_ZONE.get(stripped) ?? 'unknown';
}

/**
 * Region penalty between a node's configured regions and the voice endpoint.
 * - node has no regions configured -> 0 (region-neutral)
 * - same zone -> 0
 * - both known but different zones -> 1000
 * - either side unknown -> 250
 */
export function regionPenalty(nodeRegions: readonly string[] | undefined, endpoint: string | null | undefined): number {
  if (!nodeRegions || nodeRegions.length === 0) return 0;
  const voiceZone = regionZone(parseVoiceRegion(endpoint));
  if (voiceZone === 'unknown') return 250;
  for (const configured of nodeRegions) {
    if (regionZone(configured) === voiceZone) return 0;
  }
  return 1000;
}

/** All zone names, exported for tooling and documentation. */
export const VOICE_ZONES: readonly VoiceZone[] = [
  'europe', 'north-america', 'south-america', 'asia', 'africa', 'oceania', 'unknown',
];
