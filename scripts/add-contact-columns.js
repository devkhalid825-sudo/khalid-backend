require('dotenv').config({ path: 'C:/Users/pc/Desktop/Final-elipse/elipse-backend/.env' });
const mysql = require('mysql2/promise');

(async () => {
  const url = new URL(process.env.DATABASE_URL);
  const c = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
  });
  const [cols] = await c.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Contact' AND COLUMN_NAME IN ('pillars','budget')",
    [url.pathname.replace(/^\//, '')]
  );
  console.log('already exist:', JSON.stringify(cols.map((r) => r.COLUMN_NAME)));
  if (cols.length < 2) {
    await c.query(
      'ALTER TABLE Contact ADD COLUMN pillars VARCHAR(191) NULL AFTER interest, ADD COLUMN budget VARCHAR(191) NULL AFTER pillars'
    );
    console.log('columns added');
  } else {
    console.log('columns already present - no change');
  }
  const [x] = await c.query('SHOW COLUMNS FROM Contact');
  console.log(
    'FINAL:',
    x
      .filter((k) => ['pillars', 'budget'].includes(k.Field))
      .map((k) => k.Field + ' ' + k.Type + (k.Null === 'NO' ? ' NOT NULL' : ' NULL'))
      .join(' | ')
  );
  await c.end();
})().catch((e) => {
  console.error('ERR:', e.message);
});