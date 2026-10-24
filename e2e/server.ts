import { recordedOutcomes } from "./outcome-fixtures.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Store } from "../apps/backend/database.ts";
import { Foundation } from "../apps/backend/foundation.ts";
import { prepareSeed } from "../apps/backend/seed.ts";
import { createApi } from "../apps/backend/http.ts";
await mkdir(".local/e2e", { recursive: true });
const store = new Store(".local/e2e/" + randomUUID() + ".sqlite");
store.migrate();
const seed = await prepareSeed();
seed.apply(store);
await writeFile(
  ".local/e2e-accounts.json",
  JSON.stringify(
    seed.credentials.map(({ email, password }) => ({ email, password })),
  ),
  { mode: 0o600 },
);
const outcomes = await recordedOutcomes(store, seed.credentials);
await writeFile(".local/e2e-outcomes.json", JSON.stringify(outcomes), {
  mode: 0o600,
});
const server = createApi(new Foundation(store), "http://127.0.0.1:3100");
server.listen(3100, "127.0.0.1", () =>
  console.log(
    "Isolated browser-test server ready on loopback port 3100; execution disabled",
  ),
);
const close = () => server.close(() => store.close());
process.once("SIGINT", close);
process.once("SIGTERM", close);
