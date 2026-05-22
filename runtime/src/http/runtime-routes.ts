import type {
	BuilderAppBackgroundJobInput,
	BuilderAppContinueTurnInput,
	BuilderAppFinalEvent,
	BuilderAppStartTurnInput,
	BuilderRuntimeContext
} from '@overbase/builder-sdk/app-protocol';
import { signedBuilderRuntimeRoute } from '@overbase/builder-sdk/transport';
import { BRING_THE_FIRM_APP_SLUG } from '../builder/index.js';
import type { RuntimeDependencies } from '../runtime/dependencies.js';
import type { BuilderAppRuntime } from '@overbase/builder-sdk/host';

type RuntimeOperation<TInput> = (
	input: TInput,
	context: BuilderRuntimeContext
) => Promise<BuilderAppFinalEvent[]>;

function createSignedRoute<TInput>(params: {
	run: RuntimeOperation<TInput>;
	deps: RuntimeDependencies;
}) {
	return signedBuilderRuntimeRoute(params.run, {
		secret: params.deps.overbaseSecret,
		expectedAppSlug: BRING_THE_FIRM_APP_SLUG
	});
}

export function createRuntimeRoutes(params: {
	runtime: BuilderAppRuntime;
	deps: RuntimeDependencies;
}) {
	return {
		startTurn: createSignedRoute<BuilderAppStartTurnInput>({
			run: params.runtime.startTurn,
			deps: params.deps
		}),
		continueTurn: createSignedRoute<BuilderAppContinueTurnInput>({
			run: params.runtime.continueTurn,
			deps: params.deps
		}),
		backgroundJob: params.runtime.backgroundJob
			? createSignedRoute<BuilderAppBackgroundJobInput>({
					run: params.runtime.backgroundJob,
					deps: params.deps
				})
			: null
	};
}
