/**
 * Outreach guard: leads whose website already exists in `ai_tools` (listed, any status)
 * or `ai_tool_submissions` (submitted, any status) must not receive outreach emails.
 *
 * Matching happens in the database (rpc `marketing_find_existing_tools`, migration
 * 20260930150000_add_marketing_existing_tool_check.sql) by website host, the same way the
 * submission approval trigger matches tools. On shared platforms (github.com, huggingface.co,
 * chatgpt.com, app stores, ...) the tool-specific part of the URL must match as well
 * (db helper `marketing_canonical_tool_key`).
 *
 * Safe to import from both client and server code (no server-only imports).
 */

export type ExistingToolSource = 'ai_tools' | 'ai_tool_submissions';

export interface ExistingToolMatch {
  /** Normalised host that matched, e.g. "foo.ai". */
  host: string;
  source: ExistingToolSource;
  /** ai_tools.tool_id or ai_tool_submissions.id */
  recordId: number;
  toolName: string | null;
  /** ai_tools.tool_url / ai_tool_submissions.tool_url (slug) */
  toolSlug: string | null;
  status: string | null;
  /** tool_site_url of the matching row */
  matchedUrl: string | null;
}

/** Matches keyed by the site URL exactly as it was passed to the check. URLs without a match are absent. */
export type ExistingToolMatches = Map<string, ExistingToolMatch[]>;

/** Short badge text, e.g. "Listed · show" or "Submitted · pending". */
export function formatExistingToolBadge(match: ExistingToolMatch): string {
  const kind = match.source === 'ai_tools' ? 'Listed' : 'Submitted';
  return match.status ? `${kind} · ${match.status}` : kind;
}

/** Full sentence for one match, e.g. "Already listed on Toolbit (tool #42, show)". */
export function formatExistingToolMatch(match: ExistingToolMatch): string {
  const what =
    match.source === 'ai_tools'
      ? `Already listed on Toolbit (tool #${match.recordId}`
      : `Already submitted to Toolbit (submission #${match.recordId}`;
  return `${what}${match.status ? `, ${match.status}` : ''})`;
}

/** Tooltip with all details of one match. */
export function formatExistingToolTitle(match: ExistingToolMatch): string {
  const table = match.source === 'ai_tools' ? 'ai_tools' : 'ai_tool_submissions';
  return [
    `${table} #${match.recordId}`,
    match.toolName,
    match.status ? `status: ${match.status}` : null,
    match.matchedUrl,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** One-line skip reason for a lead. Listed tools take precedence over submissions. */
export function describeExistingToolMatches(matches: ExistingToolMatch[]): string {
  if (matches.length === 0) return '';
  const sorted = sortExistingToolMatches(matches);
  const more = sorted.length - 1;
  return `${formatExistingToolMatch(sorted[0])}${more > 0 ? ` +${more} more` : ''}`;
}

/** Listed tools (ai_tools) first, then submissions; stable within each group. */
export function sortExistingToolMatches(matches: ExistingToolMatch[]): ExistingToolMatch[] {
  return [...matches].sort(
    (a, b) => Number(a.source !== 'ai_tools') - Number(b.source !== 'ai_tools') || a.recordId - b.recordId
  );
}
