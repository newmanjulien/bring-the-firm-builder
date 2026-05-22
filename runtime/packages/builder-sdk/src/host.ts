import type {
	BuilderAppBackgroundJobInput,
	BuilderAppContinueTurnInput,
	BuilderAppFinalEvent,
	BuilderAppOutputEvent,
	BuilderAppStartTurnInput,
	BuilderAppState,
	BuilderRuntimeContext
} from './app-protocol.js';
import type { BuilderAppManifest } from './catalog.js';
import {
	applyBuilderArtifactPatchEvent,
	applyBuilderArtifactSetEvent,
	normalizeBuilderArtifacts,
	type BuilderArtifacts
} from './artifacts.js';

export type BuilderAppRuntime = {
	manifest: BuilderAppManifest;
	startTurn: (
		input: BuilderAppStartTurnInput,
		context: BuilderRuntimeContext
	) => Promise<BuilderAppFinalEvent[]>;
	continueTurn: (
		input: BuilderAppContinueTurnInput,
		context: BuilderRuntimeContext
	) => Promise<BuilderAppFinalEvent[]>;
	backgroundJob?: (
		input: BuilderAppBackgroundJobInput,
		context: BuilderRuntimeContext
	) => Promise<BuilderAppFinalEvent[]>;
};

export type BuilderHostState = {
	appState: BuilderAppState;
	artifacts: BuilderArtifacts;
};

export type BuilderHostEffects = {
	assistantCompleteText: string | null;
	enqueueBackgroundJob: boolean;
	waitForUser: boolean;
	complete: boolean;
	errorText: string | null;
};

export type BuilderHostReduction = {
	state: BuilderHostState;
	effects: BuilderHostEffects;
};

export const BUILDER_HOST_APP_STATE_VERSION = 1;

export function createInitialBuilderHostState(
	appState: BuilderAppState = { version: BUILDER_HOST_APP_STATE_VERSION, value: {} },
	artifacts: BuilderArtifacts = {}
): BuilderHostState {
	return {
		appState,
		artifacts: normalizeBuilderArtifacts(artifacts)
	};
}

export function createEmptyBuilderHostEffects(): BuilderHostEffects {
	return {
		assistantCompleteText: null,
		enqueueBackgroundJob: false,
		waitForUser: false,
		complete: false,
		errorText: null
	};
}

function getAppStateRecord(appState: BuilderAppState): Record<string, unknown> {
	return appState.value && typeof appState.value === 'object' && !Array.isArray(appState.value)
		? (appState.value as Record<string, unknown>)
		: {};
}

export function patchBuilderHostAppState(
	appState: BuilderAppState,
	patch: Record<string, unknown>
): BuilderAppState {
	return {
		version: appState.version + 1,
		value: {
			...getAppStateRecord(appState),
			...patch
		}
	};
}

export function applyBuilderHostEvent(
	state: BuilderHostState,
	event: BuilderAppOutputEvent
): BuilderHostReduction {
	let nextState = state;
	const effects = createEmptyBuilderHostEffects();

	if (event.type === 'assistantComplete') {
		effects.assistantCompleteText = event.text;
		return { state: nextState, effects };
	}

	if (event.type === 'appStateReplace') {
		nextState = {
			...nextState,
			appState: event.appState
		};
		return { state: nextState, effects };
	}

	if (event.type === 'appStatePatch') {
		nextState = {
			...nextState,
			appState: patchBuilderHostAppState(nextState.appState, event.patch)
		};
		return { state: nextState, effects };
	}

	if (event.type === 'artifactSet') {
		const result = applyBuilderArtifactSetEvent(nextState.artifacts, event.artifact);

		nextState = {
			...nextState,
			artifacts: result.artifacts
		};
		return { state: nextState, effects };
	}

	if (event.type === 'artifactPatch') {
		const result = applyBuilderArtifactPatchEvent(nextState.artifacts, event.artifact);

		if (!result.changed) {
			return { state: nextState, effects };
		}

		nextState = {
			...nextState,
			artifacts: result.artifacts
		};
		return { state: nextState, effects };
	}

	if (event.type === 'enqueueBackgroundJob') {
		effects.enqueueBackgroundJob = true;
		return { state: nextState, effects };
	}

	if (event.type === 'waitForUser') {
		effects.waitForUser = true;
		return { state: nextState, effects };
	}

	if (event.type === 'complete') {
		effects.complete = true;
		return { state: nextState, effects };
	}

	if (event.type === 'fail') {
		effects.errorText = event.errorText;
		return { state: nextState, effects };
	}

	return { state: nextState, effects };
}

export function applyBuilderHostEvents(
	state: BuilderHostState,
	events: BuilderAppFinalEvent[]
): BuilderHostReduction {
	let nextState = state;
	const effects = createEmptyBuilderHostEffects();

	for (const event of events) {
		const reduction = applyBuilderHostEvent(nextState, event);
		nextState = reduction.state;
		effects.assistantCompleteText =
			reduction.effects.assistantCompleteText ?? effects.assistantCompleteText;
		effects.enqueueBackgroundJob =
			effects.enqueueBackgroundJob || reduction.effects.enqueueBackgroundJob;
		effects.waitForUser = effects.waitForUser || reduction.effects.waitForUser;
		effects.complete = effects.complete || reduction.effects.complete;
		effects.errorText = reduction.effects.errorText ?? effects.errorText;
	}

	return {
		state: nextState,
		effects
	};
}
