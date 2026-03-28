import { generateText, streamText } from "ai";
import { ProviderRouter } from "../routing/provider-router.js";
import type {
  ProviderExecutionEvent,
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
    );

    const providerExecutionEvent: ProviderExecutionEvent = {
      type: "provider-execution",
      metadata: resolved.metadata,
    };

    yield providerExecutionEvent;

    const response = streamText({
      model: resolved.adapter.getLanguageModel(
        request.modelId || resolved.metadata.modelId,
      ),
      prompt: request.prompt,
      ...(request.signal ? { abortSignal: request.signal } : {}),
      ...(request.maxOutputTokens
        ? { maxOutputTokens: request.maxOutputTokens }
        : {}),
    });

    let text = "";
    for await (const chunk of response.textStream) {
      text += chunk;
      yield chunk;
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
