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
    registry.register(createListCapabilitiesTool(registry));
  }
  return registry;
}

let router: ToolRouter | undefined;
export function getDefaultToolRouter(): ToolRouter {
  router ??= new ToolRouter(getDefaultToolRegistry());
  return router;
}
