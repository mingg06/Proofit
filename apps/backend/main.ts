import { config } from './config.ts';
import { Store } from './database.ts';
import { Foundation } from './foundation.ts';
import { createApi } from './http.ts';
const settings = config();
const store = new Store(settings.databasePath);
store.migrate();
const server = createApi(new Foundation(store), settings.origin);
server.listen(settings.port, '127.0.0.1', () => console.log('PROOFIT foundation API: ' + settings.origin + ' (execution disabled)'));
function shutdown() { server.close(() => { store.close(); }); }
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
