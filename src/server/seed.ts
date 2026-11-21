import 'dotenv/config';
import { ensureInitialOwnerFromEnv, getDb } from './db';

async function main() {
  getDb();
  const result = await ensureInitialOwnerFromEnv();
  if (result.seeded) {
    console.log(`Initial Owner seeded successfully (${result.email}).`);
  } else if (!process.env.ADMIN_INITIAL_PASSWORD) {
    console.log(
      'ADMIN_INITIAL_PASSWORD tidak diatur. Gunakan form aktivasi Owner pertama di path admin rahasia atau atur env ADMIN_INITIAL_PASSWORD lalu jalankan ulang seed.'
    );
  } else {
    console.log('Owner account already exists. Seed skipped.');
  }
}

main().catch((err) => {
  console.error('Admin seed failed:', err instanceof Error ? err.message : 'Unknown error');
  process.exit(1);
});
