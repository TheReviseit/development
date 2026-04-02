const { Client } = require('pg');

async function backfill() {
  const cn = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', 'postgresql://postgres:').replace('.supabase.co', ':5432/postgres');
  
  if (!cn) {
    console.error("No database URL found in environment.");
    return;
  }
  
  const client = new Client({ connectionString: cn });
  try {
    await client.connect();
    console.log("Connected to DB.");

    console.log("1. Adding payment_status column and indexing...");
    await client.query(`
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending';
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_id VARCHAR(255);
        CREATE INDEX IF NOT EXISTS idx_orders_payment_status_created ON orders(payment_status, created_at);
    `);
    
    console.log("2. Running backfill strategy for existing completed orders...");
    const res = await client.query(`
        UPDATE orders 
        SET payment_status = 'captured' 
        WHERE status IN ('completed', 'processing', 'confirmed')
        AND payment_status = 'pending';
    `);
    console.log(`✅ Backfill applied. Rows updated: ${res.rowCount}`);
    
  } catch (error) {
    console.error("❌ DB Update failed:", error);
  } finally {
    await client.end();
  }
}

backfill();
