import { createRuntimeHealthPayload } from '../src/http/health.js';

export function GET() {
	return Response.json(createRuntimeHealthPayload());
}
