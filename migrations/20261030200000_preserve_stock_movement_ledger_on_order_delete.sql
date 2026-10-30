BEGIN;

-- Deleting an order must not cascade-delete its inventory history. Preserve
-- the movement and clear only its optional order reference.
ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_order_id_fkey;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id)
  ON DELETE SET NULL;

-- Attachment records point to R2 objects. Require explicit attachment cleanup
-- before deleting the order so a cascade cannot orphan the object in storage.
ALTER TABLE public.order_attachments
  DROP CONSTRAINT IF EXISTS order_attachments_order_id_fkey;

ALTER TABLE public.order_attachments
  ADD CONSTRAINT order_attachments_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id)
  ON DELETE RESTRICT;

COMMIT;
