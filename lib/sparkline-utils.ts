import { supabase } from './supabase';

/**
 * Fetches 100% REAL sparkline trends for multiple statuses (or all) of a table in a single query.
 * Grouped strictly by exact YYYY-MM-DD dates without any fake or generated data.
 * 
 * @param table Table name
 * @param statuses Array of status strings (plus null/undefined for "all" trend)
 * @param dateColumn The date column to filter by (default: 'updated_at')
 * @param days Number of lookback days (default: 7)
 */
export async function fetchSparklinesForStatuses(
  table: string,
  statuses: (string | null)[],
  dateColumn: string = 'updated_at',
  days: number = 7
): Promise<Record<string, number[]>> {
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
      .limit(5000);

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
  } catch (err) {
    console.warn(`Error fetching real sparklines for ${table}:`, err);
  }

  return results;
}

/**
 * Fetches both exact status counts and 100% real date sparkline trends directly from Supabase.
 * 
 * @param table Table name
 * @param statuses Array of status strings to query
 * @param dateColumn Date column to filter/group by (default: 'updated_at')
 * @param days Lookback period in days (default: 7)
 */
export async function fetchTableStatsAndSparklines(
  table: string,
  statuses: string[],
  dateColumn: string = 'updated_at',
  days: number = 7
): Promise<{ counts: Record<string, number>; sparklines: Record<string, number[]> }> {
  try {
    const { data, error } = await supabase.rpc('get_table_stats_and_sparklines', {
      tbl_name: table,
      status_list: statuses,
      date_col: dateColumn,
      days_back: days
    });

    if (!error && data?.counts && data?.sparklines) {
      return {
        counts: data.counts,
        sparklines: data.sparklines
      };
    }
  } catch {
    // fallback to direct real query below
  }

  // 100% REAL DATABASE QUERY FALLBACK
  const fallbackCounts: Record<string, number> = {};

  try {
    // 1. Get exact total count from database
    const { count: totalCount } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    fallbackCounts['total'] = totalCount || 0;

    // 2. Get exact status counts from database
    await Promise.all(
      statuses.map(async (s) => {
        const { count } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq('status', s);
        fallbackCounts[s] = count || 0;
      })
    );
  } catch (err) {
    console.warn(`Error fetching count stats for ${table}:`, err);
  }

  // 3. Get 100% real daily date trends from database
  const realSparklines = await fetchSparklinesForStatuses(table, [null, ...statuses], dateColumn, days);

  return {
    counts: fallbackCounts,
    sparklines: realSparklines
  };
}
