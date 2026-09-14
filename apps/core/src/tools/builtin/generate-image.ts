import OpenAI from "openai";
import type { EndraAttachment, EndraTool } from "@endra/agent-contracts";

const DEFAULT_IMAGE_MODEL = "gpt-image-1";

let defaultClient: OpenAI | undefined;
function getDefaultClient(): OpenAI {
  defaultClient ??= new OpenAI();
  return defaultClient;
}

export function createGenerateImageTool(client: OpenAI = getDefaultClient()): EndraTool {
  return {
    name: "generate_image",
    description: "Generates an image from a text description and sends it to the user.",
    category: "productivity",
    riskLevel: "write",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: { prompt: { type: "string" } },
      additionalProperties: false,
    },
    async execute(input) {
      const { prompt } = input as { prompt: string };
      const model = process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL;
      const response = await client.images.generate({ model, prompt, size: "1024x1024" });
      const b64 = response.data?.[0]?.b64_json;
      if (!b64) return { success: false, error: "OpenAI returned no image data" };

      const attachment: EndraAttachment = { type: "image", data: b64, mimeType: "image/png" };
      return { success: true, data: attachment };
    },
  };
}
