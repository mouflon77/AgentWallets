import type { SafeAgentSigner } from "../core/safe-agent-signer";
import type { SolanaTransferResult } from "../core/transfer";

/** LLM provider for AgentEngine. OpenAI has the most mature tool-calling API. */
export type LlmProvider = "openai" | "anthropic" | "gemini";

export const EXECUTE_SOLANA_TRANSFER_TOOL = {
  name: "execute_solana_transfer",
  description:
    "Send native SOL from the agent wallet to a recipient. Only call when the user clearly wants to move funds.",
  parameters: {
    type: "object" as const,
    properties: {
      recipient: {
        type: "string",
        description: "Recipient Solana address (base58).",
      },
      amount_sol: {
        type: "number",
        description: "Amount to send in SOL (not lamports).",
      },
    },
    required: ["recipient", "amount_sol"],
  },
};

export interface AgentEngineConfig {
  /** Connected SafeAgentSigner with a loaded wallet. */
  signer: SafeAgentSigner;
  /** Defaults to `openai` — best-documented tool calling. */
  provider?: LlmProvider;
  /** API key; falls back to OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY. */
  apiKey?: string;
  /** Model override. Defaults vary by provider. */
  model?: string;
  /** Max tool-call rounds before returning. Default 8. */
  maxToolRounds?: number;
  /** Optional system prompt prepended to every run. */
  systemPrompt?: string;
}

export interface AgentToolCallRecord {
  tool: typeof EXECUTE_SOLANA_TRANSFER_TOOL.name;
  input: { recipient: string; amount_sol: number };
  output: SolanaTransferResult;
}

export interface AgentRunResult {
  /** Final assistant text after tool rounds complete. */
  text: string;
  /** Transfers attempted during this run. */
  transfers: AgentToolCallRecord[];
}

interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

interface LlmTurn {
  assistantText: string;
  toolCalls: PendingToolCall[];
}

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-20250514",
  gemini: "gemini-2.0-flash",
};

const SYSTEM_PROMPT = `You are a Solana wallet agent. You can move funds only by calling execute_solana_transfer.
Never invent transaction signatures. If a transfer requires human approval, tell the user to open the Guardian app on their phone.`;

function resolveApiKey(provider: LlmProvider, override?: string): string {
  const key =
    override ??
    (provider === "openai"
      ? process.env.OPENAI_API_KEY
      : provider === "anthropic"
        ? process.env.ANTHROPIC_API_KEY
        : process.env.GEMINI_API_KEY);

  if (!key) {
    throw new Error(
      `Missing API key for ${provider}. Set ${provider === "openai" ? "OPENAI_API_KEY" : provider === "anthropic" ? "ANTHROPIC_API_KEY" : "GEMINI_API_KEY"} or pass apiKey.`,
    );
  }

  return key;
}

function parseTransferArgs(raw: string): { recipient: string; amount_sol: number } {
  const parsed = JSON.parse(raw) as {
    recipient?: string;
    amount_sol?: number;
  };

  if (!parsed.recipient || typeof parsed.amount_sol !== "number") {
    throw new Error(
      "execute_solana_transfer requires recipient (string) and amount_sol (number).",
    );
  }

  return { recipient: parsed.recipient, amount_sol: parsed.amount_sol };
}

function formatTransferResult(result: SolanaTransferResult): string {
  if (result.result.status === "signed") {
    return JSON.stringify({
      status: "signed",
      recipient: result.recipient,
      amount_sol: result.amountSol,
      signature: result.signature,
    });
  }

  return JSON.stringify({
    status: "requires_human_approval",
    recipient: result.recipient,
    amount_sol: result.amountSol,
    threshold_sol: result.result.thresholdSol,
    solana_address: result.result.solanaAddress,
    message:
      "Transfer queued — user must approve in the Guardian app (Face ID).",
  });
}

type OpenAiMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

async function callOpenAi(
  apiKey: string,
  model: string,
  messages: OpenAiMessage[],
): Promise<LlmTurn> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model,
    messages,
    tools: [
      {
        type: "function",
        function: EXECUTE_SOLANA_TRANSFER_TOOL,
      },
    ],
  });

  const choice = response.choices[0]?.message;
  const toolCalls =
    choice?.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    })) ?? [];

  return {
    assistantText: choice?.content ?? "",
    toolCalls,
  };
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  toolResults: Array<{ toolUseId: string; content: string }>,
): Promise<LlmTurn> {
  const messages: Array<{ role: string; content: unknown }> = [
    { role: "user", content: userPrompt },
  ];

  if (toolResults.length > 0) {
    messages.push({
      role: "user",
      content: toolResults.map((r) => ({
        type: "tool_result",
        tool_use_id: r.toolUseId,
        content: r.content,
      })),
    });
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      tools: [
        {
          name: EXECUTE_SOLANA_TRANSFER_TOOL.name,
          description: EXECUTE_SOLANA_TRANSFER_TOOL.description,
          input_schema: EXECUTE_SOLANA_TRANSFER_TOOL.parameters,
        },
      ],
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as {
    content: Array<
      | { type: "text"; text: string }
      | { type: "tool_use"; id: string; name: string; input: unknown }
    >;
  };

  let assistantText = "";
  const toolCalls: PendingToolCall[] = [];

  for (const block of data.content) {
    if (block.type === "text") assistantText += block.text;
    if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: JSON.stringify(block.input),
      });
    }
  }

  return { assistantText, toolCalls };
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  toolResults: Array<{ content: string }>,
): Promise<LlmTurn> {
  const contents: Array<{ role: string; parts: unknown[] }> = [
    { role: "user", parts: [{ text: userPrompt }] },
  ];

  for (const result of toolResults) {
    contents.push({
      role: "user",
      parts: [
        {
          functionResponse: {
            name: EXECUTE_SOLANA_TRANSFER_TOOL.name,
            response: JSON.parse(result.content),
          },
        },
      ],
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools: [
          {
            functionDeclarations: [
              {
                name: EXECUTE_SOLANA_TRANSFER_TOOL.name,
                description: EXECUTE_SOLANA_TRANSFER_TOOL.description,
                parameters: EXECUTE_SOLANA_TRANSFER_TOOL.parameters,
              },
            ],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<
          | { text?: string }
          | { functionCall?: { name: string; args: Record<string, unknown> } }
        >;
      };
    }>;
  };

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  let assistantText = "";
  const toolCalls: PendingToolCall[] = [];

  for (const part of parts) {
    if ("text" in part && part.text) assistantText += part.text;
    if ("functionCall" in part && part.functionCall) {
      toolCalls.push({
        id: `gemini-${toolCalls.length}`,
        name: part.functionCall.name,
        arguments: JSON.stringify(part.functionCall.args),
      });
    }
  }

  return { assistantText, toolCalls };
}

/**
 * LLM agent loop with a single privileged tool: `execute_solana_transfer`.
 * Tool output is routed through {@link SafeAgentSigner} (Turnkey MPC + policies).
 */
export class AgentEngine {
  private readonly signer: SafeAgentSigner;
  private readonly provider: LlmProvider;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxToolRounds: number;
  private readonly systemPrompt: string;

  constructor(config: AgentEngineConfig) {
    this.signer = config.signer;
    this.provider = config.provider ?? "openai";
    this.apiKey = resolveApiKey(this.provider, config.apiKey);
    this.model = config.model ?? DEFAULT_MODELS[this.provider];
    this.maxToolRounds = config.maxToolRounds ?? 8;
    this.systemPrompt = config.systemPrompt ?? SYSTEM_PROMPT;
  }

  /** Run the agent on a user prompt; executes transfers via SafeAgentSigner when the LLM calls the tool. */
  async run(prompt: string): Promise<AgentRunResult> {
    this.signer.getWallet();

    const transfers: AgentToolCallRecord[] = [];

    if (this.provider === "openai") {
      return this.runOpenAi(prompt, transfers);
    }

    return this.runSingleShotProviders(prompt, transfers);
  }

  private async runOpenAi(
    prompt: string,
    transfers: AgentToolCallRecord[],
  ): Promise<AgentRunResult> {
    const messages: OpenAiMessage[] = [
      { role: "system", content: this.systemPrompt },
      { role: "user", content: prompt },
    ];

    let finalText = "";

    for (let round = 0; round < this.maxToolRounds; round++) {
      const turn = await callOpenAi(this.apiKey, this.model, messages);

      if (turn.toolCalls.length === 0) {
        finalText = turn.assistantText;
        break;
      }

      messages.push({
        role: "assistant",
        content: turn.assistantText || null,
        tool_calls: turn.toolCalls.map((call) => ({
          id: call.id,
          type: "function" as const,
          function: { name: call.name, arguments: call.arguments },
        })),
      });

      for (const call of turn.toolCalls) {
        const content = await this.handleToolCall(call, transfers);
        messages.push({ role: "tool", tool_call_id: call.id, content });
      }

      if (round === this.maxToolRounds - 1) {
        finalText =
          turn.assistantText ||
          "Stopped after max tool rounds. Check transfers for results.";
      }
    }

    return { text: finalText, transfers };
  }

  private async runSingleShotProviders(
    prompt: string,
    transfers: AgentToolCallRecord[],
  ): Promise<AgentRunResult> {
    let finalText = "";
    const anthropicResults: Array<{ toolUseId: string; content: string }> = [];
    const geminiResults: Array<{ content: string }> = [];

    for (let round = 0; round < this.maxToolRounds; round++) {
      const turn =
        this.provider === "anthropic"
          ? await callAnthropic(
              this.apiKey,
              this.model,
              this.systemPrompt,
              prompt,
              anthropicResults,
            )
          : await callGemini(
              this.apiKey,
              this.model,
              this.systemPrompt,
              prompt,
              geminiResults,
            );

      if (turn.toolCalls.length === 0) {
        finalText = turn.assistantText;
        break;
      }

      for (const call of turn.toolCalls) {
        const content = await this.handleToolCall(call, transfers);
        if (this.provider === "anthropic") {
          anthropicResults.push({ toolUseId: call.id, content });
        } else {
          geminiResults.push({ content });
        }
      }

      if (round === this.maxToolRounds - 1) {
        finalText =
          turn.assistantText ||
          "Stopped after max tool rounds. Check transfers for results.";
      }
    }

    return { text: finalText, transfers };
  }

  private async handleToolCall(
    call: PendingToolCall,
    transfers: AgentToolCallRecord[],
  ): Promise<string> {
    if (call.name !== EXECUTE_SOLANA_TRANSFER_TOOL.name) {
      throw new Error(`Unknown tool: ${call.name}`);
    }

    const args = parseTransferArgs(call.arguments);
    const output = await this.signer.executeSolanaTransfer({
      recipient: args.recipient,
      amountSol: args.amount_sol,
    });

    transfers.push({
      tool: EXECUTE_SOLANA_TRANSFER_TOOL.name,
      input: args,
      output,
    });

    return formatTransferResult(output);
  }
}
