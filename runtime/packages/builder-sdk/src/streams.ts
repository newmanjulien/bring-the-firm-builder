import type { EmailDraftPatch } from './email.js';

export type TranscriptMessage = {
	role: 'user' | 'assistant';
	text: string;
};

export type ChatReplyDeltaHandler = (delta: string) => void | Promise<void>;

export type ChatReplyStreamHandlers = {
	onDelta?: ChatReplyDeltaHandler;
};

export type EmailBuilderTurnStreamHandlers = {
	onTextDelta?: ChatReplyDeltaHandler;
};

export type EmailBuilderTurnStreamResult = {
	text: string;
	patch: EmailDraftPatch | null;
};

const UPDATE_EMAIL_DRAFT_TOOL_NAME = 'update_email_draft';

type OpenAIStreamEvent = {
	type?: string;
	delta?: string;
	text?: string;
	arguments?: string;
	name?: string;
	output_index?: number;
	item_id?: string;
	item?: {
		id?: string;
		type?: string;
		name?: string;
		arguments?: string;
	};
	error?: {
		message?: string;
	};
	response?: {
		status?: string;
		incomplete_details?: {
			reason?: string;
		} | null;
		error?: {
			message?: string;
		};
	};
};

type ToolCallAccumulator = {
	name: string | null;
	arguments: string;
};

type ParsedStreamEvent =
	| {
			type: 'delta';
			text: string;
	  }
	| {
			type: 'done';
			text: string;
	  }
	| {
			type: 'ignored';
	  };

function getStreamErrorMessage(event: OpenAIStreamEvent) {
	return event.error?.message ?? event.response?.error?.message;
}

function throwIfStreamFailed(event: OpenAIStreamEvent) {
	const errorMessage = getStreamErrorMessage(event);

	if (event.type === 'error' || event.type === 'response.failed' || errorMessage) {
		throw new Error(errorMessage ?? 'OpenAI stream failed.');
	}

	if (event.type === 'response.incomplete' || event.response?.status === 'incomplete') {
		const reason = event.response?.incomplete_details?.reason ?? 'unknown';
		throw new Error(`OpenAI response was incomplete: ${reason}.`);
	}
}

function parseStreamEvent(event: OpenAIStreamEvent): ParsedStreamEvent {
	if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
		return {
			type: 'delta',
			text: event.delta
		};
	}

	if (event.type === 'response.output_text.done' && typeof event.text === 'string') {
		return {
			type: 'done',
			text: event.text
		};
	}

	throwIfStreamFailed(event);

	return {
		type: 'ignored'
	};
}

async function processSseChunk(
	chunk: string,
	onEvent: (event: OpenAIStreamEvent) => Promise<void>
) {
	const dataLines = chunk
		.split('\n')
		.map((line) => line.trimEnd())
		.filter((line) => line.startsWith('data:'))
		.map((line) => line.slice('data:'.length).trimStart());

	if (dataLines.length === 0) {
		return;
	}

	const data = dataLines.join('\n');

	if (data === '[DONE]') {
		return;
	}

	await onEvent(JSON.parse(data) as OpenAIStreamEvent);
}

async function readSseResponse(
	response: Response,
	onEvent: (event: OpenAIStreamEvent) => Promise<void>
) {
	const reader = response.body?.getReader();

	if (!reader) {
		throw new Error('OpenAI returned an empty stream.');
	}

	const decoder = new TextDecoder();
	let buffer = '';

	async function processCompleteChunks() {
		const chunks = buffer.split(/\r?\n\r?\n/);
		buffer = chunks.pop() ?? '';

		for (const chunk of chunks) {
			await processSseChunk(chunk, onEvent);
		}
	}

	try {
		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				break;
			}

			buffer += decoder.decode(value, { stream: true });
			await processCompleteChunks();
		}

		buffer += decoder.decode();

		if (buffer.trim()) {
			await processSseChunk(buffer, onEvent);
		}
	} finally {
		reader.releaseLock();
	}
}

export async function readOpenAIStream(response: Response, handlers: ChatReplyStreamHandlers) {
	let streamedText = '';
	let finalText = '';

	await readSseResponse(response, async (event) => {
		const parsed = parseStreamEvent(event);

		if (parsed.type === 'delta') {
			streamedText += parsed.text;
			await handlers.onDelta?.(parsed.text);
			return;
		}

		if (parsed.type === 'done') {
			finalText = parsed.text;
		}
	});

	const text = finalText || streamedText;

	if (!text.trim()) {
		throw new Error('OpenAI returned an empty response.');
	}

	return text;
}

function getToolCallKey(event: OpenAIStreamEvent) {
	if (typeof event.item_id === 'string') {
		return event.item_id;
	}

	if (event.item?.id) {
		return event.item.id;
	}

	if (typeof event.output_index === 'number') {
		return `output:${event.output_index}`;
	}

	return 'output:0';
}

function getOrCreateToolCall(
	toolCalls: Map<string, ToolCallAccumulator>,
	event: OpenAIStreamEvent
) {
	const key = getToolCallKey(event);
	const existing = toolCalls.get(key);

	if (existing) {
		const name = event.item?.name ?? event.name;

		if (!existing.name && name) {
			existing.name = name;
		}

		return existing;
	}

	const toolCall: ToolCallAccumulator = {
		name: event.item?.name ?? event.name ?? null,
		arguments: event.item?.arguments ?? ''
	};

	toolCalls.set(key, toolCall);
	return toolCall;
}

function parseEmailDraftPatch(argumentsText: string) {
	if (!argumentsText.trim()) {
		throw new Error('OpenAI called update_email_draft without arguments.');
	}

	return JSON.parse(argumentsText) as EmailDraftPatch;
}

export async function readEmailBuilderTurnStream(
	response: Response,
	handlers: EmailBuilderTurnStreamHandlers
): Promise<EmailBuilderTurnStreamResult> {
	const toolCalls = new Map<string, ToolCallAccumulator>();
	let streamedText = '';
	let finalText = '';
	let patch: EmailDraftPatch | null = null;

	await readSseResponse(response, async (event) => {
		throwIfStreamFailed(event);

		if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
			streamedText += event.delta;
			await handlers.onTextDelta?.(event.delta);
			return;
		}

		if (event.type === 'response.output_text.done' && typeof event.text === 'string') {
			finalText = event.text;
			return;
		}

		if (event.type === 'response.output_item.added' && event.item?.type === 'function_call') {
			getOrCreateToolCall(toolCalls, event);
			return;
		}

		if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
			const toolCall = getOrCreateToolCall(toolCalls, event);
			toolCall.name = event.item.name ?? toolCall.name;
			toolCall.arguments = event.item.arguments ?? toolCall.arguments;
			return;
		}

		if (
			event.type === 'response.function_call_arguments.delta' &&
			typeof event.delta === 'string'
		) {
			getOrCreateToolCall(toolCalls, event).arguments += event.delta;
			return;
		}

		if (event.type === 'response.function_call_arguments.done') {
			const toolCall = getOrCreateToolCall(toolCalls, event);
			toolCall.name = event.item?.name ?? event.name ?? toolCall.name;
			toolCall.arguments = event.item?.arguments ?? event.arguments ?? toolCall.arguments;
		}
	});

	const draftToolCalls = Array.from(toolCalls.values()).filter((toolCall) => {
		if (toolCall.name && toolCall.name !== UPDATE_EMAIL_DRAFT_TOOL_NAME) {
			throw new Error(`OpenAI called an unsupported tool: ${toolCall.name}.`);
		}

		return toolCall.arguments.trim().length > 0;
	});

	if (draftToolCalls.length > 1) {
		throw new Error('OpenAI called update_email_draft more than once.');
	}

	if (draftToolCalls[0]) {
		patch = parseEmailDraftPatch(draftToolCalls[0].arguments);
	}

	const text = finalText || streamedText;

	if (!text.trim() && !patch) {
		throw new Error('OpenAI returned an empty builder response.');
	}

	return {
		text,
		patch
	};
}
