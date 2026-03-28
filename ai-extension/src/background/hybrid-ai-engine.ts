/**
 * Hybrid AI Decision Engine
 *
 * This module implements intelligent decision-making for AI processing location.
 * It analyzes task complexity, device capabilities, and user preferences to determine
 * whether to use on-device Gemini Nano or cloud-based Gemini models.
 * When downstream callers provide `ProcessingOptions.forcedLocation`, the engine
 * honors the override without rerunning routing heuristics while still recording
 * monitoring insights and prompting for cloud consent when required.
 *
 * Requirements: 4.1, 4.2, 4.4, 13.1, 16.2
 */

import {
  AIManager,
  type ProcessingOptions,
  type AIResponse,
} from "./ai-manager";
import { CloudAIManager, GeminiModel } from "./cloud-ai-manager";
import { aiPerformanceMonitor, AIModel } from "./ai-performance-monitor";
import { ProviderExecutionService } from "./provider-execution/provider-execution-service.js";
import type { ProviderTextResult } from "./provider-execution/types.js";

/**
 * Task complexity levels
 * Requirement 4.1: Determine if cloud processing is needed based on task complexity
 */
export enum TaskComplexity {
  SIMPLE = "simple", // < 1000 tokens, basic operations
  MODERATE = "moderate", // 1000-5000 tokens, standard operations
  COMPLEX = "complex", // > 5000 tokens, advanced reasoning
  MULTIMODAL = "multimodal", // Image/audio processing
}

/**
 * Processing location options
 */
export enum ProcessingLocation {
  GEMINI_NANO = "gemini-nano",
  GEMINI_FLASH = "gemini-flash",
  GEMINI_FLASH_LITE = "gemini-flash-lite",
  GEMINI_PRO = "gemini-pro",
}

/**
 * Task operation types
 */
export enum TaskOperation {
  SUMMARIZE = "summarize",
  TRANSLATE = "translate",
  EMBED = "embed",
  ALT_TEXT = "alt-text",
  TRANSCRIBE = "transcribe",
  ENHANCE = "enhance",
  ANALYZE = "analyze",
  GENERATE = "generate",
  GENERAL = "general",
}

/**
 * Content type for processing
 */
export interface Content {
  text?: string;
  image?: Blob;
  audio?: Blob;
  metadata?: Record<string, any>;
}

/**
 * Task to be processed
 */
export interface Task {
  content: Content;
  operation: TaskOperation;
  context?: string;
}

/**
 * Device performance profile
 */
export interface DeviceCapabilities {
  memory: number; // Available memory in MB
  cpuCores: number;
  isOnline: boolean;
  connectionType: "slow-2g" | "2g" | "3g" | "4g" | "wifi" | "unknown";
  batteryLevel?: number;
  isCharging?: boolean;
  geminiNanoAvailable: boolean;
}

/**
 * Processing decision result
 */
export interface ProcessingDecision {
  location: ProcessingLocation;
  reason: string;
  requiresConsent: boolean;
  estimatedTokens: number;
  complexity: TaskComplexity;
}

/**
 * Task Complexity Classifier
 * Analyzes tasks to determine their complexity level
 */
export class TaskClassifier {
  /**
   * Classify a task based on content and operation
   *
   * @param task Task to classify
   * @returns Task complexity level
   */
  classifyTask(task: Task): TaskComplexity {
    // Check for multimodal content
    if (task.content.image || task.content.audio) {
      return TaskComplexity.MULTIMODAL;
    }

    // Estimate token count
    const tokens = this.estimateTokens(task.content);

    // Check operation complexity
    const complexOperations = [TaskOperation.ANALYZE, TaskOperation.GENERATE];

    if (complexOperations.includes(task.operation) || tokens > 5000) {
      return TaskComplexity.COMPLEX;
    }

    if (tokens > 1000) {
      return TaskComplexity.MODERATE;
    }

    return TaskComplexity.SIMPLE;
  }

  /**
   * Estimate token count for content
   * Uses rough approximation: 1 token ≈ 4 characters
   *
   * @param content Content to estimate
   * @returns Estimated token count
   */
  estimateTokens(content: Content): number {
    let charCount = 0;

    if (content.text) {
      charCount += content.text.length;
    }

    // For images, estimate based on size (rough approximation)
    if (content.image) {
      // Images typically use more tokens, estimate ~1000 tokens per image
      charCount += 4000;
    }

    // For audio, estimate based on duration (if available in metadata)
    if (content.audio && content.metadata?.duration) {
      // Estimate ~150 words per minute, ~200 tokens per minute
      const durationMinutes = content.metadata.duration / 60;
      charCount += durationMinutes * 200 * 4;
    }

    // Convert characters to tokens (1 token ≈ 4 characters)
    return Math.ceil(charCount / 4);
  }

  /**
   * Determine if a task requires cloud processing
   *
   * @param task Task to check
   * @param deviceCapabilities Current device capabilities
   * @returns True if cloud processing is required
   */
  requiresCloud(task: Task, deviceCapabilities: DeviceCapabilities): boolean {
    const complexity = this.classifyTask(task);

    // Complex tasks always require cloud
    if (complexity === TaskComplexity.COMPLEX) {
      return true;
    }

    // Multimodal tasks require cloud if Gemini Nano doesn't support them
    if (complexity === TaskComplexity.MULTIMODAL) {
      // Check if the operation is supported locally
      const localMultimodalOps = [
        TaskOperation.ALT_TEXT,
        TaskOperation.TRANSCRIBE,
      ];
      if (!localMultimodalOps.includes(task.operation)) {
        return true;
      }
    }

    // If Gemini Nano is not available, cloud is required
    if (!deviceCapabilities.geminiNanoAvailable) {
      return true;
    }

    // If device is low on resources, prefer cloud
    if (
      deviceCapabilities.memory < 500 ||
      (deviceCapabilities.batteryLevel &&
        deviceCapabilities.batteryLevel < 20 &&
        !deviceCapabilities.isCharging)
    ) {
      return true;
    }

    return false;
  }
}

/**
 * Device Capability Detector
 * Detects and monitors device capabilities for processing decisions
 */
export class DeviceCapabilityDetector {
  /**
   * Detect current device capabilities
   * Requirement 4.1: Check device capabilities to determine processing location
   *
   * @param aiManager AI Manager instance to check Gemini Nano availability
   * @returns Device capabilities
   */
  async detectCapabilities(aiManager: AIManager): Promise<DeviceCapabilities> {
    const capabilities: DeviceCapabilities = {
      memory: await this.getAvailableMemory(),
      cpuCores: this.getCPUCores(),
      isOnline: navigator.onLine,
      connectionType: this.getConnectionType(),
      geminiNanoAvailable: false,
    };

    // Check Gemini Nano availability
    try {
      const availability = await aiManager.checkModelAvailability();
      capabilities.geminiNanoAvailable = availability === "readily";
    } catch (error) {
      console.error("Error checking Gemini Nano availability:", error);
    }

    // Get battery information if available
    if ("getBattery" in navigator) {
      try {
        const battery = await (navigator as any).getBattery();
        capabilities.batteryLevel = battery.level * 100;
        capabilities.isCharging = battery.charging;
      } catch (error) {
        console.warn("Battery API not available:", error);
      }
    }

    return capabilities;
  }

  /**
   * Get available memory (estimate)
   * Uses performance.memory if available, otherwise estimates
   */
  private async getAvailableMemory(): Promise<number> {
    if ("memory" in performance) {
      const memory = (performance as any).memory;
      // Return available memory in MB
      const usedMemory = memory.usedJSHeapSize / (1024 * 1024);
      const totalMemory = memory.jsHeapSizeLimit / (1024 * 1024);
      return totalMemory - usedMemory;
    }

    // Estimate based on device class
    // This is a rough estimate when memory API is not available
    return 1000; // Assume 1GB available
  }

  /**
   * Get number of CPU cores
   */
  private getCPUCores(): number {
    return navigator.hardwareConcurrency || 4;
  }

  /**
   * Get connection type
   */
  private getConnectionType(): DeviceCapabilities["connectionType"] {
    if ("connection" in navigator) {
      const connection = (navigator as any).connection;
      const effectiveType = connection?.effectiveType;

      if (effectiveType) {
        return effectiveType as DeviceCapabilities["connectionType"];
      }
    }

    return "unknown";
  }

  /**
   * Check if device can handle local processing
   *
   * @param capabilities Device capabilities
   * @param complexity Task complexity
   * @returns True if device can handle local processing
   */
  canHandleLocal(
    capabilities: DeviceCapabilities,
    complexity: TaskComplexity,
  ): boolean {
    // Gemini Nano must be available
    if (!capabilities.geminiNanoAvailable) {
      return false;
    }

    // Check if device has sufficient resources
    const minMemory = complexity === TaskComplexity.SIMPLE ? 200 : 500;
    if (capabilities.memory < minMemory) {
      return false;
    }

    // Check battery level if available
    if (
      capabilities.batteryLevel !== undefined &&
      capabilities.batteryLevel < 15 &&
      !capabilities.isCharging
    ) {
      return false;
    }

    return true;
  }

  /**
   * Get performance profile description
   *
   * @param capabilities Device capabilities
   * @returns Performance profile description
   */
  getPerformanceProfile(capabilities: DeviceCapabilities): string {
    const profiles: string[] = [];

    if (capabilities.memory > 2000) {
      profiles.push("high-memory");
    } else if (capabilities.memory > 1000) {
      profiles.push("medium-memory");
    } else {
      profiles.push("low-memory");
    }

    if (capabilities.cpuCores >= 8) {
      profiles.push("high-cpu");
    } else if (capabilities.cpuCores >= 4) {
      profiles.push("medium-cpu");
    } else {
      profiles.push("low-cpu");
    }

    if (
      capabilities.connectionType === "wifi" ||
      capabilities.connectionType === "4g"
    ) {
      profiles.push("fast-network");
    } else {
      profiles.push("slow-network");
    }

    return profiles.join(", ");
  }
}

/**
 * Hybrid AI Engine
 * Main orchestrator for AI processing decisions
 */
export class HybridAIEngine {
  private aiManager: AIManager;
  private cloudAIManager: CloudAIManager;
  private executionService: ProviderExecutionService;
  private taskClassifier: TaskClassifier;
  private capabilityDetector: DeviceCapabilityDetector;
  private cachedCapabilities: DeviceCapabilities | null = null;
  private capabilitiesCacheTime: number = 0;
  private readonly CACHE_DURATION = 60000; // 1 minute

  constructor(
    aiManager: AIManager,
    cloudAIManager?: CloudAIManager,
    executionService?: ProviderExecutionService,
  ) {
    this.aiManager = aiManager;
    const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
    this.cloudAIManager = cloudAIManager || new CloudAIManager(geminiApiKey);
    this.executionService = executionService || new ProviderExecutionService();
    this.taskClassifier = new TaskClassifier();
    this.capabilityDetector = new DeviceCapabilityDetector();
  }

  /**
   * Determine optimal processing location for a task
   * Requirement 4.1: Intelligently determine if cloud processing is needed
   * Requirement 4.4: Select appropriate Gemini model based on task complexity
   * Requirement 13.1: Track model selection decisions
   *
   * @param task Task to process
   * @param options Processing options
   * @returns Processing decision
   */
  async determineProcessingLocation(
    task: Task,
    options?: Partial<ProcessingOptions>,
  ): Promise<ProcessingDecision> {
    // Classify the task upfront to support overrides without re-running heuristics
    const complexity = this.taskClassifier.classifyTask(task);
    const estimatedTokens = this.taskClassifier.estimateTokens(task.content);

    if (options?.forcedLocation) {
      const location = options.forcedLocation;
      const requiresConsent = location !== ProcessingLocation.GEMINI_NANO;
      const baseReason =
        options.forcedLocationReason ??
        `Processing location override: ${this.describeProcessingLocation(location)}`;
      const confidenceSuffix =
        options.forcedLocationConfidence !== undefined
          ? ` (confidence: ${options.forcedLocationConfidence.toFixed(2)})`
          : "";
      const reason = `${baseReason}${confidenceSuffix}`;

      aiPerformanceMonitor.recordModelSelection(
        this.mapProcessingLocationToAIModel(location),
        reason,
      );

      return {
        location,
        reason,
        requiresConsent,
        estimatedTokens,
        complexity,
      };
    }

    // Get device capabilities (cached for performance)
    const capabilities = await this.getDeviceCapabilities();

    // Check if user prefers local processing
    const preferLocal = options?.preferLocal ?? true;

    // Determine if cloud is required
    const requiresCloud = this.taskClassifier.requiresCloud(task, capabilities);

    // Decision logic
    let location: ProcessingLocation;
    let reason: string;
    let requiresConsent = false;

    if (preferLocal && !requiresCloud && capabilities.geminiNanoAvailable) {
      // Use local processing
      location = ProcessingLocation.GEMINI_NANO;
      reason = "Task can be processed locally with Gemini Nano";
    } else if (requiresCloud || !capabilities.geminiNanoAvailable) {
      // Need cloud processing - select appropriate model
      requiresConsent = true;

      if (
        complexity === TaskComplexity.COMPLEX ||
        task.operation === TaskOperation.ANALYZE
      ) {
        location = ProcessingLocation.GEMINI_PRO;
        reason = "Complex task requires Gemini Pro for advanced reasoning";
      } else if (
        complexity === TaskComplexity.MODERATE ||
        estimatedTokens > 1000
      ) {
        location = ProcessingLocation.GEMINI_FLASH;
        reason =
          "Moderate complexity task uses Gemini Flash for balanced performance";
      } else {
        location = ProcessingLocation.GEMINI_FLASH_LITE;
        reason = "Simple task uses Gemini Flash-Lite for cost efficiency";
      }

      // Add specific reasons for cloud requirement
      if (!capabilities.geminiNanoAvailable) {
        reason += " (Gemini Nano not available)";
      } else if (complexity === TaskComplexity.COMPLEX) {
        reason += " (exceeds local processing capabilities)";
      } else if (capabilities.memory < 500) {
        reason += " (low device memory)";
      }
    } else {
      // Fallback to local
      location = ProcessingLocation.GEMINI_NANO;
      reason = "Using local processing as fallback";
    }

    // Record model selection decision for monitoring
    const aiModel = this.mapProcessingLocationToAIModel(location);
    aiPerformanceMonitor.recordModelSelection(aiModel, reason);

    return {
      location,
      reason,
      requiresConsent,
      estimatedTokens,
      complexity,
    };
  }

  private describeProcessingLocation(location: ProcessingLocation): string {
    switch (location) {
      case ProcessingLocation.GEMINI_FLASH:
        return "Gemini Flash";
      case ProcessingLocation.GEMINI_FLASH_LITE:
        return "Gemini Flash-Lite";
      case ProcessingLocation.GEMINI_PRO:
        return "Gemini Pro";
      default:
        return "Gemini Nano";
    }
  }

  /**
   * Map ProcessingLocation to AIModel for monitoring
   */
  private mapProcessingLocationToAIModel(
    location: ProcessingLocation,
  ): AIModel {
    switch (location) {
      case ProcessingLocation.GEMINI_NANO:
        return AIModel.GEMINI_NANO;
      case ProcessingLocation.GEMINI_FLASH:
        return AIModel.GEMINI_FLASH;
      case ProcessingLocation.GEMINI_FLASH_LITE:
        return AIModel.GEMINI_FLASH_LITE;
      case ProcessingLocation.GEMINI_PRO:
        return AIModel.GEMINI_PRO;
      default:
        return AIModel.GEMINI_NANO;
    }
  }

  /**
   * Process content with automatic location selection
   * Requirement 4.2: Prompt for consent if cloud processing is required
   *
   * @param task Task to process
   * @param options Processing options
   * @param onConsentRequired Callback when consent is required
   * @returns AI response
   */
  async processContent(
    task: Task,
    options?: Partial<ProcessingOptions>,
    onConsentRequired?: (decision: ProcessingDecision) => Promise<boolean>,
  ): Promise<AIResponse> {
    const startTime = performance.now();
    const forcedLocationProvided = Boolean(options?.forcedLocation);

    try {
      if (this.shouldUseProviderExecution(task, options)) {
        const result = await this.executionService.generateText(
          this.buildProviderExecutionRequest(task, options),
        );

        return this.mapProviderTextResult(result, startTime);
      }

      // Determine processing location
      const decision = await this.determineProcessingLocation(task, options);

      console.log(
        `Processing decision: ${decision.location} - ${decision.reason}`,
      );

      // Check if consent is required
      if (decision.requiresConsent && onConsentRequired) {
        const consentGranted = await onConsentRequired(decision);

        if (!consentGranted) {
          // User denied consent - try local fallback
          if (await this.canFallbackToLocal(task)) {
            console.log(
              "User denied cloud consent, falling back to local processing",
            );
            return await this.processLocally(task, options);
          } else {
            throw new Error(
              "Cloud processing required but consent denied, and local fallback not available",
            );
          }
        }
      }

      // Process based on location
      if (decision.location === ProcessingLocation.GEMINI_NANO) {
        return await this.processLocally(task, options);
      } else {
        return await this.processInCloud(task, decision.location, options);
      }
    } catch (error) {
      console.error("Error processing content:", error);

      // Try fallback to local if possible when no forced override is present
      if (!forcedLocationProvided && (await this.canFallbackToLocal(task))) {
        console.log("Attempting local fallback after error");
        return await this.processLocally(task, options);
      }

      throw error;
    }
  }

  /**
   * Process task locally with Gemini Nano
   */
  private async processLocally(
    task: Task,
    options?: Partial<ProcessingOptions>,
  ): Promise<AIResponse> {
    const startTime = performance.now();

    try {
      // Create or get session
      const sessionId = await this.aiManager.createSession();

      // Build prompt based on operation
      const prompt = this.buildPrompt(task);

      // Process with Gemini Nano
      const result = await this.aiManager.processPrompt(
        sessionId,
        prompt,
        options?.signal ? { signal: options.signal } : undefined,
      );

      const processingTime = performance.now() - startTime;
      const usage = this.aiManager.getSessionUsage(sessionId);

      return {
        result,
        source: "gemini-nano",
        confidence: 0.9,
        processingTime,
        tokensUsed: usage.used,
      };
    } catch (error) {
      console.error("Local processing failed:", error);
      throw new Error(`Local processing failed: ${error}`);
    }
  }

  /**
   * Process task in cloud with specified model
   * Requirement 4.3: Sanitize and encrypt content before cloud transmission
   * Requirement 4.5: Use Gemini 2.5 Flash for large documents
   * Requirement 4.6: Use Gemini 2.5 Pro for complex reasoning
   */
  private async processInCloud(
    task: Task,
    model: ProcessingLocation,
    options?: Partial<ProcessingOptions>,
  ): Promise<AIResponse> {
    const startTime = performance.now();

    try {
      // Check if cloud AI is available
      if (!this.cloudAIManager.isAvailable()) {
        throw new Error(
          "Cloud AI not available. Please configure your Gemini API key.",
        );
      }

      // Build prompt for the task
      const prompt = this.buildPrompt(task);

      // Process based on selected model
      let response: AIResponse;

      switch (model) {
        case ProcessingLocation.GEMINI_PRO:
          // Requirement 4.6: Use Gemini Pro for complex reasoning
          console.log("Processing with Gemini 2.5 Pro (complex reasoning)");
          response = await this.cloudAIManager.processWithRetry(
            GeminiModel.PRO,
            prompt,
            {
              ...(options?.signal && { signal: options.signal }),
              ...(options?.maxTokens && { maxOutputTokens: options.maxTokens }),
            },
          );
          break;

        case ProcessingLocation.GEMINI_FLASH:
          // Requirement 4.5: Use Gemini Flash for large documents
          console.log(
            "Processing with Gemini 2.5 Flash (balanced performance)",
          );
          response = await this.cloudAIManager.processWithRetry(
            GeminiModel.FLASH,
            prompt,
            {
              ...(options?.signal && { signal: options.signal }),
              ...(options?.maxTokens && { maxOutputTokens: options.maxTokens }),
            },
          );
          break;

        case ProcessingLocation.GEMINI_FLASH_LITE:
          // Use Flash-Lite for simple, high-volume tasks
          console.log("Processing with Gemini 2.5 Flash-Lite (cost-efficient)");
          response = await this.cloudAIManager.processWithRetry(
            GeminiModel.FLASH_LITE,
            prompt,
            {
              ...(options?.signal && { signal: options.signal }),
              ...(options?.maxTokens && { maxOutputTokens: options.maxTokens }),
            },
          );
          break;

        default:
          throw new Error(`Unsupported cloud model: ${model}`);
      }

      const totalTime = performance.now() - startTime;
      console.log(`Cloud processing completed in ${totalTime.toFixed(2)}ms`);

      return response;
    } catch (error) {
      console.error("Cloud processing failed:", error);
      throw error;
    }
  }

  /**
   * Check if task can fallback to local processing
   */
  private async canFallbackToLocal(task: Task): Promise<boolean> {
    const capabilities = await this.getDeviceCapabilities();

    if (!capabilities.geminiNanoAvailable) {
      return false;
    }

    const complexity = this.taskClassifier.classifyTask(task);

    // Only simple and moderate tasks can fallback to local
    return (
      complexity === TaskComplexity.SIMPLE ||
      complexity === TaskComplexity.MODERATE
    );
  }

  /**
   * Build prompt for task
   */
  private buildPrompt(task: Task): string {
    const { content, operation, context } = task;

    let prompt = "";

    // Add context if provided
    if (context) {
      prompt += `Context: ${context}\n\n`;
    }

    // Add operation-specific instructions
    switch (operation) {
      case TaskOperation.SUMMARIZE:
        prompt +=
          "Please provide a concise summary of the following content:\n\n";
        break;
      case TaskOperation.TRANSLATE:
        prompt += "Please translate the following content:\n\n";
        break;
      case TaskOperation.ENHANCE:
        prompt += "Please enhance and improve the following text:\n\n";
        break;
      case TaskOperation.ANALYZE:
        prompt += "Please analyze the following content:\n\n";
        break;
      case TaskOperation.ALT_TEXT:
        prompt += "Please generate descriptive alt-text for accessibility:\n\n";
        break;
      default:
        prompt += "Please process the following content:\n\n";
    }

    // Add content
    if (content.text) {
      prompt += content.text;
    }

    return prompt;
  }

  /**
   * Get device capabilities with caching
   */
  private async getDeviceCapabilities(): Promise<DeviceCapabilities> {
    const now = Date.now();

    // Return cached capabilities if still valid
    if (
      this.cachedCapabilities &&
      now - this.capabilitiesCacheTime < this.CACHE_DURATION
    ) {
      return this.cachedCapabilities;
    }

    // Detect fresh capabilities
    this.cachedCapabilities = await this.capabilityDetector.detectCapabilities(
      this.aiManager,
    );
    this.capabilitiesCacheTime = now;

    return this.cachedCapabilities;
  }

  /**
   * Clear capabilities cache (useful when device state changes)
   */
  clearCapabilitiesCache(): void {
    this.cachedCapabilities = null;
    this.capabilitiesCacheTime = 0;
  }

  /**
   * Get current device capabilities (for debugging/monitoring)
   */
  async getCurrentCapabilities(): Promise<DeviceCapabilities> {
    return await this.getDeviceCapabilities();
  }

  /**
   * Get task classifier instance (for testing/debugging)
   */
  getTaskClassifier(): TaskClassifier {
    return this.taskClassifier;
  }

  /**
   * Get capability detector instance (for testing/debugging)
   */
  getCapabilityDetector(): DeviceCapabilityDetector {
    return this.capabilityDetector;
  }

  /**
   * Generate embedding for text
   * Uses cloud API for embedding generation
   * Requirement 7.2: Generate embeddings for semantic search
   *
   * @param text Text to generate embedding for
   * @returns Embedding vector
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Check if cloud AI is available
      if (!this.cloudAIManager.isAvailable()) {
        throw new Error(
          "Cloud AI not available. Embeddings require Gemini API key.",
        );
      }

      // Use cloud AI to generate embedding
      const embedding = await this.cloudAIManager.generateEmbedding(text);

      return embedding;
    } catch (error) {
      console.error("Failed to generate embedding:", error);
      throw error;
    }
  }

  /**
   * Process content with streaming response
   * Requirement 8.3: Stream responses in real-time for immediate feedback
   * Requirement 8.9: Display typing indicator during processing
   *
   * @param task Task to process
   * @param options Processing options
   * @param onConsentRequired Callback when consent is required
   * @returns Async generator yielding response chunks
   */
  async *processContentStreaming(
    task: Task,
    options?: Partial<ProcessingOptions>,
    onConsentRequired?: (decision: ProcessingDecision) => Promise<boolean>,
  ): AsyncGenerator<string, void, unknown> {
    const forcedLocationProvided = Boolean(options?.forcedLocation);
    try {
      if (this.shouldUseProviderExecution(task, options)) {
        yield* this.executionService.streamText(
          this.buildProviderExecutionRequest(task, options),
        );
        return;
      }

      // Determine processing location
      const decision = await this.determineProcessingLocation(task, options);

      console.log(
        `Streaming decision: ${decision.location} - ${decision.reason}`,
      );

      // Check if consent is required
      if (decision.requiresConsent && onConsentRequired) {
        const consentGranted = await onConsentRequired(decision);

        if (!consentGranted) {
          // User denied consent - try local fallback
          if (await this.canFallbackToLocal(task)) {
            console.log(
              "User denied cloud consent, falling back to local streaming",
            );
            yield* this.processLocallyStreaming(task, options);
            return;
          } else {
            throw new Error(
              "Cloud processing required but consent denied, and local fallback not available",
            );
          }
        }
      }

      // Process based on location
      if (decision.location === ProcessingLocation.GEMINI_NANO) {
        yield* this.processLocallyStreaming(task, options);
      } else {
        yield* this.processInCloudStreaming(task, decision.location, options);
      }
    } catch (error) {
      console.error("Error streaming content:", error);

      // Try fallback to local if possible when no forced override is present
      if (!forcedLocationProvided && (await this.canFallbackToLocal(task))) {
        console.log("Attempting local streaming fallback after error");
        yield* this.processLocallyStreaming(task, options);
      } else {
        throw error;
      }
    }
  }

  /**
   * Process task locally with Gemini Nano streaming
   * Requirement 8.3: Stream responses in real-time
   */
  private async *processLocallyStreaming(
    task: Task,
    options?: Partial<ProcessingOptions>,
  ): AsyncGenerator<string, void, unknown> {
    try {
      // Create or get session
      const sessionId = await this.aiManager.createSession();

      // Build prompt based on operation
      const prompt = this.buildPrompt(task);

      // Process with Gemini Nano streaming
      const stream = await this.aiManager.processPromptStreaming(
        sessionId,
        prompt,
        options?.signal ? { signal: options.signal } : undefined,
      );

      // Read from the stream and yield chunks
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error("Local streaming failed:", error);
      throw new Error(`Local streaming failed: ${error}`);
    }
  }

  /**
   * Process task in cloud with streaming
   * Requirement 8.3: Stream responses in real-time
   */
  private async *processInCloudStreaming(
    task: Task,
    model: ProcessingLocation,
    options?: Partial<ProcessingOptions>,
  ): AsyncGenerator<string, void, unknown> {
    try {
      // Check if cloud AI is available
      if (!this.cloudAIManager.isAvailable()) {
        throw new Error(
          "Cloud AI not available. Please configure your Gemini API key.",
        );
      }

      // Build prompt for the task
      const prompt = this.buildPrompt(task);

      // Process based on selected model
      switch (model) {
        case ProcessingLocation.GEMINI_PRO:
          console.log("Streaming with Gemini 2.5 Pro");
          yield* this.cloudAIManager.processWithProStreaming(prompt, {
            ...(options?.signal && { signal: options.signal }),
            ...(options?.maxTokens && { maxOutputTokens: options.maxTokens }),
          });
          break;

        case ProcessingLocation.GEMINI_FLASH:
          console.log("Streaming with Gemini 2.5 Flash");
          yield* this.cloudAIManager.processWithFlashStreaming(prompt, {
            ...(options?.signal && { signal: options.signal }),
            ...(options?.maxTokens && { maxOutputTokens: options.maxTokens }),
          });
          break;

        case ProcessingLocation.GEMINI_FLASH_LITE:
          console.log("Streaming with Gemini 2.5 Flash-Lite");
          yield* this.cloudAIManager.processWithModelStreaming(
            GeminiModel.FLASH_LITE,
            prompt,
            {
              ...(options?.signal && { signal: options.signal }),
              ...(options?.maxTokens && { maxOutputTokens: options.maxTokens }),
            },
          );
          break;

        default:
          throw new Error(`Unsupported cloud model: ${model}`);
      }
    } catch (error) {
      console.error("Cloud streaming failed:", error);
      throw error;
    }
  }

  private mapProviderTextResult(
    result: ProviderTextResult,
    startTime: number,
  ): AIResponse {
    const processingTime = performance.now() - startTime;
    const source = this.mapProviderSource(result);

    return {
      result: result.text,
      source,
      confidence: 0.9,
      processingTime,
      tokensUsed:
        result.usage.totalTokens ??
        result.usage.completionTokens ??
        result.usage.promptTokens ??
        0,
      metadata: result.metadata,
    } as AIResponse;
  }

  private shouldUseProviderExecution(
    task: Task,
    options?: Partial<ProcessingOptions>,
  ): boolean {
    return (
      task.operation === TaskOperation.GENERAL &&
      options?.forcedLocation === undefined
    );
  }

  private buildProviderExecutionRequest(
    task: Task,
    options?: Partial<ProcessingOptions>,
  ) {
    return {
      prompt: this.buildPrompt(task),
      task,
      ...(options?.signal ? { signal: options.signal } : {}),
      ...(options?.maxTokens ? { maxOutputTokens: options.maxTokens } : {}),
    };
  }

  private mapProviderSource(result: ProviderTextResult): AIResponse["source"] {
    if (result.metadata.providerType === "gemini-nano") {
      return "gemini-nano";
    }

    if (
      result.metadata.providerType === "google" &&
      result.metadata.modelId.toLowerCase().includes("pro")
    ) {
      return "gemini-pro";
    }

    return "gemini-flash";
  }
}

// Export singleton instance
export const createHybridAIEngine = (
  aiManager: AIManager,
  cloudAIManager?: CloudAIManager,
  executionService?: ProviderExecutionService,
): HybridAIEngine => {
  return new HybridAIEngine(aiManager, cloudAIManager, executionService);
};

// Create default singleton instance
const aiManager = new AIManager();
const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
const cloudAI = new CloudAIManager(geminiApiKey);
export const hybridAIEngine = new HybridAIEngine(aiManager, cloudAI);
