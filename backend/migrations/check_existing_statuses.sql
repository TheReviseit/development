-- Query to check existing subscription statuses
SELECT
    status,
    COUNT(*) as count,
    MIN(created_at) as first_created,
    MAX(created_at) as last_created
FROM subscriptions
GROUP BY status
ORDER BY count DESC;
