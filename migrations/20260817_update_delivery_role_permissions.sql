-- Update delivery role permissions in roles table
UPDATE roles
SET permissions = jsonb_set(
  jsonb_set(
    jsonb_set(
      permissions,
      '{orders}',
      '{"view": true, "create": false, "edit": false, "delete": false, "cancel": false, "can_apply_discount": false, "can_add_delivery": false, "can_refund": false}'::jsonb
    ),
    '{customers}',
    '{"view": true, "create": false, "edit": false, "delete": false}'::jsonb
  ),
  '{dashboard}',
  '{"view": true}'::jsonb
)
WHERE id = 'delivery';
