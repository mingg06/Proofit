import { config } from '../apps/backend/config.ts';
import { Store } from '../apps/backend/database.ts';
const store = new Store(config().databasePath);
try { store.migrate(); console.log('Database migrations applied.'); } finally { store.close(); }
