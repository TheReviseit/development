"""
Subscription Events Migration Runner
=====================================
Applies migration 100_subscription_events.sql to Supabase.

Usage:
    python migrations/run_migration.py                          # interactive
    python migrations/run_migration.py --apply                  # auto-apply
    python migrations/run_migration.py --print                  # print SQL only

If run without --apply, it prints the SQL and instructions for manual
execution via the Supabase Dashboard SQL Editor.
"""

import os
import sys
import subprocess
import argparse

MIGRATION_FILE = os.path.join(
    os.path.dirname(__file__),
    '100_subscription_events.sql'
)

SUPABASE_MIGRATION_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    'supabase', 'migrations'
)


def print_sql():
    """Print the migration SQL to stdout."""
    if not os.path.exists(MIGRATION_FILE):
        print(f"ERROR: Migration file not found: {MIGRATION_FILE}")
        sys.exit(1)

    with open(MIGRATION_FILE, 'r') as f:
        print(f.read())


def apply_via_psql():
    """
    Attempt to apply via psql using Supabase connection string.
    Requires SUPABASE_DB_PASSWORD env var or psql interactive prompt.
    """
    project_ref = 'zduljgxvissyqlxierql'
    password = os.getenv('SUPABASE_DB_PASSWORD')

    if not password:
        print("SUPABASE_DB_PASSWORD not set.")
        print()
        print("To run this migration:")
        print("  1. Open https://supabase.com/dashboard/project/zduljgxvissyqlxierql")
        print("  2. Go to SQL Editor")
        print("  3. Paste the contents of:")
        print(f"     {MIGRATION_FILE}")
        print("  4. Click 'Run'")
        print()
        print("Or set SUPABASE_DB_PASSWORD and re-run with --apply.")
        print("You can find the DB password in:")
        print("  Project Settings > Database > Connection string > direct")
        return False

    # Build connection string (pooler mode for safety)
    conn_string = (
        f"postgresql://postgres.{project_ref}:{password}"
        f"@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
    )

    if not os.path.exists(MIGRATION_FILE):
        print(f"ERROR: Migration file not found: {MIGRATION_FILE}")
        return False

    print(f"Applying migration: {MIGRATION_FILE}")
    result = subprocess.run(
        ['psql', conn_string, '-f', MIGRATION_FILE],
        capture_output=True, text=True
    )

    if result.returncode == 0:
        print("Migration applied successfully!")
        print(result.stdout[-500:] if len(result.stdout) > 500 else result.stdout)
        return True
    else:
        print("Migration FAILED:")
        print(result.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(description='Run subscription events migration')
    parser.add_argument('--apply', action='store_true', help='Apply migration')
    parser.add_argument('--print', action='store_true', help='Print SQL only')
    args = parser.parse_args()

    print("=" * 60)
    print("Migration 100: Subscription Events (Event Sourcing)")
    print("=" * 60)
    print()

    if args.print:
        print_sql()
        return

    if args.apply:
        success = apply_via_psql()
        sys.exit(0 if success else 1)

    # Interactive mode
    print_sql()
    print()
    print("-" * 60)
    print()
    response = input("Apply this migration now? (y/N): ").strip().lower()
    if response == 'y':
        success = apply_via_psql()
        sys.exit(0 if success else 1)
    else:
        print("Migration SQL printed above. Apply manually via Supabase SQL Editor.")
        sys.exit(0)


if __name__ == '__main__':
    main()
