/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Development Instrumentation Runtime
 *
 * Provides dev-only observability hooks that can be safely tree-shaken from
 * production builds. All entry points call into this module behind the
 * `import.meta.env.VITE_DEBUG_RECORDER` guard so the code is erased when the
 * flag is disabled.
 */

const DEv_FLAG = import.meta.env?.VITE_DEBUG_RECORDER === "true";

export type InstrumentationSurface =
  | "content"
  | "background"
  | "sidepanel"
  | "offscreen";

export interface RuntimeLoggerLike {
  debug: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

export interface InitializeInstrumentationOptions {
  domTarget?: Document | DocumentFragment | Element | null;
  rootElement?: Element | null;
  logger?: RuntimeLoggerLike | null;
}

export interface DevInstrumentationHandle {
  surface: InstrumentationSurface;
  isEnabled(): boolean;
  recordEvent(event: string, detail?: any): void;
  recordSnapshot(key: string, snapshot: any): void;
  getEventHistory(): InstrumentationEvent[];
  getSnapshotKeys(): string[];
  getProfilerCallback(id: string): ReactProfilerCallback;
}

export interface InstrumentationEvent {
  id: string;
  surface: InstrumentationSurface;
  event: string;
  timestamp: number;
  detail?: any;
}

type SnapshotRegistry = Record<string, string | undefined>;

type Cleanup = () => void;

type ReactProfilerPhase = "mount" | "update" | "nested-update";

type ReactProfilerCallback = NonNullable<
  import("react").ProfilerProps["onRender"]
>;

interface SurfaceState {
  initialized: boolean;
  handle: DevInstrumentationHandle;
  cleanupFns: Cleanup[];
  snapshotHashes: SnapshotRegistry;
}

interface DevRegistry {
  enabled: boolean;
  surfaces: Partial<Record<InstrumentationSurface, SurfaceState>>;
  eventHistory: InstrumentationEvent[];
  maxEvents: number;
}

const GLOBAL_KEY = "__AI_POCKET_DEVTOOLS__";

function getRegistry(): DevRegistry {
  const globalThisAny = globalThis as Record<string, any>;
  if (!globalThisAny[GLOBAL_KEY]) {
    globalThisAny[GLOBAL_KEY] = {
      enabled: DEv_FLAG,
      surfaces: {},
      eventHistory: [],
      maxEvents: 200,
    } satisfies DevRegistry;
  }

  return globalThisAny[GLOBAL_KEY] as DevRegistry;
}

function isEnabled(): boolean {
  return getRegistry().enabled === true;
}

function createHandle(
  surface: InstrumentationSurface,
  state: SurfaceState,
): DevInstrumentationHandle {
  const registry = getRegistry();

  const recordEvent = (event: string, detail?: any) => {
    if (!isEnabled()) return;

    const entry: InstrumentationEvent = {
      id: `${surface}:${event}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      surface,
      event,
      timestamp: Date.now(),
      detail: sanitize(detail),
    };

    registry.eventHistory.push(entry);
    if (registry.eventHistory.length > registry.maxEvents) {
      registry.eventHistory.splice(
        0,
        registry.eventHistory.length - registry.maxEvents,
      );
    }

    console.debug("[DevInstrumentation]", surface, event, entry.detail ?? null);
  };

  const recordSnapshot = (key: string, snapshot: any) => {
    if (!isEnabled()) return;

    const sanitized = sanitize(snapshot);
    const serialized = safeStableStringify(sanitized);
    if (serialized && state.snapshotHashes[key] === serialized) {
      return;
    }

    state.snapshotHashes[key] = serialized ?? undefined;
    recordEvent(`snapshot:${key}`, sanitized);
  };

  const getEventHistory = () =>
    registry.eventHistory.filter((entry) => entry.surface === surface);
  const getSnapshotKeys = () => Object.keys(state.snapshotHashes);

  const getProfilerCallback = (id: string): ReactProfilerCallback => {
    const callback: ReactProfilerCallback = (
      profilerId,
      phase,
      actualDuration,
      baseDuration,
      startTime,
      commitTime,
    ) => {
      recordEvent(`react:${id}`, {
        profilerId,
        phase,
        timings: {
          actualDuration,
          baseDuration,
          startTime,
          commitTime,
        },
      });
    };

    return callback;
  };

  return {
    surface,
    isEnabled,
    recordEvent,
    recordSnapshot,
    getEventHistory,
    getSnapshotKeys,
    getProfilerCallback,
  } satisfies DevInstrumentationHandle;
}

function registerDomListeners(
  handle: DevInstrumentationHandle,
  domTarget?: Document | DocumentFragment | Element | null,
  rootElement?: Element | null,
): Cleanup {
  if (!isEnabled()) {
    return () => {};
  }

  const target: Document | DocumentFragment | Element | null =
    domTarget ?? (typeof document !== "undefined" ? document : null);

  if (!target || typeof (target as Document).addEventListener !== "function") {
    return () => {};
  }

  const listeners: Array<
    [
      string,
      EventListenerOrEventListenerObject,
      AddEventListenerOptions | boolean | undefined,
    ]
  > = [];
  const addListener = (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean,
  ) => {
    (target as Document).addEventListener(type, listener, options);
    listeners.push([type, listener, options]);
  };

  const domEventTypes = ["click", "input", "focusin", "submit"];

  const eventListener: EventListener = (event) => {
    handle.recordEvent(
      `dom:${event.type}`,
      buildDomEventPayload(event, rootElement),
    );
  };

  domEventTypes.forEach((eventType) =>
    addListener(eventType, eventListener, { capture: true }),
  );

  const throttledMouseMove = throttle((event: Event) => {
    handle.recordEvent(
      "dom:mousemove",
      buildPointerEventPayload(event as MouseEvent, rootElement),
    );
  }, 200);

  const throttledScroll = throttle((event: Event) => {
    handle.recordEvent(
      "dom:scroll",
      buildScrollEventPayload(event, rootElement),
    );
  }, 250);

  if (typeof window !== "undefined") {
    window.addEventListener("mousemove", throttledMouseMove, { passive: true });
    listeners.push(["mousemove", throttledMouseMove, { passive: true }]);

    window.addEventListener("scroll", throttledScroll, {
      passive: true,
      capture: true,
    });
    listeners.push([
      "scroll",
      throttledScroll,
      { passive: true, capture: true } as AddEventListenerOptions,
    ]);
  }

  return () => {
    listeners.forEach(([type, listener, options]) => {
      try {
        (target as Document).removeEventListener(type, listener, options);
      } catch (error) {
        console.warn(
          "[DevInstrumentation] Failed to remove listener",
          type,
          error,
        );
      }
    });
  };
}

function registerChromeRuntimeHooks(handle: DevInstrumentationHandle): Cleanup {
  if (!isEnabled()) {
    return () => {};
  }

  if (typeof chrome === "undefined" || !chrome.runtime) {
    return () => {};
  }

  const removers: Cleanup[] = [];

  const runtime = chrome.runtime as any;

  if (
    runtime &&
    runtime.onMessage &&
    typeof runtime.onMessage.addListener === "function"
  ) {
    const listener = (message: any, sender: chrome.runtime.MessageSender) => {
      handle.recordEvent("runtime:onMessage", {
        senderId: sender?.id,
        tabId: sender?.tab?.id,
        frameId: sender?.frameId,
        url: sender?.url,
        message: summarizeMessagePayload(message),
      });
    };
    runtime.onMessage.addListener(listener);
    removers.push(() => {
      try {
        runtime.onMessage.removeListener(listener);
      } catch (error) {
        console.warn(
          "[DevInstrumentation] Failed to detach runtime listener",
          error,
        );
      }
    });
  }

  if (
    runtime &&
    typeof runtime.sendMessage === "function" &&
    !runtime.__devInstrumentationSendWrapped
  ) {
    const originalSendMessage = runtime.sendMessage.bind(runtime);
    runtime.__devInstrumentationSendWrapped = true;

    runtime.sendMessage = function patchedSendMessage(...args: any[]) {
      handle.recordEvent("runtime:sendMessage", {
        payload: summarizeMessagePayload(args?.[0]),
        hasCallback: typeof args?.[args.length - 1] === "function",
      });

      try {
        const result = originalSendMessage(...args);

        if (result && typeof result.then === "function") {
          return result.then((response: any) => {
            handle.recordEvent(
              "runtime:sendMessage:response",
              summarizeMessagePayload(response),
            );
            return response;
          });
        }

        return result;
      } catch (error) {
        handle.recordEvent("runtime:sendMessage:error", {
          error: toErrorPayload(error),
        });
        throw error;
      }
    };

    removers.push(() => {
      try {
        if (runtime.__devInstrumentationSendWrapped) {
          runtime.sendMessage = originalSendMessage;
          delete runtime.__devInstrumentationSendWrapped;
        }
      } catch (error) {
        console.warn(
          "[DevInstrumentation] Failed to restore runtime.sendMessage",
          error,
        );
      }
    });
  }

  return () => {
    removers.forEach((fn) => fn());
  };
}

function registerLoggerInstrumentation(
  handle: DevInstrumentationHandle,
  logger?: RuntimeLoggerLike | null,
): Cleanup {
  if (!isEnabled()) {
    return () => {};
  }

  if (!logger) {
    return () => {};
  }

  const original: RuntimeLoggerLike = {
    debug: logger.debug?.bind(logger),
    info: logger.info?.bind(logger),
    warn: logger.warn?.bind(logger),
    error: logger.error?.bind(logger),
  };

  const wrap = (level: keyof RuntimeLoggerLike) => {
    const originalMethod = (logger as any)[level];

    if (typeof originalMethod !== "function") {
      return;
    }

    (logger as any)[level] = (...args: any[]) => {
      handle.recordEvent(`logger:${String(level)}`, {
        message: args?.[0],
        details: sanitize(args?.slice(1)),
      });
      return originalMethod(...args);
    };
  };

  wrap("debug");
  wrap("info");
  wrap("warn");
  wrap("error");

  return () => {
    (logger as any).debug = original.debug;
    (logger as any).info = original.info;
    (logger as any).warn = original.warn;
    (logger as any).error = original.error;
  };
}

function buildDomEventPayload(event: Event, rootElement?: Element | null) {
  const target = resolveEventTarget(event);
  return {
    type: event.type,
    target: getElementMetadata(target, rootElement),
    timeStamp: event.timeStamp,
  };
}

function buildPointerEventPayload(
  event: MouseEvent,
  rootElement?: Element | null,
) {
  const target = resolveEventTarget(event);
  return {
    type: event.type,
    position: {
      x: event?.clientX,
      y: event?.clientY,
    },
    target: getElementMetadata(target, rootElement),
    timeStamp: event.timeStamp,
  };
}

function buildScrollEventPayload(event: Event, rootElement?: Element | null) {
  const scrollTarget =
    (event.target as Element) ?? document?.documentElement ?? document?.body;
  if (!scrollTarget) {
    return {
      type: event.type,
      position: null,
      timeStamp: event.timeStamp,
    };
  }

  return {
    type: event.type,
    position: {
      scrollTop:
        (scrollTarget as Element).scrollTop ??
        document?.documentElement?.scrollTop ??
        0,
      scrollLeft:
        (scrollTarget as Element).scrollLeft ??
        document?.documentElement?.scrollLeft ??
        0,
    },
    target: getElementMetadata(scrollTarget as Element, rootElement),
    timeStamp: event.timeStamp,
  };
}

function getElementMetadata(
  element?: Element | null,
  rootElement?: Element | null,
) {
  if (!element || !(element instanceof Element)) {
    return null;
  }

  return {
    selector: buildSelector(element, rootElement),
    tag: element.tagName?.toLowerCase(),
    id: element.id || undefined,
    classes: element.classList ? Array.from(element.classList) : undefined,
    role: element.getAttribute?.("role") ?? undefined,
    name: element.getAttribute?.("name") ?? undefined,
    label: getAccessibleLabel(element),
    reactComponent: getNearestReactComponentName(element),
  };
}

function buildSelector(element: Element, rootElement?: Element | null): string {
  const parts: string[] = [];
  let current: Element | null = element;
  const boundary = rootElement ?? document?.body ?? null;

  while (current && current !== boundary && parts.length < 5) {
    let selector = current.tagName?.toLowerCase() ?? "unknown";

    if (current.id) {
      selector += `#${current.id}`;
      parts.unshift(selector);
      break;
    }

    const className = current.className?.toString().trim();
    if (className) {
      const classes = className
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((classToken) => `.${classToken}`)
        .join("");
      selector += classes;
    }

    const siblingIndex = getElementIndex(current);
    if (siblingIndex > 1) {
      selector += `:nth-of-type(${siblingIndex})`;
    }

    parts.unshift(selector);
    current = current.parentElement;
  }

  return parts.join(" > ");
}

function getElementIndex(element: Element): number {
  if (!element.parentElement) {
    return 1;
  }

  const tagName = element.tagName;
  let count = 0;
  for (const child of Array.from(element.parentElement.children)) {
    if ((child as Element).tagName === tagName) {
      count += 1;
    }
    if (child === element) {
      return count;
    }
  }

  return 1;
}

function getAccessibleLabel(element: Element): string | undefined {
  const ariaLabel = element.getAttribute?.("aria-label");
  if (ariaLabel) {
    return ariaLabel;
  }

  const ariaLabelledBy = element.getAttribute?.("aria-labelledby");
  if (ariaLabelledBy && typeof document !== "undefined") {
    const ids = ariaLabelledBy.split(/\s+/).filter(Boolean);
    const text = ids
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(" ");
    if (text) {
      return text;
    }
  }

  const htmlElement = element as HTMLElement;

  if (typeof (htmlElement as HTMLInputElement).labels !== "undefined") {
    const labels = Array.from((htmlElement as HTMLInputElement).labels ?? []);
    const labelContent = labels
      .map((label) => label.textContent?.trim())
      .filter(Boolean)
      .join(" ");
    if (labelContent) {
      return labelContent;
    }
  }

  const alt = htmlElement.getAttribute?.("alt");
  if (alt) {
    return alt;
  }

  const title = htmlElement.getAttribute?.("title");
  if (title) {
    return title;
  }

  const textContent = htmlElement.textContent?.trim();
  if (textContent) {
    return truncate(textContent, 160);
  }

  return undefined;
}

function truncate(input: string, length: number): string {
  if (input.length <= length) {
    return input;
  }
  return `${input.slice(0, length - 3)}...`;
}

function resolveEventTarget(event: Event): Element | null {
  const composedPath =
    typeof event.composedPath === "function" ? event.composedPath() : [];
  const primaryTarget =
    composedPath.length > 0
      ? (composedPath[0] as Element)
      : (event.target as Element | null);

  if (primaryTarget && primaryTarget instanceof Element) {
    return primaryTarget;
  }

  if (
    event.target &&
    (event.target as Element).nodeType === Node.ELEMENT_NODE
  ) {
    return event.target as Element;
  }

  return null;
}

function getNearestReactComponentName(element: Element): string | undefined {
  if (!element) {
    return undefined;
  }

  let current: Element | null = element;

  while (current) {
    const maybeFiber = findReactFiber(
      current as unknown as Record<string, any>,
    );
    if (maybeFiber) {
      const name = extractFiberName(maybeFiber);
      if (name) {
        return name;
      }
    }
    current = current.parentElement;
  }

  return undefined;
}

function findReactFiber(node: Record<string, any>): any | undefined {
  const keys = Object.keys(node);
  for (const key of keys) {
    if (
      key.startsWith("__reactFiber$") ||
      key.startsWith("__reactInternalInstance$")
    ) {
      return node[key];
    }
  }
  return undefined;
}

function extractFiberName(fiber: any): string | undefined {
  const nodeType = fiber?.type;
  if (!nodeType) {
    return undefined;
  }

  if (typeof nodeType === "string") {
    return nodeType;
  }

  return nodeType.displayName || nodeType.name || undefined;
}

function throttle<T extends (...args: any[]) => void>(
  fn: T,
  interval: number,
): T {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const throttled = ((...args: any[]) => {
    const now = Date.now();
    const remaining = interval - (now - last);

    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      last = now;
      fn(...args);
      return;
    }

    if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...args);
      }, remaining);
    }
  }) as T;

  return throttled;
}

function sanitize(value: any): any {
  if (value === null || typeof value === "undefined") {
    return value;
  }

  if (value instanceof Error) {
    return toErrorPayload(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }

  if (typeof value === "object") {
    if (typeof Node !== "undefined" && value instanceof Node) {
      return {
        nodeType: value.nodeType,
        nodeName: value.nodeName,
        textContent: truncate(value.textContent ?? "", 80),
      };
    }

    const result: Record<string, any> = {};
    const entries = Object.entries(value).slice(0, 25);
    for (const [key, entryValue] of entries) {
      result[key] = sanitize(entryValue);
    }
    return result;
  }

  if (typeof value === "function") {
    return `ƒ ${value.name || "anonymous"}`;
  }

  return value;
}

function toErrorPayload(error: any) {
  if (!error) {
    return undefined;
  }

  return {
    message: error?.message ?? String(error),
    stack: typeof error?.stack === "string" ? error.stack : undefined,
    name: error?.name,
  };
}

function summarizeMessagePayload(payload: any) {
  if (!payload) {
    return payload;
  }

  if (typeof payload === "string") {
    return truncate(payload, 200);
  }

  if (typeof payload === "object") {
    return sanitize({
      kind: (payload as any)?.kind ?? (payload as any)?.type,
      keys: Object.keys(payload).slice(0, 10),
      preview: truncate(JSON.stringify(payload, null, 2).slice(0, 2000), 2000),
    });
  }

  return payload;
}

function safeStableStringify(value: any): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

/**
 * Initializes the dev instrumentation for the provided surface.
 * Returns a handle that can be used to record additional events or state
 * snapshots. Calling this function multiple times for the same surface returns
 * the existing handle to avoid duplicate listeners (supports hot reload).
 */
export function initializeDevInstrumentation(
  surface: InstrumentationSurface,
  options: InitializeInstrumentationOptions = {},
): DevInstrumentationHandle | null {
  if (!isEnabled()) {
    return null;
  }

  const registry = getRegistry();
  let state = registry.surfaces[surface];

  if (!state) {
    state = {
      initialized: false,
      cleanupFns: [],
      handle: null as unknown as DevInstrumentationHandle,
      snapshotHashes: {},
    } satisfies SurfaceState;
    registry.surfaces[surface] = state;
  }

  if (!state.initialized) {
    state.handle = createHandle(surface, state);

    const cleanupFns: Cleanup[] = [];

    cleanupFns.push(registerChromeRuntimeHooks(state.handle));
    cleanupFns.push(
      registerDomListeners(
        state.handle,
        options.domTarget,
        options.rootElement ?? null,
      ),
    );
    cleanupFns.push(
      registerLoggerInstrumentation(state.handle, options.logger ?? null),
    );

    state.cleanupFns = cleanupFns;
    state.initialized = true;

    state.handle.recordEvent("lifecycle:initialized", {
      surface,
      href: typeof location !== "undefined" ? location.href : undefined,
    });
  }

  return state.handle;
}

export function getDevInstrumentation(
  surface: InstrumentationSurface,
): DevInstrumentationHandle | null {
  if (!isEnabled()) {
    return null;
  }

  const registry = getRegistry();
  const state = registry.surfaces[surface];
  return state?.handle ?? null;
}

export function teardownDevInstrumentation(
  surface: InstrumentationSurface,
): void {
  if (!isEnabled()) {
    return;
  }

  const registry = getRegistry();
  const state = registry.surfaces[surface];

  if (!state || !state.initialized) {
    return;
  }

  state.cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      console.warn(
        "[DevInstrumentation] Failed during teardown",
        surface,
        error,
      );
    }
  });

  state.cleanupFns = [];
  state.initialized = false;
}
