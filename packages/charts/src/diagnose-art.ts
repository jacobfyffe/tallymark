import 'dotenv/config';
import { query, closePool } from '@tallymark/db';

// 1. What type is the raw column?
const t = await query(`SELECT data_type FROM information_schema.columns WHERE table_name='plays' AND column_name='raw'`);
console.log('raw column type:', t.rows[0]?.data_type);

// 2. Does the exact extraction the chart query uses return a URL?
const e = await query(`SELECT raw -> 'track' -> 'album' -> 'images' -> 0 ->> 'url' AS url FROM plays LIMIT 3`);
console.log('extracted URLs:', e.rows.map(r => r.url));

await closePool();