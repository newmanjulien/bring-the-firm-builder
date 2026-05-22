import {
	adaptBringTheFirmExample,
	applyBringTheFirmInitialAnswer,
	bringTheFirmManifest,
	getBringTheFirmExamples,
	listBringTheFirmDraftExamples,
	listBringTheFirmExamples,
	routeBringTheFirmBuilderRequest,
	streamBringTheFirmBuilderTurn
} from '../builder/index.js';
import { buildBuilderRunSetupPromptText } from '@overbase/builder-sdk/app-protocol';
import type {
	BuilderAppBackgroundJobInput,
	BuilderAppContinueTurnInput,
	BuilderAppStartTurnInput,
	BuilderRuntimeContext
} from '@overbase/builder-sdk/app-protocol';
import {
	getHiddenPrimaryEmailDraftArtifact,
	getVisiblePrimaryEmailDraftArtifact
} from '@overbase/builder-sdk/artifacts';
import type { EmailDraft } from '@overbase/builder-sdk/email';
import type { BuilderAppRuntime } from '@overbase/builder-sdk/host';
import { getBringTheFirmAppState } from './app-state.js';
import type { RuntimeDependencies } from './dependencies.js';
import {
	askFollowUpQuestion,
	patchVisibleEmailDraft,
	revealEmailDraft,
	setHiddenEmailDraft
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
		const exampleSets = listBringTheFirmExamples().map(toExampleSetSummary);

		if (exampleSets.length === 0) {
			throw new Error('No Bring the firm examples are available.');
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

		return askFollowUpQuestion({
			questionText: routeResult.publicQuestion,
			selectedExamplesSlug: selectedExampleSet.slug
		});
	}

	async function continueTurn(input: BuilderAppContinueTurnInput, context: BuilderRuntimeContext) {
		const hiddenArtifact = getHiddenPrimaryEmailDraftArtifact(input.artifacts);

		if (hiddenArtifact) {
			return await applyInitialAnswerTurn(input, hiddenArtifact.value);
		}

		const visibleArtifact = getVisiblePrimaryEmailDraftArtifact(input.artifacts);

		if (visibleArtifact) {
			return await refineVisibleDraftTurn(input, context, visibleArtifact.value);
		}

		throw new Error('The email draft is unavailable.');
	}

	async function applyInitialAnswerTurn(input: BuilderAppContinueTurnInput, hiddenDraft: EmailDraft) {
		const bringTheFirmState = getBringTheFirmAppState(input.appState);
		const setupPromptText = buildBuilderRunSetupPromptText(input.setup);
		const emailDraft = await applyBringTheFirmInitialAnswer({
			setupPromptText,
			initialQuestion: bringTheFirmState.initialQuestionText ?? '',
			initialAnswer: input.userMessage,
			draft: hiddenDraft,
			aiContext: bringTheFirmState.aiContext,
			openAIConfig: deps.getOpenAIConfig()
		});

		return revealEmailDraft(emailDraft);
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

	async function backgroundJob(input: BuilderAppBackgroundJobInput) {
		const bringTheFirmState = getBringTheFirmAppState(input.appState);
		const selectedExamplesSlug = bringTheFirmState.selectedExamplesSlug;

		if (!selectedExamplesSlug) {
			throw new Error('The selected examples are unavailable.');
		}

		const exampleSet = getBringTheFirmExamples(selectedExamplesSlug);

		if (!exampleSet) {
			throw new Error('The selected examples are unavailable.');
		}

		const draftExampleCandidates = listBringTheFirmDraftExamples(selectedExamplesSlug).map(
			toDraftExampleCandidate
		);

		if (draftExampleCandidates.length === 0) {
			throw new Error('No Bring the firm draft examples are available for these examples.');
		}

		const setupPromptText = buildBuilderRunSetupPromptText(input.setup);
		const adapted = await adaptBringTheFirmExample({
			setupPromptText,
			examples: toExampleSetSummary(exampleSet),
			draftExamples: draftExampleCandidates,
			aiContext: bringTheFirmState.aiContext,
			openAIConfig: deps.getOpenAIConfig()
		});

		return setHiddenEmailDraft({
			emailDraft: adapted.emailDraft,
			selectedExampleSlug: adapted.exampleSlug
		});
	}

	return {
		manifest: bringTheFirmManifest,
		startTurn,
		continueTurn,
		backgroundJob
	};
}
