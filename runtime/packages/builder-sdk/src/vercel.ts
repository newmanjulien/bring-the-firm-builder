import type { IncomingMessage, ServerResponse } from 'node:http';

export type VercelBuilderFetchHandler = (request: Request) => Response | Promise<Response>;
export type VercelBuilderHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

export function createVercelBuilderHandler(fetchHandler: VercelBuilderFetchHandler): VercelBuilderHandler {
	return async (req, res) => {
		try {
			const request = new Request(resolveRequestUrl(req), {
				method: req.method,
				headers: createRequestHeaders(req),
				body: await readRequestBody(req)
			});
			const response = await fetchHandler(request);

			await writeResponse(res, response);
		} catch (error) {
			if (!res.headersSent) {
				res.statusCode = 500;
				res.end('Internal Server Error');
				return;
			}

			res.destroy(error instanceof Error ? error : undefined);
		}
	};
}

function resolveRequestUrl(req: IncomingMessage): string {
	const forwardedProto = getHeaderValue(req, 'x-forwarded-proto');
	const proto = forwardedProto?.split(',')[0]?.trim() || 'https';
	const forwardedHost = getHeaderValue(req, 'x-forwarded-host') ?? getHeaderValue(req, 'host');
	const host = forwardedHost?.split(',')[0]?.trim() || 'localhost';
	const requestPath = req.url ?? '/';

	return new URL(requestPath, `${proto}://${host}`).toString();
}

function getHeaderValue(req: IncomingMessage, name: string): string | undefined {
	const value = req.headers[name];

	if (Array.isArray(value)) {
		return value.join(', ');
	}

	return value;
}

function createRequestHeaders(req: IncomingMessage): Headers {
	const headers = new Headers();

	for (const [name, value] of Object.entries(req.headers)) {
		if (value === undefined) {
			continue;
		}

		if (Array.isArray(value)) {
			for (const item of value) {
				headers.append(name, item);
			}
			continue;
		}

		headers.set(name, value);
	}

	return headers;
}

async function readRequestBody(req: IncomingMessage): Promise<Blob | undefined> {
	const method = req.method?.toUpperCase();

	if (method === 'GET' || method === 'HEAD') {
		return undefined;
	}

	const chunks: Uint8Array[] = [];

	for await (const chunk of req) {
		chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
	}

	if (chunks.length === 0) {
		return undefined;
	}

	const body = Buffer.concat(chunks);
	const bodyBuffer = new ArrayBuffer(body.byteLength);
	new Uint8Array(bodyBuffer).set(body);

	return new Blob([bodyBuffer]);
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
	res.statusCode = response.status;
	res.statusMessage = response.statusText;
	writeResponseHeaders(res, response.headers);

	if (!response.body) {
		res.end();
		return;
	}

	const reader = response.body.getReader();

	try {
		while (true) {
			const result = await reader.read();

			if (result.done) {
				res.end();
				return;
			}

			await writeResponseChunk(res, result.value);
		}
	} finally {
		reader.releaseLock();
	}
}

function writeResponseHeaders(res: ServerResponse, headers: Headers): void {
	const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
	const setCookieHeaders = getSetCookie?.call(headers);

	headers.forEach((value, name) => {
		if (name.toLowerCase() !== 'set-cookie') {
			res.setHeader(name, value);
		}
	});

	if (setCookieHeaders && setCookieHeaders.length > 0) {
		res.setHeader('set-cookie', setCookieHeaders);
	}
}

function writeResponseChunk(res: ServerResponse, chunk: string | Uint8Array | Buffer): Promise<void> {
	return new Promise((resolve, reject) => {
		res.write(chunk, (error) => {
			if (error) {
				reject(error);
				return;
			}

			resolve();
		});
	});
}
