BEGIN;

UPDATE public.plans
SET limits_json = (limits_json - 'recurring_plans' - 'active_subscriptions'),
    updated_at = NOW()
WHERE limits_json ? 'recurring_plans'
   OR limits_json ? 'active_subscriptions';

COMMIT;
