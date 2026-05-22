import type {
	BuilderAppBackgroundJobInput,
	BuilderAppContinueTurnInput,
	BuilderAppFinalEvent,
	BuilderAppOutputEvent,
	BuilderAppStartTurnInput,
	BuilderRuntimeContext,
	BuilderRuntimeStreamEvent
} from './app-protocol.js';

export const BUILDER_RUNTIME_ROUTES = {
	manifest: 'manifest',
	startTurn: 'start-turn',
	continueTurn: 'continue-turn',
	backgroundJob: 'background-job'
} as const;

export type BuilderRuntimeRoute =
	(typeof BUILDER_RUNTIME_ROUTES)[Exclude<keyof typeof BUILDER_RUNTIME_ROUTES, 'manifest'>];

export type BuilderRuntimeInput =
	| BuilderAppStartTurnInput
	| BuilderAppContinueTurnInput
	| BuilderAppBackgroundJobInput;

export type BuilderRuntimeEventHandler = (
	event: BuilderAppOutputEvent
) => Promise<void> | void;

export type BuilderRuntimeStreamEventHandler = (
	event: BuilderRuntimeStreamEvent
) => Promise<void> | void;

export const BUILDER_RUNTIME_HEADERS = {
	app: 'x-overbase-app',
	timestamp: 'x-overbase-timestamp',
	signature: 'x-overbase-signature'
} as const;

export const BUILDER_RUNTIME_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

type SignedRuntimeOptions = {
	secret: string | undefined;
	expectedAppSlug: string;
	maxClockSkewMs?: number;
	now?: number;
};

function toHex(bytes: ArrayBuffer) {
	return [...new Uint8Array(bytes)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

function hexToBytes(value: string) {
	if (value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) {
		return null;
	}

	const bytes = new Uint8Array(value.length / 2);

	for (let index = 0; index < value.length; index += 2) {
		bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
	}

	return bytes;
}

export function signaturesEqual(left: string, right: string) {
	const leftBytes = hexToBytes(left);
	const rightBytes = hexToBytes(right);

	if (!leftBytes || !rightBytes || leftBytes.length !== rightBytes.length) {
		return false;
	}

	let diff = 0;

	for (let index = 0; index < leftBytes.length; index += 1) {
		diff |= leftBytes[index] ^ rightBytes[index];
	}

	return diff === 0;
}

export async function createBuilderRuntimeSignature(params: {
	secret: string;
	timestamp: string;
	body: string;
}) {
	const key = await globalThis.crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(params.secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await globalThis.crypto.subtle.sign(
		'HMAC',
		key,
		new TextEncoder().encode(`${params.timestamp}.${params.body}`)
	);

	return toHex(signature);
}

export async function verifyBuilderRuntimeSignature(params: {
	headers: Headers;
	body: string;
	secret: string | undefined;
	expectedAppSlug: string;
	maxClockSkewMs?: number;
	now?: number;
}) {
	if (!params.secret) {
		throw new Error('Builder runtime secret is not configured.');
	}

	const signature = params.headers.get(BUILDER_RUNTIME_HEADERS.signature) ?? '';
	const timestamp = params.headers.get(BUILDER_RUNTIME_HEADERS.timestamp) ?? '';
	const appSlug = params.headers.get(BUILDER_RUNTIME_HEADERS.app) ?? '';
	const timestampMs = Number(timestamp);
	const now = params.now ?? Date.now();
	const maxClockSkewMs = params.maxClockSkewMs ?? BUILDER_RUNTIME_MAX_CLOCK_SKEW_MS;

	if (appSlug !== params.expectedAppSlug) {
		return 'Invalid app.';
	}

	if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > maxClockSkewMs) {
		return 'Invalid timestamp.';
	}

	const expectedSignature = await createBuilderRuntimeSignature({
		secret: params.secret,
		timestamp,
		body: params.body
	});

	if (!signature || !signaturesEqual(signature, expectedSignature)) {
		return 'Invalid signature.';
	}

	return null;
}

async function parseBuilderRuntimeEventLine(line: string) {
	try {
		const event = JSON.parse(line) as BuilderAppOutputEvent;

		if (event.type === 'fail') {
			throw new Error(event.errorText);
		}

		return event;
	} catch (error) {
		if (error instanceof Error) {
			throw error;
		}

		throw new Error('The app runtime returned an invalid event.');
	}
}

function isBuilderRuntimeStreamEvent(
	event: BuilderAppOutputEvent
): event is BuilderRuntimeStreamEvent {
	return event.type === 'assistantDelta';
}

function isBuilderAppFinalEvent(event: BuilderAppOutputEvent): event is BuilderAppFinalEvent {
	return !isBuilderRuntimeStreamEvent(event);
}

export async function readBuilderRuntimeEvents(
	response: Response,
	onEvent?: BuilderRuntimeEventHandler
) {
	const events: BuilderAppOutputEvent[] = [];

	if (!response.body) {
		return events;
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { done, value } = await reader.read();

		if (done) {
			break;
		}

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';

		for (const line of lines) {
			const trimmedLine = line.trim();

			if (!trimmedLine) {
				continue;
			}

			const event = await parseBuilderRuntimeEventLine(trimmedLine);
			events.push(event);
			await onEvent?.(event);
		}
	}

	buffer += decoder.decode();

	if (buffer.trim()) {
		const event = await parseBuilderRuntimeEventLine(buffer.trim());
		events.push(event);
		await onEvent?.(event);
	}

	return events;
}

export async function streamBuilderRuntimeEvents(
	run: (context: BuilderRuntimeContext) => Promise<BuilderAppFinalEvent[]>
) {
	const encoder = new TextEncoder();

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			void (async () => {
				try {
					const emit = async (event: BuilderAppOutputEvent) => {
						controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
					};
					const events = await run({
						emit: async (event) => {
							await emit(event);
						}
					});

					for (const event of events) {
						await emit(event);
					}

					controller.close();
				} catch (error) {
					const message = error instanceof Error ? error.message : 'Runtime request failed.';
					controller.enqueue(
						encoder.encode(`${JSON.stringify({ type: 'fail', errorText: message })}\n`)
					);
					controller.close();
				}
			})();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'application/x-ndjson; charset=utf-8',
			'cache-control': 'no-store'
		}
	});
}

export async function callBuilderRuntime(params: {
	fetchImpl?: typeof fetch;
	baseUrl: string;
	secret: string;
	appSlug: string;
	route: BuilderRuntimeRoute;
	input: BuilderRuntimeInput;
	onStreamEvent?: BuilderRuntimeStreamEventHandler;
}) {
	const fetchImpl = params.fetchImpl ?? fetch;
	const body = JSON.stringify(params.input);
	const timestamp = String(Date.now());
	const signature = await createBuilderRuntimeSignature({
		secret: params.secret,
		timestamp,
		body
	});
	const response = await fetchImpl(`${params.baseUrl}/api/builder/${params.route}`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			[BUILDER_RUNTIME_HEADERS.app]: params.appSlug,
			[BUILDER_RUNTIME_HEADERS.timestamp]: timestamp,
			[BUILDER_RUNTIME_HEADERS.signature]: signature
		},
		body
	});

	if (!response.ok) {
		const errorText = await response.text();

		throw new Error(errorText.trim() || `The app runtime failed with status ${response.status}.`);
	}

	const events = await readBuilderRuntimeEvents(response, async (event) => {
		if (isBuilderRuntimeStreamEvent(event)) {
			await params.onStreamEvent?.(event);
		}
	});

	return events.filter(isBuilderAppFinalEvent);
}

export type BuilderRuntimeRequestEvent = {
	request: Request;
};

export async function readSignedBuilderRuntimeJson<T>(
	event: BuilderRuntimeRequestEvent,
	options: SignedRuntimeOptions
) {
	const body = await event.request.text();
	const signatureError = await verifyBuilderRuntimeSignature({
		headers: event.request.headers,
		body,
		secret: options.secret,
		expectedAppSlug: options.expectedAppSlug,
		maxClockSkewMs: options.maxClockSkewMs,
		now: options.now
	});

	if (signatureError) {
		return new Response(JSON.stringify({ error: signatureError }), {
			status: 401,
			headers: {
				'content-type': 'application/json'
			}
		});
	}

	return JSON.parse(body) as T;
}

export function signedBuilderRuntimeRoute<TInput>(
	run: (input: TInput, context: BuilderRuntimeContext) => Promise<BuilderAppFinalEvent[]>,
	options: SignedRuntimeOptions
) {
	return async (event: BuilderRuntimeRequestEvent) => {
		const input = await readSignedBuilderRuntimeJson<TInput>(event, options);

		if (input instanceof Response) {
			return input;
		}

		return await streamBuilderRuntimeEvents((context) => run(input, context));
	};
}
