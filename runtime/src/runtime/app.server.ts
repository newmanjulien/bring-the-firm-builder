import { createServerDependencies } from './dependencies.server.js';
import { createBringTheFirmRuntime } from './operations.js';

export function createRuntimeContext() {
	const deps = createServerDependencies();

	return {
		deps,
		runtime: createBringTheFirmRuntime(deps)
	};
}
