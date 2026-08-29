const MAX_PUBLIC_URL_LENGTH = 2_048;
const BLOCKED_HOST_SUFFIXES = [
  '.internal',
  '.invalid',
  '.lan',
  '.local',
  '.localhost',
  '.test',
];

function isIpLiteral(hostname: string): boolean {
  return hostname.includes(':') || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
}

/**
 * Parses a caller-supplied URL only when it targets a public HTTP(S) hostname.
 * Credentials, custom ports, local names, IP literals, and non-web schemes are
 * rejected without maintaining a hard-coded IP range list.
 */
export function parsePublicHttpUrl(input: string): URL | null {
  let raw = String(input || '').trim();
  if (!raw || raw.length > MAX_PUBLIC_URL_LENGTH) return null;

  // Fix common user typing / copy-paste typo schemes (e.g. thttps://, tthttps://)
  raw = raw.replace(/^t+https?:\/\//i, 'https://');

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password || url.port) return null;

    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!hostname || hostname === 'localhost' || isIpLiteral(hostname)) return null;
    if (hostname.length > 253) return null;
    const labels = hostname.split('.');
    if (labels.some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))) return null;
    if (BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return null;
    if (!hostname.includes('.')) return null;

    url.hostname = hostname;
    return url;
  } catch {
    return null;
  }
}

/**
 * Normalizes user-entered URL into hostname info.
 */
export function normalizeUrlToHostname(input: string): {
  hostname: string;
  hostnameNoWww: string;
} | null {
  const url = parsePublicHttpUrl(input);
  if (!url) return null;

  const hostname = url.hostname.toLowerCase();
  const hostnameNoWww = hostname.replace(/^www\./, '');
  return { hostname, hostnameNoWww };
}

/**
 * Format any raw user-entered tool URL into a clean canonical site URL (e.g. "https://example.com" or "https://www.example.com").
 * Strips tracking parameters, query strings, hashes, and fixes accidental typo prefixes (like thttps://).
 */
export function formatCanonicalSiteUrl(input: string): string {
  if (!input || !input.trim()) return '';
  const info = normalizeUrlToHostname(input);
  if (!info) {
    let raw = input.trim().replace(/^t+https?:\/\//i, 'https://');
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    return raw.replace(/\/+$/, '');
  }

  // Preserve user's choice of protocol and www if valid
  const raw = input.trim().replace(/^t+https?:\/\//i, 'https://');
  const protocol = raw.toLowerCase().startsWith('http://') ? 'http:' : 'https:';
  return `${protocol}//${info.hostname}`;
}

/**
 * Normalize a URL to a full https:// URL without www suitable for storing or comparison.
 * Always returns https://hostname (no www).
 */
export function normalizeToFullSiteUrl(input: string): string | null {
  const info = normalizeUrlToHostname(input);
  if (!info) return null;
  return `https://${info.hostnameNoWww}`;
}

/**
 * Validates tool site URL format thoroughly (structure, domain, public host, TLD).
 */
export function validateToolSiteUrlFormat(raw: string): {
  isValid: boolean;
  error?: string;
  cleaned?: string;
  domain?: string;
} {
  const t = (raw || '').trim();
  if (!t) return { isValid: false, error: 'Tool site URL is required.' };

  const info = normalizeUrlToHostname(t);
  if (!info) return { isValid: false, error: 'Enter a valid URL like https://example.com' };

  const { hostname, hostnameNoWww } = info;
  if (!hostnameNoWww.includes('.')) {
    return { isValid: false, error: 'Enter a valid domain with an extension.' };
  }

  if (hostnameNoWww === 'toolbit.ai' || hostnameNoWww.endsWith('.toolbit.ai')) {
    return { isValid: false, error: 'You cannot submit toolbit.ai as a tool listing.' };
  }

  if (hostnameNoWww.includes('_')) {
    return { isValid: false, error: 'Domain names cannot contain underscores.' };
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostnameNoWww) || hostnameNoWww.includes(':') || hostnameNoWww === 'localhost') {
    return { isValid: false, error: 'Public domain required (IP addresses are not allowed).' };
  }

  const parts = hostnameNoWww.split('.').filter(Boolean);
  const tld = parts[parts.length - 1] || '';
  if (tld.length < 2 || !/^[a-z]{2,}$/i.test(tld)) {
    return { isValid: false, error: 'Invalid domain extension (TLD).' };
  }

  // Preserve user's choice of protocol and www
  const isHttp = (raw || '').trim().toLowerCase().startsWith('http://');
  const protocol = isHttp ? 'http://' : 'https://';
  const cleaned = `${protocol}${hostname}`;

  return {
    isValid: true,
    cleaned,
    domain: hostnameNoWww,
  };
}

/**
 * Derive a clean capitalized tool name from a URL domain.
 * Example: "https://www.photopea.com" -> "Photopea"
 * Example: "https://my-ai-tool.io" -> "My Ai Tool"
 */
export function deriveToolNameFromUrl(inputUrl: string): string {
  const info = normalizeUrlToHostname(inputUrl);
  if (!info?.hostnameNoWww) return '';
  const parts = info.hostnameNoWww.split('.').filter(Boolean);
  if (parts.length === 0) return '';
  const mainPart = parts[0] || '';
  if (!mainPart) return '';
  const words = mainPart.split(/[-_]+/).filter(Boolean);
  if (words.length === 0) return '';
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Generates all permutations of a hostname/URL to ensure robust database lookups.
 */
export function makeHostnameVariants(hostnameNoWwwOrUrl: string, rawUrl?: string): string[] {
  const input = (rawUrl || hostnameNoWwwOrUrl || '').trim();
  const info = normalizeUrlToHostname(input);
  const h = (info?.hostnameNoWww || hostnameNoWwwOrUrl || '').trim().toLowerCase().replace(/^www\./, '').replace(/\/+$/, '');

  if (!h) return [];

  const list = [
    `https://${h}`,
    `https://${h}/`,
    `https://www.${h}`,
    `https://www.${h}/`,
    `http://${h}`,
    `http://${h}/`,
    `http://www.${h}`,
    `http://www.${h}/`,
    h,
    `www.${h}`,
  ];

  const cleanUrl = normalizeToFullSiteUrl(input);
  if (cleanUrl) {
    const cleanHost = cleanUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    list.push(cleanUrl);
    list.push(`${cleanUrl}/`);
    list.push(`https://www.${cleanHost}`);
    list.push(`https://www.${cleanHost}/`);
    list.push(`http://${cleanHost}`);
    list.push(`http://${cleanHost}/`);
    list.push(`http://www.${cleanHost}`);
    list.push(`http://www.${cleanHost}/`);
  }

  const targetRaw = (rawUrl || (input.includes('/') ? input : '')).trim();
  if (targetRaw) {
    const r = targetRaw.toLowerCase().replace(/\/+$/, '');
    list.push(targetRaw);
    list.push(r);
    list.push(`${r}/`);

    if (/^https?:\/\//i.test(r)) {
      const barePath = r.replace(/^https?:\/\/(www\.)?/, '');
      list.push(`https://${barePath}`);
      list.push(`https://${barePath}/`);
      list.push(`https://www.${barePath}`);
      list.push(`https://www.${barePath}/`);
      list.push(`http://${barePath}`);
      list.push(`http://${barePath}/`);
      list.push(`http://www.${barePath}`);
      list.push(`http://www.${barePath}/`);
    }
  }

  return Array.from(new Set(list));
}

/**
 * Consistently find an existing published tool in `ai_tools` by site URL.
 * Supports optional `excludeToolId` to avoid matching the current tool being edited.
 */
export async function findToolBySiteUrl(
  supabase: any,
  inputUrl: string,
  selectFields = '*',
  excludeToolId?: number | string | null
): Promise<any> {
  if (!inputUrl) return null;
  const urlInfo = normalizeUrlToHostname(inputUrl);
  if (!urlInfo) return null;
  const host = urlInfo.hostnameNoWww;

  const variants = makeHostnameVariants(host, inputUrl);

  // 1. Direct IN query with variants
  let query1 = supabase
    .from('ai_tools')
    .select(selectFields)
    .in('tool_site_url', variants);

  if (excludeToolId) {
    query1 = query1.neq('tool_id', excludeToolId);
  }

  const { data: directMatch } = await query1.limit(1).maybeSingle();
  if (directMatch) return directMatch;

  // 2. Prefix ILIKE fallback for deep paths or legacy records
  let query2 = supabase
    .from('ai_tools')
    .select(selectFields)
    .or(
      `tool_site_url.ilike.https://${host}/%,tool_site_url.ilike.https://www.${host}/%,tool_site_url.ilike.http://${host}/%,tool_site_url.ilike.http://www.${host}/%,tool_site_url.ilike.https://${host}%,tool_site_url.ilike.https://www.${host}%,tool_site_url.ilike.http://${host}%,tool_site_url.ilike.http://www.${host}%`
    );

  if (excludeToolId) {
    query2 = query2.neq('tool_id', excludeToolId);
  }

  const { data: ilikeMatch } = await query2.limit(1).maybeSingle();
  return ilikeMatch || null;
}

/**
 * Consistently find a submission in `ai_tool_submissions` by site URL.
 */
export async function findSubmissionBySiteUrl(
  supabase: any,
  inputUrl: string,
  selectFields = '*',
  statuses = ['pending', 'in_review', 'verified', 'draft', 'approved']
): Promise<any> {
  if (!inputUrl) return null;
  const urlInfo = normalizeUrlToHostname(inputUrl);
  if (!urlInfo) return null;
  const host = urlInfo.hostnameNoWww;

  const variants = makeHostnameVariants(host, inputUrl);

  // 1. Direct IN query with variants
  let query1 = supabase
    .from('ai_tool_submissions')
    .select(selectFields)
    .in('tool_site_url', variants);

  if (statuses && statuses.length > 0) {
    query1 = query1.in('status', statuses);
  }

  const { data: directMatch } = await query1
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (directMatch) return directMatch;

  // 2. Prefix ILIKE fallback
  let query2 = supabase
    .from('ai_tool_submissions')
    .select(selectFields)
    .or(
      `tool_site_url.ilike.https://${host}/%,tool_site_url.ilike.https://www.${host}/%,tool_site_url.ilike.http://${host}/%,tool_site_url.ilike.http://www.${host}/%,tool_site_url.ilike.https://${host}%,tool_site_url.ilike.https://www.${host}%,tool_site_url.ilike.http://${host}%,tool_site_url.ilike.http://www.${host}%`
    );

  if (statuses && statuses.length > 0) {
    query2 = query2.in('status', statuses);
  }

  const { data: ilikeMatch } = await query2
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return ilikeMatch || null;
}

/**
 * Consistently find an existing advertisement in `advertisement_tools` by site URL.
 * Uses exact hostname variants match first, with ILIKE domain prefix fallback.
 * Supports optional `excludeId` to avoid matching the current advertisement being edited.
 */
export async function findAdvertisementToolBySiteUrl(
  supabase: any,
  inputUrl: string,
  selectFields = 'id, status, end_date, start_date, tool_id, featured_type',
  excludeId?: number | string | null
): Promise<any> {
  if (!inputUrl) return null;
  const urlInfo = normalizeUrlToHostname(inputUrl);
  if (!urlInfo) return null;
  const host = urlInfo.hostnameNoWww;

  const variants = makeHostnameVariants(host, inputUrl);

  // 1. Direct IN query with variants
  let query1 = supabase
    .from('advertisement_tools')
    .select(selectFields)
    .in('tool_site_url', variants)
    .neq('status', 'expired');

  if (excludeId) {
    query1 = query1.neq('id', excludeId);
  }

  const { data: directMatch } = await query1.limit(1).maybeSingle();
  if (directMatch) return directMatch;

  // 2. Prefix ILIKE fallback
  let query2 = supabase
    .from('advertisement_tools')
    .select(selectFields)
    .or(
      `tool_site_url.ilike.https://${host}/%,tool_site_url.ilike.https://www.${host}/%,tool_site_url.ilike.http://${host}/%,tool_site_url.ilike.http://www.${host}/%,tool_site_url.ilike.https://${host}%,tool_site_url.ilike.https://www.${host}%,tool_site_url.ilike.http://${host}%,tool_site_url.ilike.http://www.${host}%`
    )
    .neq('status', 'expired');

  if (excludeId) {
    query2 = query2.neq('id', excludeId);
  }

  const { data: ilikeMatch } = await query2.limit(1).maybeSingle();
  return ilikeMatch || null;
}

