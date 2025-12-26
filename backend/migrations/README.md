# Database Migrations

## Running Migrations

### In Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy the contents of the migration file
4. Paste and execute

### Via Command Line (if you have direct database access)

```bash
psql -h your-project.supabase.co -U postgres -d postgres -f create_push_subscriptions.sql
```

## Current Migrations

### create_push_subscriptions.sql

- **Purpose**: Create table for storing FCM push notification tokens
- **Status**: ⏳ Pending
- **Dependencies**: None
- **Run Date**: TBD

## Migration Order

Migrations should be run in the order they are listed above.
