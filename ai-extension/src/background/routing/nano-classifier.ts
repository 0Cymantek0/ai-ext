import { generateText } from 'ai';
import { z } from 'zod';

const IntentSchema = z.object({
  complexity: z.number().min(1).max(10),
  intent: z.enum(['chat', 'summarize', 'analyze', 'code', 'research']),
  budget_signal: z.enum(['low', 'medium', 'high'])
});

export async function classifyPromptWithNano(prompt: string, nanoModel: any) {
  try {
    const { text } = await generateText({
      model: nanoModel,
      system: "Analyze the following prompt and return a JSON object with 'complexity' (1-10), 'intent', and 'budget_signal'. Return ONLY valid JSON.",
      prompt
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsedJson = JSON.parse(jsonMatch[0]);
    return IntentSchema.parse(parsedJson);
  } catch (error) {
    return { complexity: 5, intent: 'chat', budget_signal: 'medium' } as const;
  }
}
