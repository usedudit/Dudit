-- Run in Supabase SQL Editor after deploying a performance migration.
-- Keep the same observation window used by the previous export.

SELECT
  r.rolname,
  s.calls,
  round(s.mean_exec_time::numeric, 2) AS mean_ms,
  round(s.max_exec_time::numeric, 2) AS max_ms,
  round(s.total_exec_time::numeric, 2) AS total_ms,
  s.rows,
  round(
    100.0 * s.shared_blks_hit / NULLIF(s.shared_blks_hit + s.shared_blks_read, 0),
    2
  ) AS cache_hit_pct,
  s.query
FROM pg_stat_statements s
JOIN pg_roles r ON r.oid = s.userid
WHERE s.query NOT ILIKE '%pg_stat_statements%'
ORDER BY s.total_exec_time DESC
LIMIT 200;
