-- ============================================================
-- Voice Agents Phase 2 booking writes
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS booking_status TEXT DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pay_at_venue',
  ADD COLUMN IF NOT EXISTS reserved_until TIMESTAMPTZ;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_source_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_source_check
  CHECK (source IN ('ai', 'manual', 'voice'));

CREATE INDEX IF NOT EXISTS idx_appointments_voice_phone_reference
  ON public.appointments (user_id, customer_phone, booking_id);

CREATE INDEX IF NOT EXISTS idx_appointments_voice_phone_starts
  ON public.appointments (user_id, customer_phone, starts_at);

CREATE INDEX IF NOT EXISTS idx_appointments_voice_idempotency
  ON public.appointments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DROP FUNCTION IF EXISTS public.reserve_booking_slot(TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS public.reserve_booking_slot(
  TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.reserve_booking_slot(
    p_user_id TEXT,
    p_provider_id UUID,
    p_starts_at TIMESTAMPTZ,
    p_ends_at TIMESTAMPTZ,
    p_idempotency_key TEXT,
    p_customer_name TEXT DEFAULT 'Voice Customer',
    p_customer_phone TEXT DEFAULT 'unknown',
    p_service TEXT DEFAULT 'Appointment',
    p_source TEXT DEFAULT 'manual',
    p_timezone TEXT DEFAULT 'Asia/Kolkata',
    p_service_id UUID DEFAULT NULL,
    p_staff_id UUID DEFAULT NULL,
    p_provider_name TEXT DEFAULT NULL,
    p_service_price NUMERIC DEFAULT 0,
    p_notes TEXT DEFAULT NULL,
    p_fingerprint TEXT DEFAULT NULL,
    p_cancel_token TEXT DEFAULT NULL,
    p_booking_status TEXT DEFAULT 'confirmed',
    p_payment_status TEXT DEFAULT 'pay_at_venue'
) RETURNS UUID AS $$
DECLARE
    v_booking_id UUID;
    v_existing_id UUID;
    v_lock_key BIGINT;
    v_duration_minutes INTEGER;
BEGIN
    SELECT id INTO v_existing_id
    FROM public.appointments
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN v_existing_id;
    END IF;

    v_duration_minutes := GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM (p_ends_at - p_starts_at)) / 60)::INTEGER
    );
    v_lock_key := hashtext(COALESCE(p_staff_id::TEXT, p_provider_id::TEXT, p_user_id) || ':' || p_starts_at::TEXT);

    IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
        RAISE EXCEPTION 'Slot temporarily locked - please retry';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.appointments
        WHERE user_id = p_user_id
          AND status NOT IN ('cancelled')
          AND tstzrange(starts_at, ends_at) && tstzrange(p_starts_at, p_ends_at)
          AND (
              (p_staff_id IS NULL AND p_provider_id IS NULL)
              OR staff_id IS NULL
              OR (p_staff_id IS NOT NULL AND staff_id = p_staff_id)
              OR (p_provider_id IS NOT NULL AND provider_id = p_provider_id)
          )
    ) THEN
        RAISE EXCEPTION 'Time slot not available';
    END IF;

    INSERT INTO public.appointments (
        user_id,
        customer_name,
        customer_phone,
        date,
        time,
        duration,
        status,
        source,
        service,
        notes,
        starts_at,
        ends_at,
        timezone,
        provider_id,
        provider_name,
        service_id,
        service_price,
        staff_id,
        booking_status,
        payment_status,
        reserved_until,
        idempotency_key,
        fingerprint,
        cancel_token
    ) VALUES (
        p_user_id,
        p_customer_name,
        p_customer_phone,
        p_starts_at::DATE,
        p_starts_at::TIME,
        v_duration_minutes,
        'confirmed',
        p_source,
        p_service,
        p_notes,
        p_starts_at,
        p_ends_at,
        p_timezone,
        p_provider_id,
        p_provider_name,
        p_service_id,
        p_service_price,
        p_staff_id,
        p_booking_status,
        p_payment_status,
        NULL,
        p_idempotency_key,
        p_fingerprint,
        p_cancel_token
    )
    RETURNING id INTO v_booking_id;

    RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS public.cancel_voice_booking(TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.cancel_voice_booking(
    p_user_id TEXT,
    p_booking_reference TEXT,
    p_customer_phone TEXT,
    p_cancel_idempotency_key TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_booking public.appointments%ROWTYPE;
BEGIN
    SELECT *
    INTO v_booking
    FROM public.appointments
    WHERE user_id = p_user_id
      AND (booking_id = p_booking_reference OR id::TEXT = p_booking_reference)
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;

    IF v_booking.customer_phone <> p_customer_phone THEN
        RAISE EXCEPTION 'Booking does not belong to caller phone';
    END IF;

    UPDATE public.appointments
    SET status = 'cancelled',
        booking_status = 'cancelled',
        updated_at = NOW()
    WHERE id = v_booking.id;

    RETURN v_booking.id;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS public.reschedule_voice_booking(
  TEXT, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.reschedule_voice_booking(
    p_old_booking_reference TEXT,
    p_old_customer_phone TEXT,
    p_reschedule_idempotency_key TEXT,
    p_user_id TEXT,
    p_provider_id UUID,
    p_starts_at TIMESTAMPTZ,
    p_ends_at TIMESTAMPTZ,
    p_idempotency_key TEXT,
    p_customer_name TEXT DEFAULT NULL,
    p_customer_phone TEXT DEFAULT NULL,
    p_service TEXT DEFAULT NULL,
    p_source TEXT DEFAULT 'voice',
    p_timezone TEXT DEFAULT 'Asia/Kolkata',
    p_service_id UUID DEFAULT NULL,
    p_staff_id UUID DEFAULT NULL,
    p_provider_name TEXT DEFAULT NULL,
    p_service_price NUMERIC DEFAULT 0,
    p_notes TEXT DEFAULT NULL,
    p_fingerprint TEXT DEFAULT NULL,
    p_cancel_token TEXT DEFAULT NULL,
    p_booking_status TEXT DEFAULT 'confirmed',
    p_payment_status TEXT DEFAULT 'pay_at_venue'
) RETURNS JSONB AS $$
DECLARE
    v_old public.appointments%ROWTYPE;
    v_new_id UUID;
BEGIN
    SELECT *
    INTO v_old
    FROM public.appointments
    WHERE user_id = p_user_id
      AND (booking_id = p_old_booking_reference OR id::TEXT = p_old_booking_reference)
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;

    IF v_old.customer_phone <> p_old_customer_phone THEN
        RAISE EXCEPTION 'Booking does not belong to caller phone';
    END IF;

    IF v_old.status = 'cancelled' THEN
        RAISE EXCEPTION 'Booking is already cancelled';
    END IF;

    v_new_id := public.reserve_booking_slot(
        p_user_id,
        p_provider_id,
        p_starts_at,
        p_ends_at,
        p_idempotency_key,
        COALESCE(p_customer_name, v_old.customer_name),
        COALESCE(p_customer_phone, v_old.customer_phone),
        COALESCE(p_service, v_old.service, 'Appointment'),
        p_source,
        p_timezone,
        COALESCE(p_service_id, v_old.service_id),
        COALESCE(p_staff_id, v_old.staff_id),
        COALESCE(p_provider_name, v_old.provider_name),
        COALESCE(p_service_price, v_old.service_price, 0),
        COALESCE(p_notes, v_old.notes),
        p_fingerprint,
        p_cancel_token,
        p_booking_status,
        p_payment_status
    );

    UPDATE public.appointments
    SET status = 'cancelled',
        booking_status = 'cancelled',
        updated_at = NOW(),
        notes = COALESCE(notes, '') || E'\nRescheduled to appointment ' || v_new_id::TEXT
    WHERE id = v_old.id;

    RETURN jsonb_build_object(
        'old_appointment_id', v_old.id,
        'new_appointment_id', v_new_id
    );
END;
$$ LANGUAGE plpgsql;
