import { Hono } from 'hono';
import type { BuilderAppRuntime } from '@overbase/builder-sdk/host';
import { createRuntimeContext } from '../runtime/app.server.js';
import type { RuntimeDependencies } from '../runtime/dependencies.js';
import { createRuntimeHealthPayload } from './health.js';
import { createRuntimeRoutes } from './runtime-routes.js';

export type RuntimeHttpContext = {
	deps: RuntimeDependencies;
	runtime: BuilderAppRuntime;
};

export function createHttpApp(context: RuntimeHttpContext = createRuntimeContext()) {
	const runtimeRoutes = createRuntimeRoutes(context);
	const app = new Hono();

	app.get('/', (c) => c.json(createRuntimeHealthPayload()));

	app.get('/api/builder/manifest', (c) =>
		c.json({
			manifest: context.runtime.manifest
		})
	);

	app.post('/api/builder/start-turn', (c) =>
		runtimeRoutes.startTurn({
			request: c.req.raw
		})
	);

	app.post('/api/builder/continue-turn', (c) =>
		runtimeRoutes.continueTurn({
			request: c.req.raw
		})
	);

	app.post('/api/builder/background-job', (c) => {
		if (!runtimeRoutes.backgroundJob) {
			return c.text('This app does not support background jobs.', 404);
		}

		return runtimeRoutes.backgroundJob({
			request: c.req.raw
		});
	});

	return app;
}
