import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import * as React from "react";
import { ProviderDetailView } from "../src/sidepanel/components/settings/ProviderDetailView";

vi.mock("../src/components/ui/select", () => {
  const SelectContext = React.createContext<{
    value?: string;
    onValueChange?: (value: string) => void;
  }>({});

  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: React.PropsWithChildren<{
      value?: string;
      onValueChange?: (value: string) => void;
    }>) => (
      <SelectContext.Provider value={{ value, onValueChange }}>
        {children}
      </SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: React.PropsWithChildren) => {
      const ctx = React.useContext(SelectContext);
      return (
        <label>
          <span>Model</span>
          <select
            aria-label="Model"
            value={ctx.value}
            onChange={(e) => ctx.onValueChange?.(e.target.value)}
          >
            {children}
          </select>
        </label>
      );
    },
    SelectValue: () => null,
    SelectContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
    SelectItem: ({
      value,
      children,
    }: React.PropsWithChildren<{ value: string }>) => (
      <option value={value}>{children}</option>
    ),
  };
});

const mockSendMessage = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).chrome = {
  runtime: {
    sendMessage: mockSendMessage,
  },
};

const mockProvider = {
  id: "provider_1",
  type: "openai",
  name: "OpenAI",
  enabled: true,
  baseUrl: "https://api.openai.com/v1",
  endpointMode: "native",
  apiKeyId: "key_1", // Indicates saved key
};

const mockModelSheet = {
  "gpt-4": {
    modelId: "gpt-4",
    providerId: "provider_1",
    providerType: "openai",
    enabled: true,
  },
  "gpt-3.5": {
    modelId: "gpt-3.5",
    providerId: "provider_1",
    providerType: "openai",
    enabled: true,
  },
  claude: {
    modelId: "claude",
    providerId: "provider_2",
    providerType: "anthropic",
    enabled: true,
  },
};

describe("ProviderDetailView", () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
    mockSendMessage.mockResolvedValue({ success: true });
  });

  it("renders saved or not-saved key state, Replace key, Delete key, and Retest actions without revealing the stored secret", async () => {
    render(
      <ProviderDetailView
        provider={mockProvider}
        modelSheet={mockModelSheet}
        onBack={() => {}}
        onUpdate={() => {}}
      />,
    );

    expect(screen.getByText(/API Key Saved/i)).toBeInTheDocument();

    expect(screen.getByText(/Replace key/i)).toBeInTheDocument();
    expect(screen.getByText(/Delete key/i)).toBeInTheDocument();
    expect(screen.getByText(/Retest/i)).toBeInTheDocument();
  });

  it("shows the provider-scoped model IDs in the detail view data", async () => {
    render(
      <ProviderDetailView
        provider={mockProvider}
        modelSheet={mockModelSheet}
        onBack={() => {}}
        onUpdate={() => {}}
      />,
    );

    expect(screen.getByText("gpt-4")).toBeInTheDocument();
    expect(screen.getByText("gpt-3.5")).toBeInTheDocument();
    expect(screen.queryByText("claude")).toBeNull();
  });

  it("shows a manual-add hint when no models are configured for the provider", async () => {
    render(
      <ProviderDetailView
        provider={mockProvider}
        modelSheet={{}}
        onBack={() => {}}
        onUpdate={() => {}}
      />,
    );

    expect(
      screen.getByText(/no models were discovered for this provider yet/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Add a new model")).toBeInTheDocument();
  });

  it("calls a dedicated typed message such as PROVIDER_SETTINGS_DELETE_KEY when deleting a saved API key", async () => {
    render(
      <ProviderDetailView
        provider={mockProvider}
        modelSheet={mockModelSheet}
        onBack={() => {}}
        onUpdate={() => {}}
      />,
    );

    fireEvent.click(screen.getByText(/Delete key/i));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "PROVIDER_SETTINGS_DELETE_KEY",
          payload: expect.objectContaining({ providerId: "provider_1" }),
        }),
      );
    });
  });
});
