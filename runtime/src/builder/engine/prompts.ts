import type { EmailDraft } from '@overbase/builder-sdk/email';
import {
	BRING_THE_FIRM_DRAFT_RULES,
	BRING_THE_FIRM_EXAMPLE_ADAPTATION_OPENING_RULES,
	BRING_THE_FIRM_INITIAL_ANSWER_OPENING_RULES,
	BRING_THE_FIRM_REFINEMENT_CHAT_RULES,
	BRING_THE_FIRM_REFINEMENT_DRAFT_RULES,
	BRING_THE_FIRM_ROUTING_RULES,
	EXAMPLE_FIDELITY_RULES,
	EXECUTIVE_WRITING_RULES
} from '../rules/index.js';
import type {
	BringTheFirmAiContext,
	BringTheFirmExampleCandidate,
	BringTheFirmExamplesCandidate
} from '../types.js';

const BRING_THE_FIRM_AI_CONTEXT_RULE =
	'Use Builder/user context to interpret the builder user, intent, audience, and format use. Do not treat it as literal email copy unless the user asks.';

function stringifyPromptData(value: unknown) {
	return JSON.stringify(value, null, 2);
}

function joinPromptLines(lines: readonly string[]) {
	return lines.join('\n');
}

export function formatBringTheFirmAiContextPromptBlock(aiContext?: BringTheFirmAiContext) {
	const contextEntries = [
		['Person context', aiContext?.personContext],
		['Conversation reason', aiContext?.conversationReason],
		['Format use', aiContext?.formatUse]
	].filter((entry): entry is [string, string] => Boolean(entry[1]));

	if (contextEntries.length === 0) {
		return '';
	}

	return [
		'Builder/user context:',
		...contextEntries.map(([label, value]) => `${label}: ${value}`)
	].join('\n');
}

function withAiContextBlock(lines: string[], aiContext?: BringTheFirmAiContext) {
	const aiContextBlock = formatBringTheFirmAiContextPromptBlock(aiContext);

	if (!aiContextBlock) {
		return lines;
	}

	return [lines[0] ?? '', lines[1] ?? '', aiContextBlock, ...lines.slice(2)].filter(Boolean);
}

export function buildBringTheFirmRoutingPrompt(params: {
	setupPromptText: string;
	examples: BringTheFirmExamplesCandidate[];
	aiContext?: BringTheFirmAiContext;
}) {
	return {
		systemPrompt: joinPromptLines([
			...BRING_THE_FIRM_ROUTING_RULES,
			BRING_THE_FIRM_AI_CONTEXT_RULE
		]),
		userPrompt: withAiContextBlock(
			[
				'Guided setup answers:',
				params.setupPromptText,
				'Available examples:',
				stringifyPromptData(params.examples)
			],
			params.aiContext
		).join('\n\n')
	};
}

export function buildBringTheFirmExampleAdaptationPrompt(params: {
	setupPromptText: string;
	examples: BringTheFirmExamplesCandidate;
	draftExamples: BringTheFirmExampleCandidate[];
	aiContext?: BringTheFirmAiContext;
}) {
	return {
		systemPrompt: joinPromptLines([
			...BRING_THE_FIRM_EXAMPLE_ADAPTATION_OPENING_RULES,
			BRING_THE_FIRM_AI_CONTEXT_RULE,
			EXECUTIVE_WRITING_RULES,
			EXAMPLE_FIDELITY_RULES,
			...BRING_THE_FIRM_DRAFT_RULES
		]),
		userPrompt: withAiContextBlock(
			[
				'Guided setup answers:',
				params.setupPromptText,
				'Selected examples:',
				stringifyPromptData(params.examples),
				'Candidate email examples:',
				stringifyPromptData(params.draftExamples)
			],
			params.aiContext
		).join('\n\n')
	};
}

export function buildBringTheFirmInitialAnswerPrompt(params: {
	setupPromptText: string;
	initialQuestion: string;
	initialAnswer: string;
	draft: EmailDraft;
	aiContext?: BringTheFirmAiContext;
}) {
	return {
		systemPrompt: joinPromptLines([
			...BRING_THE_FIRM_INITIAL_ANSWER_OPENING_RULES,
			BRING_THE_FIRM_AI_CONTEXT_RULE,
			EXECUTIVE_WRITING_RULES,
			EXAMPLE_FIDELITY_RULES,
			...BRING_THE_FIRM_DRAFT_RULES
		]),
		userPrompt: withAiContextBlock(
			[
				'Guided setup answers:',
				params.setupPromptText,
				'Follow-up question:',
				params.initialQuestion,
				'User answer:',
				params.initialAnswer,
				'Current draft JSON:',
				stringifyPromptData(params.draft)
			],
			params.aiContext
		).join('\n\n')
	};
}

export function buildBringTheFirmRefinementSystemPrompt() {
	return joinPromptLines([
		...BRING_THE_FIRM_REFINEMENT_CHAT_RULES,
		BRING_THE_FIRM_AI_CONTEXT_RULE,
		EXECUTIVE_WRITING_RULES,
		...BRING_THE_FIRM_REFINEMENT_DRAFT_RULES,
		EXAMPLE_FIDELITY_RULES
	]);
}

export function buildBringTheFirmRefinementUserPrompt(params: {
	draft: EmailDraft;
	aiContext?: BringTheFirmAiContext;
}) {
	const aiContextBlock = formatBringTheFirmAiContextPromptBlock(params.aiContext);

	return [
		...(aiContextBlock ? [aiContextBlock, ''] : []),
		'Current visible email draft JSON:',
		JSON.stringify(params.draft),
		'Respond to the user in normal text. If the draft should change, call update_email_draft.'
	].join('\n');
}
