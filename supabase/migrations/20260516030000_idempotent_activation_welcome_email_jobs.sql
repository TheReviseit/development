-- Ensure activation welcome emails are queued at most once per user/product.
-- The application writes payload.activation_key as welcome_email:{product}:{user_id}.

DO $$
BEGIN
  IF to_regclass('public.background_jobs') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_background_jobs_welcome_activation_key
      ON public.background_jobs ((payload->>'activation_key'))
      WHERE type = 'SEND_WELCOME_EMAIL'
        AND payload ? 'activation_key'
        AND status IN ('pending', 'processing', 'completed', 'failed');
  END IF;
END $$;
