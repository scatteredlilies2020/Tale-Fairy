// Explicit local administration entry point; shares the server's verification
// and durable completion receipt. No provider calls or chat-open events.
import path from 'node:path';
import { createStorageMigrationManager, publicStorageMigration } from '../plugin/storage-migration.js';

const args = process.argv.slice(2);
const index = args.indexOf('--user-root');
if (index < 0 || !args[index + 1] || !path.isAbsolute(args[index + 1])) {
    console.error('Usage: node scripts/migrate-chat-storage.js --user-root <absolute ST user directory> [--recheck]');
    process.exitCode = 1;
} else {
    const manager = createStorageMigrationManager();
    const job = manager.start({ root: args[index + 1] }, { retry: args.includes('--recheck') });
    const result = await job.done;
    console.log(JSON.stringify(publicStorageMigration(result), null, 2));
    if (result.status !== 'complete') process.exitCode = 1;
}
