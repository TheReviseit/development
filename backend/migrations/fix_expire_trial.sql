-- Fix the expire_trial function to avoid ambiguous status column
-- Run this in Supabase SQL editor

CREATE OR REPLACE FUNCTION expire_trial(
    p_trial_id UUID,
    p_cancellation_reason TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE (
    success BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_trial free_trials%ROWTYPE;
    v_new_status TEXT := 'expired';
    v_previous_status TEXT;
BEGIN
    -- Get current trial
    SELECT * INTO v_trial
    FROM free_trials
    WHERE id = p_trial_id;

    IF v_trial IS NULL THEN
        success := FALSE;
        error_message := 'Trial not found';
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Store previous status before update
    v_previous_status := v_trial.status;

    -- Idempotency check
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM trial_events
            WHERE trial_id = p_trial_id
            AND idempotency_key = p_idempotency_key
        ) THEN
            success := TRUE;
            error_message := NULL;
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;

    -- Update trial status
    UPDATE free_trials
    SET status = v_new_status,
        cancellation_reason = COALESCE(p_cancellation_reason, 'Trial period ended'),
        updated_at = NOW()
    WHERE id = p_trial_id;

    -- Record event with explicit status
    INSERT INTO trial_events (
        trial_id,
        event_type,
        event_data,
        triggered_by,
        idempotency_key
    ) VALUES (
        p_trial_id,
        'trial.expired',
        jsonb_build_object(
            'previous_status', v_previous_status,
            'reason', COALESCE(p_cancellation_reason, 'Trial period ended')
        ),
        'system',
        p_idempotency_key
    );

    success := TRUE;
    error_message := NULL;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;