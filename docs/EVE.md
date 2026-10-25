# Isolated eve/NVIDIA bridge

Verified locally on 25 October 2026 with Node 24.22.1, eve 0.83.2 and the AI SDK provider interface 4.0.34. Package versions and resolved dependencies are recorded in package-lock.json. The eve-specific TypeScript project skips checking dependency declarations because this eve/AI SDK release has declaration errors under exactOptionalPropertyTypes; application source remains strictly checked. The original backend project retains full declaration checking.

The [versioned eve documentation](../node_modules/eve/docs/README.md), [custom-model configuration](https://eve.dev/docs/agent-config), [client contract](https://eve.dev/docs/guides/client/overview), and installed provider interface were inspected before implementation. A targeted override pins eve's external undici dependency to 8.12.2, fixing audit findings in its declared 8.10.2 dependency. npm install --ignore-scripts reports zero vulnerabilities after this override.

## Boundaries

agent/ contains the filesystem-defined eve investigator. Default tools are disabled: local discovery reports zero tools, skills, subagents and schedules. The model has no shell, file, web or provider-execution capabilities. apps/investigator/eve-provider.ts adapts the existing fixed-endpoint NVIDIA transport to eve's public model interface. It rejects native tools, assistant/tool history, repeat transport attempts, malformed output and substituted model identities. Only the scoped backend input envelope is forwarded; framework prompts cannot replace the locked NVIDIA instructions/schema.

Each call to apps/eve/model.ts creates a fresh authenticated eve session for one model step. The provider is selected only for step index zero; no internal follow-up model call is permitted. The original Investigator owns the complete 4-turn/10-tool/45-second investigation, executes schema-validated scoped evidence lookups, and persists findings/decisions through existing services. The client rejects unexpected model steps/tools, truncation, missing usage, redirects, malformed authority fields and oversized accepted event streams. Cancellation propagates to the service; failures trigger a bounded cancellation attempt and hold review. No automatic stream reconnect or inference retry is added.

The service's shared credential establishes an internal service identity only. It never grants a business role, customer identity or execution authority. The worker still needs its current authenticated SUPPORT session. MODEL_STEP audit data now records validated eve version, bridge version and session reference alongside measured token usage; recorded replay makes no inference call.

The local launcher binds 127.0.0.1:4010, disables development extensions/CLI telemetry/local trace export, and creates a random service secret at gitignored .local/eve-service-secret. It passes only selected host variables, NVIDIA credentials and the service secret to eve. Stripe keys are rejected. Workflow data lives in gitignored .eve/; zero retention is requested for completed sessions. This is a local development runtime, not a verified production build, deployment, restart-recovery or durable-storage configuration.

The Windows local Workflow world reported EPERM rename failures during zero-retention cleanup of synthetic smoke-session events. Treat local payload deletion as unverified: synthetic records may remain under .eve/. Resolve storage/retention behavior before using this development service with non-synthetic data or deploying it. No production data was used in these checks.

## Commands

Store NVIDIA_API_KEY and NVIDIA_MODEL_ID in gitignored .env.nvidia. With Node 24 active:

```powershell
npm.cmd run dev:eve
# In another terminal:
npm.cmd run eve:probe
npm.cmd run check
```

Host Node 22 is insufficient. Verified fallback commands:

```powershell
npx.cmd --yes --package=node@24.22.1 node --env-file=.env.nvidia scripts/eve-service.ts
npx.cmd --yes --package=node@24.22.1 node --env-file=.env.nvidia apps/eve/probe.ts
npx.cmd --yes --package=node@24.22.1 node node_modules/typescript/bin/tsc --noEmit -p apps/eve/tsconfig.json
npx.cmd --yes --package=node@24.22.1 node --test tests/*.test.ts apps/eve/tests/*.test.ts
```

The probe uses synthetic context only. It records the two real NVIDIA lookup/final responses through eve, their session references and measured usage, then checks the separate NVIDIA proposer returns null for an ambiguous unsupported request. Its gitignored record is .local/eve-nvidia-access.json. Earlier failed diagnostics can have unknown provider usage/cost. This probe is not substantive customer investigation, real Zetaris retrieval, provider state or an authority source.

## Remaining installation gate

apps/eve/assemble.ts composes this bridge and NVIDIA proposer with the existing authenticated worker assembly. The installer must still supply real Zetaris retrieval, authoritative provider reads and a dedicated SUPPORT account. The helper supplies no execution service. No default createRuntime module, queue activation or backend route was enabled. Zetaris instance documentation/credentials remain unavailable, as confirmed on 25 October. Provider writes stay disabled; no phase exit gate or evaluation result is claimed.

## Verification record

Final smoke check with the patched dependency: real NVIDIA lookup/final responses through eve completed in 3,218 ms, using 1,656 input and 43 output tokens. The separate ambiguous-request proposer returned null, using 385 input and 6 output tokens. Cost is unreported. The local service health is ready and unauthenticated session creation returns 401. Discovery reports zero tools. Full Node regression: 155 tests pass, including seven eve tests with multiple negative-path variants; server/console/e2e/eve TypeScript and the production console bundle pass. Browser UI was unchanged and browser tests were not rerun; their last verified run remains eight workflows. Changes are uncommitted pending user review.
