-- Keep WhatsApp phone activation state compatible with the application code.

DO $$
BEGIN
  IF to_regclass('public.connected_phone_numbers') IS NOT NULL THEN
    ALTER TABLE public.connected_phone_numbers
      ADD COLUMN IF NOT EXISTS can_send_messages boolean NOT NULL DEFAULT true;

    COMMENT ON COLUMN public.connected_phone_numbers.can_send_messages IS
      'Whether this connected WhatsApp phone number is currently allowed to send outbound messages.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
