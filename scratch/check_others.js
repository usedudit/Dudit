const { execSync } = require('child_process');

const out = execSync(
  'npx supabase logs --remote=qxuqjkpzargimmbyodnx --file scratch/fetch_all.sql --output-format json',
  { maxBuffer: 50 * 1024 * 1024, encoding: 'utf-8' }
);

const idx = out.indexOf('[');
const logs = JSON.parse(out.substring(idx));

const others = {};
for (const row of logs) {
  const parts = (row.event_message || '').split(' | ');
  const fullUrl = parts[2] || '';
  let urlPath = fullUrl;
  let query = '';
  try {
    const parsed = new URL(fullUrl);
    urlPath = parsed.pathname;
    query = parsed.search;
  } catch {}

  const isKnown = 
    urlPath.includes('application_access_logs') ||
    urlPath.includes('usage_counters') ||
    urlPath.includes('subscriptions') ||
    (urlPath.includes('partners') && query.includes('order_flow')) ||
    (urlPath.includes('stores') && query.includes('phone')) ||
    urlPath.includes('/auth/v1/user') ||
    urlPath.includes('get_secure_runtime_status') ||
    urlPath.includes('notification_scheduled_jobs') ||
    urlPath.includes('/orders') ||
    urlPath.includes('/products') ||
    urlPath.includes('/services') ||
    urlPath.includes('/advertisements') ||
    urlPath.includes('/campaigns') ||
    urlPath.includes('/promotions');

  if (!isKnown) {
    const k = `${urlPath} ${query.substring(0, 50)}`;
    others[k] = (others[k] || 0) + 1;
  }
}

console.log('=== OTHER ENDPOINTS (DETAIL) ===');
console.table(
  Object.entries(others)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([endpoint, count]) => ({ endpoint, count }))
);

