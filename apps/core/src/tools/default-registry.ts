// The tools ENDRA actually has available in the live chat pipeline.
// Real external tools (weather, web search, calendar, Gmail - Phase 5)
// get registered here too once they exist.

import { ToolRegistry } from "./registry.js";
import { ToolRouter } from "./router.js";
import { getCurrentTimeTool } from "./builtin/get-current-time.js";
import { calculatorTool } from "./builtin/calculator.js";
import { createNotesTool } from "./builtin/notes.js";

let registry: ToolRegistry | undefined;
export function getDefaultToolRegistry(): ToolRegistry {
  if (!registry) {
    registry = new ToolRegistry();
    registry.register(getCurrentTimeTool);
    registry.register(calculatorTool);
    registry.register(createNotesTool());
  }
  return registry;
}

let router: ToolRouter | undefined;
export function getDefaultToolRouter(): ToolRouter {
  router ??= new ToolRouter(getDefaultToolRegistry());
  return router;
}
