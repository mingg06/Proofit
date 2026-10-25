import { defineAgent, defineDynamic } from "eve";
import { z } from "zod";
import { createNvidiaModel } from "../apps/investigator/nvidia-model.ts";
import { eveProvider } from "../apps/investigator/eve-provider.ts";

export default defineAgent({
  defaultTools: false,
  model: defineDynamic({
    events: {
      "step.started": (event) => {
        // Each backend step gets its own eve session. No internal follow-up/compaction calls.
        const step = z
          .object({ data: z.object({ stepIndex: z.literal(0) }) })
          .parse(event);
        void step;
        if (process.env.STRIPE_TEST_SECRET_KEY?.trim())
          throw new Error("Provider credentials cannot enter eve");
        return {
          model: eveProvider(
            createNvidiaModel(
              process.env.NVIDIA_API_KEY ?? "",
              process.env.NVIDIA_MODEL_ID ?? "",
            ),
          ),
          modelContextWindowTokens: 64000,
        };
      },
    },
  }),
  limits: {
    sessionTimeoutMs: 60000,
    sessionUsage: ({ total }) =>
      total.inputTokens > 0 || total.outputTokens > 0,
  },
  experimental: { workflow: { retention: 0 } },
});
