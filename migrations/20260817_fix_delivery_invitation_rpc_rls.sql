-- Fix for the invitation acceptance RPC.
-- RLS remains enabled and authenticated/anon keep no table privileges.
-- FORCE RLS prevented the SECURITY DEFINER function owner from consuming a
-- token because delivery_driver_invitations intentionally has no public policy.
ALTER TABLE public.delivery_driver_invitations NO FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.delivery_driver_invitations FROM anon, authenticated;
