/**
 * Utility functions for safely building PostgREST queries and search filters in Supabase.
 *
 * PostgREST uses commas (,), parentheses (()), colons (:), double quotes ("), and backslashes (\)
 * as reserved control syntax characters for .or(), .and(), and filter operators.
 * Passing raw user search input containing these characters directly into .or() clauses
 * results in HTTP 400 Bad Request ("failed to parse filter") crashes.
 */

/**
 * Sanitizes a search string by removing PostgREST control delimiters and formatting whitespace.
 *
 * @param search - The raw user search query string
 * @returns Cleaned, safe string with control characters replaced by spaces
 */
export function sanitizeSearchTerm(search?: string | null): string {
  if (!search || typeof search !== 'string') return '';
  return search
    .replace(/[,():"\\;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Builds a safe, valid PostgREST .or() filter string across multiple columns with ILIKE matching.
 *
 * @param columns - Array of column names or JSONB path expressions (e.g. ['title', 'summary', 'tool_info->>toolName'])
 * @param search - The raw user search query string
 * @returns Formatted PostgREST .or() filter clause, or null if search query is empty
 *
 * @example
 * buildSearchOrClause(['title', 'summary'], 'AI (ChatGPT), Agents')
 * // returns 'title.ilike.%AI ChatGPT Agents%,summary.ilike.%AI ChatGPT Agents%'
 */
export function buildSearchOrClause(
  columns: string[],
  search?: string | null
): string | null {
  const clean = sanitizeSearchTerm(search);
  if (!clean || !columns || columns.length === 0) return null;

  return columns
    .filter(Boolean)
    .map((col) => `${col}.ilike.%${clean}%`)
    .join(',');
}

/**
 * Builds an exact match or ILIKE clause for a single column safely.
 *
 * @param column - Column name
 * @param search - Search value
 * @returns Safe filter expression (e.g. "name.ilike.%query%") or null
 */
export function buildSafeColumnIlike(
  column: string,
  search?: string | null
): string | null {
  const clean = sanitizeSearchTerm(search);
  if (!clean || !column) return null;
  return `${column}.ilike.%${clean}%`;
}
