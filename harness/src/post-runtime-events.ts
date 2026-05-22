import type { BuilderAppOutputEvent } from '@overbase/builder-sdk/app-protocol';
import { readBuilderRuntimeEvents } from '@overbase/builder-sdk/transport';

export async function postRuntimeEvents(params: {
	body: unknown;
	onEvent: (event: BuilderAppOutputEvent) => void;
}) {
	const response = await fetch('/api/dev-harness/run', {
		method: 'POST',
		headers: {
			'content-type': 'application/json'
		},
		body: JSON.stringify(params.body)
	});

	if (!response.ok) {
		throw new Error(await response.text());
	}

	if (!response.body) {
		throw new Error('Runtime response did not include a stream.');
	}

	await readBuilderRuntimeEvents(response, params.onEvent);
}
