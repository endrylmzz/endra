// The tools ENDRA actually has available in the live chat pipeline.
// Real external tools that need their own API key/OAuth (weather, web
// search, calendar, Gmail - Phase 5) get registered here too once
// they exist and Ender has provided the credential each one needs.

import { ToolRegistry } from "./registry.js";
import { ToolRouter } from "./router.js";
import { getCurrentTimeTool } from "./builtin/get-current-time.js";
import { calculatorTool } from "./builtin/calculator.js";
import { createNotesTool, createListNotesTool, createDeleteNoteTool } from "./builtin/notes.js";
import { createGenerateImageTool } from "./builtin/generate-image.js";
import { cryptoPriceTool } from "./builtin/crypto-price.js";
import { weatherTool } from "./builtin/weather.js";
import { wikipediaSearchTool } from "./builtin/wikipedia-search.js";
import { currencyConversionTool } from "./builtin/currency-conversion.js";
import {
  createSetWeatherAlertTool,
  createListWeatherAlertsTool,
  createCancelWeatherAlertTool,
} from "./builtin/weather-alerts.js";
import {
  createSetReminderTool,
  createListRemindersTool,
  createCancelReminderTool,
} from "./builtin/reminders.js";
import {
  createSetPriceAlertTool,
  createListPriceAlertsTool,
  createCancelPriceAlertTool,
} from "./builtin/price-alerts.js";
import { createListCapabilitiesTool } from "./builtin/list-capabilities.js";
import { createWebSearchTool } from "./builtin/web-search.js";
import { createDeepResearchTool } from "./builtin/deep-research.js";
import { createRunCodeTool } from "./builtin/run-code.js";
import {
  createListCalendarEventsTool,
  createCreateCalendarEventTool,
  createDeleteCalendarEventTool,
} from "./builtin/calendar.js";
import { createListEmailsTool, createReadEmailTool, createSendEmailTool } from "./builtin/gmail.js";
import { createListMemoriesTool, createDeleteMemoryTool } from "./builtin/memories.js";
import {
  createLogDecisionTool,
  createListDecisionsTool,
  createResolveDecisionTool,
} from "./builtin/decisions.js";
import {
  createSetPreferenceTool,
  createListPreferencesTool,
  createDeletePreferenceTool,
} from "./builtin/preferences.js";
import { createListEntitiesTool, createRecallAboutTool } from "./builtin/entities.js";

let registry: ToolRegistry | undefined;
export function getDefaultToolRegistry(): ToolRegistry {
  if (!registry) {
    registry = new ToolRegistry();
    registry.register(getCurrentTimeTool);
    registry.register(calculatorTool);
    registry.register(createNotesTool());
    registry.register(createListNotesTool());
    registry.register(createDeleteNoteTool());
    registry.register(createGenerateImageTool());
    registry.register(cryptoPriceTool);
    registry.register(weatherTool);
    registry.register(wikipediaSearchTool);
    registry.register(currencyConversionTool);
    registry.register(createSetWeatherAlertTool());
    registry.register(createListWeatherAlertsTool());
    registry.register(createCancelWeatherAlertTool());
    registry.register(createSetReminderTool());
    registry.register(createListRemindersTool());
    registry.register(createCancelReminderTool());
    registry.register(createSetPriceAlertTool());
    registry.register(createListPriceAlertsTool());
    registry.register(createCancelPriceAlertTool());
    registry.register(createWebSearchTool());
    registry.register(createDeepResearchTool());
    registry.register(createRunCodeTool());
    registry.register(createListCalendarEventsTool());
    registry.register(createCreateCalendarEventTool());
    registry.register(createDeleteCalendarEventTool());
    registry.register(createListEmailsTool());
    registry.register(createReadEmailTool());
    registry.register(createSendEmailTool());
    registry.register(createSetPreferenceTool());
    registry.register(createListPreferencesTool());
    registry.register(createDeletePreferenceTool());
    registry.register(createLogDecisionTool());
    registry.register(createListDecisionsTool());
    registry.register(createResolveDecisionTool());
    registry.register(createListMemoriesTool());
    registry.register(createDeleteMemoryTool());
    registry.register(createListEntitiesTool());
    registry.register(createRecallAboutTool());
    registry.register(createListCapabilitiesTool(registry));
  }
  return registry;
}

let router: ToolRouter | undefined;
export function getDefaultToolRouter(): ToolRouter {
  router ??= new ToolRouter(getDefaultToolRegistry());
  return router;
}
