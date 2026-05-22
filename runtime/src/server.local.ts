import { serve } from '@hono/node-server';
import type {
	BuilderAppContinueTurnInput,
	BuilderAppStartTurnInput
} from '@overbase/builder-sdk/app-protocol';
import { streamBuilderRuntimeEvents } from '@overbase/builder-sdk/transport';
import { createHttpApp } from './http/app.js';
import { createRuntimeContext } from './runtime/app.server.js';
import { createLocalBuilderHost } from './runtime/local-host.js';

type DevHarnessRunInput =
	| {
			action: 'start';
			input: BuilderAppStartTurnInput;
	  }
	| {
			action: 'continue';
			input: BuilderAppContinueTurnInput;
	  };

const port = Number(process.env.PORT ?? 8787);
const runtimeContext = createRuntimeContext();
const app = createHttpApp(runtimeContext);

if (process.env.BRING_THE_FIRM_DEV_HARNESS === '1') {
	const host = createLocalBuilderHost(runtimeContext.runtime);

	app.post('/api/dev-harness/run', async (c) => {
		const body = await c.req.json<DevHarnessRunInput>();

		switch (body.action) {
			case 'start':
				return streamBuilderRuntimeEvents((context) => host.start(body.input, context));
			case 'continue':
				return streamBuilderRuntimeEvents((context) => host.continueTurn(body.input, context));
		}

		return c.text('Unknown dev harness action.', 400);
	});
}

serve({
	fetch: app.fetch,
	hostname: '127.0.0.1',
	port
});

console.log(`Bring the Firm builder runtime listening on http://127.0.0.1:${port}`);
