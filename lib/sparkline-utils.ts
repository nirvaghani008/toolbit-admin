import { supabase } from './supabase';

interface SparklineCacheEntry {
  timestamp: number;
  data: any;
}

const cache = new Map<string, SparklineCacheEntry>();
const CACHE_TTL_MS = 15_000; // 15-second cache for lightning-fast navigation & tab switching

/**
 * Fetches 100% REAL sparkline trends for multiple statuses (or all) of a table in a single query.
 * Grouped strictly by exact YYYY-MM-DD dates without any fake or generated data.
 * 
 * @param table Table name
 * @param statuses Array of status strings (plus null/undefined for "all" trend)
 * @param dateColumn The date column to filter by (default: 'updated_at')
 * @param days Number of lookback days (default: 7)
 * @param forceRefresh Bypass in-memory cache
 */
export async function fetchSparklinesForStatuses(
  table: string,
  statuses: (string | null)[],
  dateColumn: string = 'updated_at',
  days: number = 7,
  forceRefresh: boolean = false
): Promise<Record<string, number[]>> {
  const cacheKey = `sparkline:${table}:${statuses.join(',')}:${dateColumn}:${days}`;
  if (!forceRefresh && cache.has(cacheKey)) {
    const entry = cache.get(cacheKey)!;
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return entry.data;
    }
  }

  // Generate exact date keys for the last N days in YYYY-MM-DD format
  const dateKeys: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dateKeys.push(d.toISOString().slice(0, 10));
  }

  const results: Record<string, number[]> = {};
  const statusMap: Record<string, Record<string, number>> = {};

  statuses.forEach((s) => {
    const key = s === null ? 'all' : s;
    results[key] = new Array(days).fill(0);
    statusMap[key] = {};
    dateKeys.forEach((dk) => {
      statusMap[key][dk] = 0;
    });
  });

  try {
    const startDateISO = dateKeys[0] + 'T00:00:00.000Z';
    const needsStatus = statuses.some((s) => s !== null);
    const selectCols = needsStatus ? `${dateColumn}, status` : dateColumn;

    // Query 100% real records modified/created since startDateISO from Supabase
    const { data, error } = await supabase
      .from(table)
      .select(selectCols)
      .gte(dateColumn, startDateISO)
      .order(dateColumn, { ascending: false })
      .limit(10000);

    if (error) throw error;

    if (data) {
      (data as any[]).forEach((row: any) => {
        if (!row[dateColumn]) return;
        const rowDateStr = new Date(row[dateColumn]).toISOString().slice(0, 10);

        if (statusMap['all'] && statusMap['all'][rowDateStr] !== undefined) {
          statusMap['all'][rowDateStr]++;
        }

        if (needsStatus && row['status']) {
          const st = String(row['status']);
          if (statusMap[st] && statusMap[st][rowDateStr] !== undefined) {
            statusMap[st][rowDateStr]++;
          }
        }
      });

      // Populate ordered 7-day array directly from real date counts
      Object.keys(statusMap).forEach((k) => {
        results[k] = dateKeys.map((dk) => statusMap[k][dk] || 0);
      });
    }

    cache.set(cacheKey, { timestamp: Date.now(), data: results });
  } catch (err) {
    console.warn(`Error fetching real sparklines for ${table}:`, err);
  }

  return results;
}

/**
 * Fetches both exact status counts and 100% real date sparkline trends directly from Supabase.
 * Executes all count queries and sparkline queries concurrently in parallel with zero RPC overhead.
 * 
 * @param table Table name
 * @param statuses Array of status strings to query
 * @param dateColumn Date column to filter/group by (default: 'updated_at')
 * @param days Lookback period in days (default: 7)
 * @param forceRefresh Bypass cache
 */
export async function fetchTableStatsAndSparklines(
  table: string,
  statuses: string[],
  dateColumn: string = 'updated_at',
  days: number = 7,
  forceRefresh: boolean = false
): Promise<{ counts: Record<string, number>; sparklines: Record<string, number[]> }> {
  const cacheKey = `stats_sparklines:${table}:${statuses.join(',')}:${dateColumn}:${days}`;
  if (!forceRefresh && cache.has(cacheKey)) {
    const entry = cache.get(cacheKey)!;
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return entry.data;
    }
  }

  const counts: Record<string, number> = {};

  try {
    // Execute total count, individual status counts, and sparkline query in parallel
    const [totalRes, statusResults, realSparklines] = await Promise.all([
      // 1. Total count (zero body bytes, HEAD count only)
      supabase.from(table).select('*', { count: 'exact', head: true }),

      // 2. Status counts (zero body bytes, HEAD count only)
      Promise.all(
        statuses.map(async (s) => {
          const { count } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true })
            .eq('status', s);
          return { status: s, count: count || 0 };
        })
      ),

      // 3. 7-day sparklines (minimal select: dateColumn, status)
      fetchSparklinesForStatuses(table, [null, ...statuses], dateColumn, days, forceRefresh)
    ]);

    counts['total'] = totalRes.count || 0;
    statusResults.forEach(({ status, count }) => {
      counts[status] = count;
    });

    const result = {
      counts,
      sparklines: realSparklines
    };

    cache.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  } catch (err) {
    console.warn(`Error fetching stats and sparklines for ${table}:`, err);
    return {
      counts: {},
      sparklines: {}
    };
  }
}
