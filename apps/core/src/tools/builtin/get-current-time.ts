import type { EndraTool } from "@endra/agent-contracts";

export const getCurrentTimeTool: EndraTool = {
  name: "get_current_time",
  description: "Returns the current date and time in ISO 8601 (UTC).",
  category: "information",
  riskLevel: "read",
  requiresConfirmation: false,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  async execute() {
    return { success: true, data: new Date().toISOString() };
  },
};
