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
/**
 * Extract the region token from a Discord voice endpoint.
 * `"eu-central586.discord.media"` -> `"eu-central"`.
 */
export declare function parseVoiceRegion(endpoint: string | null | undefined): string | null;
/** Map a region token (or arbitrary node region label) to a coarse zone. */
export declare function regionZone(token: string | null | undefined): VoiceZone;
/**
 * Region penalty between a node's configured regions and the voice endpoint.
 * - node has no regions configured -> 0 (region-neutral)
 * - same zone -> 0
 * - both known but different zones -> 1000
 * - either side unknown -> 250
 */
export declare function regionPenalty(nodeRegions: readonly string[] | undefined, endpoint: string | null | undefined): number;
/** All zone names, exported for tooling and documentation. */
export declare const VOICE_ZONES: readonly VoiceZone[];
//# sourceMappingURL=Regions.d.ts.map