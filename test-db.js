const { Client } = require('pg');

async function test() {
  const url = process.env.DATABASE_URL || "postgresql://postgres.okpgdycpqmadgevctupl:pa4ahxh1uj!@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres";
  const client = new Client(url);
  try {
    await client.connect();
    const res = await client.query('SELECT NOW()');
    console.log("Connected!", res.rows[0]);
  } catch (err) {
    console.error("Error connecting:", err.message);
  } finally {
    await client.end();
  }
}

test();
