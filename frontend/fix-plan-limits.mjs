import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://zduljgxvissyqlxierql.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdWxqZ3h2aXNzeXFseGllcnFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTExNTc4MiwiZXhwIjoyMDgwNjkxNzgyfQ.BL2yMSW5ijS8ObGUEbgsLbASC0GxhtXp_QP4ceEIxKw',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Starter plan ID for shop domain
const STARTER_PLAN_ID = '660cdf19-9fb8-4882-a24f-2dc2ce961a63';

console.log('Updating starter plan create_product limit: 10 → 50...');

const { data, error } = await supabase
  .from('plan_features')
  .update({ hard_limit: 50, soft_limit: 40 })
  .eq('plan_id', STARTER_PLAN_ID)
  .eq('feature_key', 'create_product')
  .select();

if (error) {
  console.error('ERROR:', error.message);
} else {
  console.log('✅ Updated:', data);
  console.log('Starter plan now allows 50 products (was 10)');
}
