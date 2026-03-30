import { generateText, streamText } from "ai";
import { ProviderRouter } from "../routing/provider-router.js";
import type {
  ProviderExecutionEvent,
  ProviderReasoningEvent,
  ProviderStreamEvent,
  ProviderStreamRequest,
  ProviderTextRequest,
  ProviderTextResult,
} from "./types.js";

export class ProviderExecutionService {
  constructor(
    private readonly providerRouter: ProviderRouter = new ProviderRouter(),
  ) {}

  async generateText(
    request: ProviderTextRequest,
  ): Promise<ProviderTextResult> {
    const resolved = await this.providerRouter.resolveCapability(
      "chat",
      request.prompt,
      undefined,
      request.providerId,
      request.modelId,
    );

    const response = await generateText({
      model: resolved.adapter.getLanguageModel(
        request.modelId || resolved.metadata.modelId,
      ),
      prompt: request.prompt,
      ...(request.signal ? { abortSignal: request.signal } : {}),
      ...(request.maxOutputTokens
        ? { maxOutputTokens: request.maxOutputTokens }
        : {}),
    });

    const usage = (response as any).usage ?? (response as any).totalUsage ?? {};

    return {
      text: response.text,
      usage: {
        promptTokens: usage.inputTokens ?? usage.promptTokens,
        completionTokens: usage.outputTokens ?? usage.completionTokens,
        totalTokens: usage.totalTokens,
      },
      metadata: resolved.metadata,
    };
  }

  async *streamText(
    request: ProviderStreamRequest,
  ): AsyncGenerator<ProviderStreamEvent, void, unknown> {
    const resolved = await this.providerRouter.resolveCapability(
      "chat",
      request.prompt,
      undefined,
      request.providerId,
      request.modelId,
    );

    const providerExecutionEvent: ProviderExecutionEvent = {
      type: "provider-execution",
      metadata: resolved.metadata,
    };

    yield providerExecutionEvent;

    const reasoningQueue: string[] = [];

    const response = streamText({
      model: resolved.adapter.getLanguageModel(
        request.modelId || resolved.metadata.modelId,
      ),
      prompt: request.prompt,
      ...(request.signal ? { abortSignal: request.signal } : {}),
      ...(request.maxOutputTokens
        ? { maxOutputTokens: request.maxOutputTokens }
        : {}),
      onChunk: ({ chunk }) => {
        if (chunk.type === "reasoning-delta") {
          reasoningQueue.push(chunk.text);
        }
      },
    });

    let text = "";
    for await (const chunk of response.textStream) {
      text += chunk;
      yield chunk;

      // Drain reasoning accumulated during this text chunk
      while (reasoningQueue.length > 0) {
        yield { type: "reasoning", text: reasoningQueue.shift()! } as ProviderReasoningEvent;
      }
    }

    // Drain any remaining reasoning (model may emit reasoning before/after text)
    while (reasoningQueue.length > 0) {
      yield { type: "reasoning", text: reasoningQueue.shift()! } as ProviderReasoningEvent;
    }

    const usage = await response.usage;

    yield {
      text,
      usage: {
        ...(usage?.inputTokens !== undefined
          ? { promptTokens: usage.inputTokens }
          : {}),
        ...(usage?.outputTokens !== undefined
          ? { completionTokens: usage.outputTokens }
          : {}),
        ...(usage?.totalTokens !== undefined
          ? { totalTokens: usage.totalTokens }
          : {}),
      },
      metadata: resolved.metadata,
    };
  }
}
