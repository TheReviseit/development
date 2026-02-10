-- Manual Username Setup
-- Sets username for user DYsTJwhVhjeo9NEf9qNMoR5wh1V2

UPDATE users
SET 
    username = 'flowauxis',
    username_lower = 'flowauxis',
    username_status = 'active',
    claimed_at = NOW(),
    username_change_count = 0
WHERE firebase_uid = 'DYsTJwhVhjeo9NEf9qNMoR5wh1V2';

-- Verify the update
SELECT 
    firebase_uid,
    username,
    username_status,
    claimed_at
FROM users
WHERE firebase_uid = 'DYsTJwhVhjeo9NEf9qNMoR5wh1V2';
