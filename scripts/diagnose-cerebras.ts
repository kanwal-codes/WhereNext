import { gateway, generateObject } from "ai";
import { z } from "zod";

async function main() {
  const model = gateway("openai/gpt-oss-120b");
  const t0 = performance.now();
  try {
    const result = await generateObject({
      model,
      schema: z.object({ ok: z.boolean() }),
      messages: [{ role: "user", content: "Reply with {\"ok\": true}" }],
      allowSystemInMessages: true,
      providerOptions: { gateway: { only: ["cerebras"] } },
    });
    console.log(`OK in ${Math.round(performance.now() - t0)}ms:`, result.object);
  } catch (error) {
    console.log(`ERROR after ${Math.round(performance.now() - t0)}ms:`);
    console.log(error);
  }
}

main();
