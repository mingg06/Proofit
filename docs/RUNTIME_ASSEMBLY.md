# Prepared runtime assembly

Update, 25 October: the isolated eve/NVIDIA bridge is now implemented and its synthetic live two-turn check passes. apps/eve/assemble.ts prepares review-only wiring with the existing support authentication. It still requires installation-supplied retrieval/provider reads; it does not activate the worker. See [eve boundaries and verified commands](EVE.md). Earlier preparation notes below describe the original state.

Two tested helpers compose the existing services without introducing another approval or operation state machine. They do not enable default provider routes or prove remote compatibility.

## Investigation worker

apps/worker/assemble.ts exports assembleRuntime(ports, account), which returns the RuntimeFactory consumed by apps/worker/main.ts. ports contains the verified eve InvestigationModel, NVIDIA ProposingModel, scoped EvidenceRetrieval, isolated ProviderReader and optional ExecutionService. The account contains the server-owned support email/password, supplied privately at installation.

The factory authenticates through Foundation.auth.login and checks the current stored SUPPORT role. A customer/refund-approver identity is rejected and its just-created session revoked. It returns only the named ports and opaque staff session; passwords are not copied into runtime output or model context. Account deactivation/session expiry remains enforced on every later scoped operation. Controlled ports can be assembled in tests but the production worker still rejects controlled model provenance.

Once access is provided, the agent will connect a verified eve/NVIDIA bridge and the instance-specific ZetarisQueryClient here. NVIDIA proposer creation, ZetarisEvidenceRetrieval(config, client), ExecutorClient(loopbackOrigin, serviceSecret), and the orchestration are already implemented. The assembly helper does not guess those missing provider contracts or claim that the raw NVIDIA transport is an eve runtime. You do not need to write this wiring yourself.

## Isolated executor

apps/executor/assemble.ts exports assembleExecutor(store, providers, options). It dispatches read-only state by the already parsed action type, creates one Gateway and OperationLedger, and attaches cancellation/refund drivers to the same durable ActionExecutor implementation. Its server(secret) creates the service-authenticated internal API; reconcileDue() separately polls both action types without creating another operation/key.

Supply StripeCancellationAdapter and StripeRefundAdapter only after real test-mode/account/ownership/evidence gates pass. Trusted code-only options allow CONTROLLED_TEST/clock injection in tests; no public route accepts these options. The default executor entry point remains reservation-only. No credential flag alone installs or activates this helper.

## Responsibility split

The user supplies accounts, private credentials, the Zetaris instance API contract, deployment access/hostname and independent evaluation review. The agent implements the remaining bridge/transport, connects these helpers, performs real-service tests and prepares deployment once those inputs exist. The only current blockers are access/compatibility evidence and the undocumented instance-specific API; these are not an instruction for the user to write integration code. See MANUAL_SETUP.md.
