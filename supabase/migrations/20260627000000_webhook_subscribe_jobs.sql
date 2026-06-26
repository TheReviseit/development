-- Webhook subscribe job queue for async Meta WABA subscription after embedded signup.

ALTER TABLE public.connected_whatsapp_accounts
  ADD COLUMN IF NOT EXISTS webhook_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.connected_whatsapp_accounts
  DROP CONSTRAINT IF EXISTS connected_whatsapp_accounts_webhook_status_check;

ALTER TABLE public.connected_whatsapp_accounts
  ADD CONSTRAINT connected_whatsapp_accounts_webhook_status_check
  CHECK (webhook_status IN ('pending', 'active', 'failed'));

CREATE INDEX IF NOT EXISTS idx_connected_whatsapp_accounts_webhook_status
  ON public.connected_whatsapp_accounts (webhook_status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_subscribe_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waba_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  whatsapp_account_id uuid NOT NULL REFERENCES public.connected_whatsapp_accounts(id) ON DELETE CASCADE,
  facebook_account_id uuid NOT NULL REFERENCES public.connected_facebook_accounts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  last_error text NULL,
  correlation_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_jobs_pending
  ON public.whatsapp_webhook_subscribe_jobs (status, next_retry_at)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS ux_whatsapp_webhook_jobs_active_waba
  ON public.whatsapp_webhook_subscribe_jobs (waba_id)
  WHERE status = 'pending';

COMMENT ON TABLE public.whatsapp_webhook_subscribe_jobs IS
  'Durable queue for Meta WABA webhook subscription after embedded signup.';
