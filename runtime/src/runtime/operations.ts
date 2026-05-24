import {
	adaptBringTheFirmExample,
	bringTheFirmManifest,
	listBringTheFirmDraftExamples,
	listBringTheFirmExamples,
	routeBringTheFirmBuilderRequest,
	streamBringTheFirmBuilderTurn
} from '../builder/index.js';
import { buildBuilderRunSetupPromptText } from '@overbase/builder-sdk/app-protocol';
import type {
	BuilderAppContinueTurnInput,
	BuilderAppStartTurnInput,
	BuilderRuntimeContext
} from '@overbase/builder-sdk/app-protocol';
import { getVisiblePrimaryEmailDraftArtifact } from '@overbase/builder-sdk/artifacts';
import type { EmailDraft } from '@overbase/builder-sdk/email';
import type { BuilderAppRuntime } from '@overbase/builder-sdk/host';
import { getBringTheFirmAppState } from './app-state.js';
import type { RuntimeDependencies } from './dependencies.js';
import {
	patchVisibleEmailDraft,
	showInitialEmailDraft
} from './events.js';

type BringTheFirmExampleSetSummary = {
	slug: string;
	description: string;
	questionGuidance: string;
};

type BringTheFirmDraftExampleCandidate = {
	slug: string;
	description: string;
	matchSignals: string[];
	emailDraft: EmailDraft;
};

function toExampleSetSummary(exampleSet: {
	slug: string;
	description: string;
	questionGuidance: string;
}): BringTheFirmExampleSetSummary {
	return {
		slug: exampleSet.slug,
		description: exampleSet.description,
		questionGuidance: exampleSet.questionGuidance
	};
}

function toDraftExampleCandidate(example: {
	slug: string;
	description: string;
	matchSignals: string[];
	emailDraft: EmailDraft;
}): BringTheFirmDraftExampleCandidate {
	return {
		slug: example.slug,
		description: example.description,
		matchSignals: example.matchSignals,
		emailDraft: example.emailDraft
	};
}

export function createBringTheFirmRuntime(deps: RuntimeDependencies): BuilderAppRuntime {
	async function startTurn(input: BuilderAppStartTurnInput) {
		const fastOpenAIConfig = deps.getOpenAIConfig('fast');
		const openAIConfig = deps.getOpenAIConfig();
		const exampleSets = listBringTheFirmExamples().map(toExampleSetSummary);

		if (exampleSets.length === 0) {
			throw new Error('No Bring the Firm examples are available.');
		}

		const bringTheFirmState = getBringTheFirmAppState(input.appState);
		const setupPromptText = buildBuilderRunSetupPromptText(input.setup);
		const routeResult = await routeBringTheFirmBuilderRequest({
			setupPromptText,
			examples: exampleSets,
			aiContext: bringTheFirmState.aiContext,
			openAIConfig: fastOpenAIConfig
		});
		const selectedExampleSet =
			exampleSets.find((candidate) => candidate.slug === routeResult.examplesSlug) ?? exampleSets[0];
		const draftExampleCandidates = listBringTheFirmDraftExamples(selectedExampleSet.slug).map(
			toDraftExampleCandidate
		);

		if (draftExampleCandidates.length === 0) {
			throw new Error('No Bring the Firm draft examples are available for these examples.');
		}

		const adapted = await adaptBringTheFirmExample({
			setupPromptText,
			examples: selectedExampleSet,
			draftExamples: draftExampleCandidates,
			aiContext: bringTheFirmState.aiContext,
			openAIConfig
		});

		return showInitialEmailDraft({
			emailDraft: adapted.emailDraft,
			questionText: routeResult.publicQuestion,
			selectedExamplesSlug: selectedExampleSet.slug,
			selectedExampleSlug: adapted.exampleSlug
		});
	}

	async function continueTurn(input: BuilderAppContinueTurnInput, context: BuilderRuntimeContext) {
		const visibleArtifact = getVisiblePrimaryEmailDraftArtifact(input.artifacts);

		if (visibleArtifact) {
			return await refineVisibleDraftTurn(input, context, visibleArtifact.value);
		}

		throw new Error('The email draft is unavailable.');
	}

	async function refineVisibleDraftTurn(
		input: BuilderAppContinueTurnInput,
		context: BuilderRuntimeContext,
		visibleDraft: EmailDraft
	) {
		const result = await streamBringTheFirmBuilderTurn({
			transcript: input.transcript,
			draft: visibleDraft,
			aiContext: getBringTheFirmAppState(input.appState).aiContext,
			openAIConfig: deps.getOpenAIConfig(),
			handlers: {
				onTextDelta: async (delta) => {
					await context.emit({ type: 'assistantDelta', text: delta });
				}
			}
		});

		return patchVisibleEmailDraft(result);
	}

	return {
		manifest: bringTheFirmManifest,
		startTurn,
		continueTurn
	};
}
