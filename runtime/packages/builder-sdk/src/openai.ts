export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const STRUCTURED_MAX_OUTPUT_TOKENS = 8_000;

const DEFAULT_OPENAI_MODEL = "gpt-5.4-nano";
const DEFAULT_OPENAI_FAST_MODEL = "gpt-5.4-nano";
const DEFAULT_OPENAI_REASONING_EFFORT = "low";
const DEFAULT_OPENAI_FAST_REASONING_EFFORT = "low";

type OpenAIErrorResponse = {
  error?: {
    message?: string;
  };
};

type OpenAIResponseBody = {
  output_text?: string;
  output?: Array<{
    type?: string;
    name?: string;
    arguments?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

export type OpenAIModelProfile = "default" | "fast";
export type OpenAIReasoningEffort = "minimal" | "low" | "medium" | "high";
export type OpenAIConfig = {
  apiKey: string;
  model: string;
  reasoningEffort: OpenAIReasoningEffort;
};
export type OpenAIConfigParams = {
  apiKey: string | undefined;
  chatModel?: string;
  fastChatModel?: string;
  reasoningEffort?: string;
  fastReasoningEffort?: string;
  profile?: OpenAIModelProfile;
};

function isOpenAIReasoningEffort(
  value: string | undefined,
): value is OpenAIReasoningEffort {
  return (
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high"
  );
}

function getReasoningEffort(
  value: string | undefined,
  fallback: OpenAIReasoningEffort,
) {
  return isOpenAIReasoningEffort(value) ? value : fallback;
}

export function getOpenAIConfig({
  apiKey,
  chatModel,
  fastChatModel,
  reasoningEffort: configuredReasoningEffort,
  fastReasoningEffort,
  profile = "default",
}: OpenAIConfigParams): OpenAIConfig {
  const model =
    profile === "fast"
      ? (fastChatModel ?? DEFAULT_OPENAI_FAST_MODEL)
      : (chatModel ?? DEFAULT_OPENAI_MODEL);
  const reasoningEffort =
    profile === "fast"
      ? getReasoningEffort(
          fastReasoningEffort,
          DEFAULT_OPENAI_FAST_REASONING_EFFORT,
        )
      : getReasoningEffort(
          configuredReasoningEffort,
          DEFAULT_OPENAI_REASONING_EFFORT,
        );

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  return { apiKey, model, reasoningEffort };
}

export function supportsReasoningOptions(model: string) {
  return model.startsWith("gpt-5") || model.startsWith("o");
}

export function getOpenAIHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export async function getOpenAIErrorMessage(response: Response) {
  try {
    const responseBody = (await response.json()) as OpenAIErrorResponse;
    return (
      responseBody.error?.message ??
      `OpenAI request failed with ${response.status}.`
    );
  } catch {
    return `OpenAI request failed with ${response.status}.`;
  }
}

function getFunctionCallArguments(
  responseBody: OpenAIResponseBody,
  toolName: string,
) {
  for (const outputItem of responseBody.output ?? []) {
    if (outputItem.type === "function_call" && outputItem.name === toolName) {
      if (!outputItem.arguments) {
        throw new Error(`OpenAI called ${toolName} without arguments.`);
      }

      return outputItem.arguments;
    }
  }

  throw new Error(`OpenAI did not call ${toolName}.`);
}

export async function callStructuredTool<T>(params: {
  systemPrompt: string;
  userPrompt: string;
  toolName: string;
  toolDescription: string;
  toolParameters: unknown;
  openAIConfig: OpenAIConfig;
}) {
  const { apiKey, model, reasoningEffort } = params.openAIConfig;
  const body = {
    model,
    input: [
      {
        role: "system",
        content: params.systemPrompt,
      },
      {
        role: "user",
        content: params.userPrompt,
      },
    ],
    tools: [
      {
        type: "function",
        name: params.toolName,
        description: params.toolDescription,
        parameters: params.toolParameters,
        strict: true,
      },
    ],
    tool_choice: {
      type: "function",
      name: params.toolName,
    },
    parallel_tool_calls: false,
    ...(supportsReasoningOptions(model)
      ? { reasoning: { effort: reasoningEffort } }
      : {}),
    max_output_tokens: STRUCTURED_MAX_OUTPUT_TOKENS,
    store: false,
    stream: false,
  };

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: getOpenAIHeaders(apiKey),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await getOpenAIErrorMessage(response));
  }

  const responseBody = (await response.json()) as OpenAIResponseBody;

  if (responseBody.error?.message) {
    throw new Error(responseBody.error.message);
  }

  return JSON.parse(
    getFunctionCallArguments(responseBody, params.toolName),
  ) as T;
}
