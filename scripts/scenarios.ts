import { actionSchema } from '../packages/contracts/index.ts';
import { scenarios } from '../fixtures/development.ts';
for (const scenario of scenarios) {
  if (scenario.confirmed !== null) actionSchema.parse(scenario.confirmed);
  console.log(JSON.stringify({ ...scenario, executionEnabled: false }));
}
