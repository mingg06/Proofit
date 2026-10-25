import { eveChannel } from "eve/channels/eve";
import { eveServiceAuth } from "../../apps/investigator/eve-auth.ts";
export default eveChannel({
  auth: (request) => eveServiceAuth(request, process.env.EVE_SERVICE_SECRET),
});
