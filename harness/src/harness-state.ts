import type {
	BuilderAppOutputEvent,
	BuilderGuideSetupAction,
	BuilderRunSetup
} from '@overbase/builder-sdk/app-protocol';
import { createGuidedRunSetup } from '@overbase/builder-sdk/app-protocol';
import type {
	BuilderAppManifest,
	GuideChoiceQuestion,
	GuideDefinition
} from '@overbase/builder-sdk/catalog';
import {
	applyBuilderHostEvent,
	createInitialBuilderHostState,
	type BuilderHostState
} from '@overbase/builder-sdk/host';
import type { TranscriptMessage } from '@overbase/builder-sdk/streams';

export type GuideAnswersByQuestionId = Record<string, string>;

export type HarnessState = {
	manifest: BuilderAppManifest | null;
	guideAnswersByQuestionId: GuideAnswersByQuestionId;
	setupAction: BuilderGuideSetupAction;
	hostState: BuilderHostState;
	transcript: TranscriptMessage[];
	events: BuilderAppOutputEvent[];
	streamText: string;
	errorText: string | null;
};

export function createHarnessState(): HarnessState {
	return {
		manifest: null,
		guideAnswersByQuestionId: {},
		setupAction: 'submitted',
		hostState: createInitialBuilderHostState(),
		transcript: [],
		events: [],
		streamText: '',
		errorText: null
	};
}

export async function fetchBuilderManifest(): Promise<BuilderAppManifest> {
	const response = await fetch('/api/builder/manifest');

	if (!response.ok) {
		throw new Error(`Manifest request failed: ${response.status}`);
	}

	const body = (await response.json()) as { manifest?: BuilderAppManifest };

	if (!body.manifest) {
		throw new Error('Manifest response did not include a manifest.');
	}

	return body.manifest;
}

export function getGuide(state: HarnessState): GuideDefinition | null {
	return state.manifest?.mode === 'guided' ? state.manifest.guide : null;
}

export function getGuideAnswer(state: HarnessState, questionId: string) {
	return state.guideAnswersByQuestionId[questionId] ?? '';
}

export function setGuideAnswer(state: HarnessState, questionId: string, value: string) {
	state.guideAnswersByQuestionId = {
		...state.guideAnswersByQuestionId,
		[questionId]: value
	};

	if (state.setupAction === 'skippedRemaining' && hasAnsweredEveryGuideQuestion(state)) {
		state.setupAction = 'submitted';
	}
}

export function getChoiceCustomAnswer(state: HarnessState, question: GuideChoiceQuestion) {
	const answer = getGuideAnswer(state, question.id);

	return question.options.includes(answer) ? '' : answer;
}

export function hasAnsweredEveryGuideQuestion(state: HarnessState) {
	const guide = getGuide(state);

	return Boolean(
		guide?.questions.every((question) => getGuideAnswer(state, question.id).trim().length > 0)
	);
}

export function canUseSkippedRemaining(state: HarnessState) {
	return !hasAnsweredEveryGuideQuestion(state);
}

export function setSetupAction(state: HarnessState, action: BuilderGuideSetupAction) {
	if (action === 'skippedRemaining' && !canUseSkippedRemaining(state)) {
		return;
	}

	state.setupAction = action;
}

export function resetGuideAnswers(state: HarnessState) {
	state.guideAnswersByQuestionId = {};
	state.setupAction = 'submitted';
}

export function createHarnessSetup(state: HarnessState): BuilderRunSetup {
	const manifest = state.manifest;

	if (!manifest) {
		throw new Error('Builder manifest is not loaded.');
	}

	if (manifest.mode !== 'guided') {
		throw new Error('Bring the Firm manifest must use guided mode.');
	}

	return createGuidedRunSetup({
		title: manifest.title,
		description: manifest.description,
		guide: manifest.guide,
		action: state.setupAction,
		answers: manifest.guide.questions
			.map((question) => ({
				questionId: question.id,
				questionTitle: question.title,
				answer: getGuideAnswer(state, question.id).trim()
			}))
			.filter((answer) => answer.answer.length > 0)
	});
}

export function resetHarnessRun(state: HarnessState) {
	state.hostState = createInitialBuilderHostState();
	state.transcript = [];
	state.events = [];
	state.streamText = '';
	state.errorText = null;
}

export function appendUserMessage(state: HarnessState, text: string) {
	state.transcript.push({
		role: 'user',
		text
	});
}

export function applyHarnessEvent(state: HarnessState, event: BuilderAppOutputEvent) {
	state.events.push(event);
	const reduction = applyBuilderHostEvent(state.hostState, event);
	state.hostState = reduction.state;

	if (event.type === 'assistantDelta') {
		state.streamText += event.text;
		return;
	}

	if (event.type === 'assistantComplete') {
		state.transcript.push({
			role: 'assistant',
			text: event.text
		});
		state.streamText = '';
		return;
	}

	if (event.type === 'fail') {
		state.errorText = event.errorText;
	}
}
