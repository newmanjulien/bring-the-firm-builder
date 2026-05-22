import type {
	BuilderAppContinueTurnInput,
	BuilderAppFinalEvent,
	BuilderAppStartTurnInput,
	BuilderRuntimeContext
} from '@overbase/builder-sdk/app-protocol';
import {
	applyBuilderHostEvents,
	createInitialBuilderHostState,
	type BuilderAppRuntime,
	type BuilderHostState
} from '@overbase/builder-sdk/host';

export type LocalBuilderHostStartInput = BuilderAppStartTurnInput;
export type LocalBuilderHostContinueInput = BuilderAppContinueTurnInput;

export function createLocalBuilderHost(runtime: BuilderAppRuntime) {
	async function start(input: LocalBuilderHostStartInput, context: BuilderRuntimeContext) {
		let hostState: BuilderHostState = createInitialBuilderHostState(input.appState, input.artifacts);
		const startEvents = await runtime.startTurn(input, context);
		const startReduction = applyBuilderHostEvents(hostState, startEvents);
		hostState = startReduction.state;

		if (!startReduction.effects.enqueueBackgroundJob) {
			return startEvents;
		}

		if (!runtime.backgroundJob) {
			throw new Error('This app does not support background jobs.');
		}

		const backgroundEvents = await runtime.backgroundJob(
			{
				setup: input.setup,
				artifacts: hostState.artifacts,
				appState: hostState.appState
			},
			context
		);

		return [...startEvents, ...backgroundEvents] satisfies BuilderAppFinalEvent[];
	}

	async function continueTurn(input: LocalBuilderHostContinueInput, context: BuilderRuntimeContext) {
		return await runtime.continueTurn(input, context);
	}

	return {
		start,
		continueTurn
	};
}
