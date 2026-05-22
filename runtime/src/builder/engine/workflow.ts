import {
	applyEmailDraftPatch,
	emailDraftJsonSchema,
	emailDraftPatchJsonSchema,
	hasEmailDraftPatchFields,
	normalizeEmailDraft,
	type EmailDraft
} from '@overbase/builder-sdk/email';
import {
	callStructuredTool,
	getOpenAIErrorMessage,
	getOpenAIHeaders,
	OPENAI_RESPONSES_URL,
	STRUCTURED_MAX_OUTPUT_TOKENS,
	supportsReasoningOptions,
	type OpenAIConfig
} from '@overbase/builder-sdk/openai';
import { readEmailBuilderTurnStream } from '@overbase/builder-sdk/streams';
import {
	buildBringTheFirmExampleAdaptationPrompt,
	buildBringTheFirmInitialAnswerPrompt,
	buildBringTheFirmRefinementSystemPrompt,
	buildBringTheFirmRefinementUserPrompt,
	buildBringTheFirmRoutingPrompt
} from './prompts.js';
import type {
	BringTheFirmAiContext,
	BringTheFirmAdaptedExampleResult,
	BringTheFirmExampleCandidate,
	BringTheFirmExamplesCandidate,
	BringTheFirmRouteResult,
	EmailBuilderTurnStreamHandlers,
	EmailBuilderTurnStreamResult,
	TranscriptMessage
} from '../types.js';

const UPDATE_EMAIL_DRAFT_TOOL_NAME = 'update_email_draft';
const BRING_THE_FIRM_ROUTE_TOOL_NAME = 'select_bring_the_firm_examples';
const BRING_THE_FIRM_ADAPT_TOOL_NAME = 'adapt_bring_the_firm_example';
const BRING_THE_FIRM_INITIAL_ANSWER_TOOL_NAME = 'apply_initial_bring_the_firm_answer';

export async function routeBringTheFirmBuilderRequest(params: {
	setupPromptText: string;
	examples: BringTheFirmExamplesCandidate[];
	aiContext?: BringTheFirmAiContext;
	openAIConfig: OpenAIConfig;
}) {
	const prompt = buildBringTheFirmRoutingPrompt(params);

	return await callStructuredTool<BringTheFirmRouteResult>({
		openAIConfig: params.openAIConfig,
		systemPrompt: prompt.systemPrompt,
		userPrompt: prompt.userPrompt,
		toolName: BRING_THE_FIRM_ROUTE_TOOL_NAME,
		toolDescription: 'Select the closest Bring the firm examples set and the first follow-up question.',
		toolParameters: {
			type: 'object',
			additionalProperties: false,
			properties: {
				examplesSlug: {
					type: 'string',
					enum: params.examples.map((examplesSet) => examplesSet.slug)
				},
				publicQuestion: {
					type: 'string',
					description:
						'The exact one-sentence public follow-up question to show the user, following the selected examples set questionGuidance.'
				}
			},
			required: ['examplesSlug', 'publicQuestion']
		}
	});
}

export async function adaptBringTheFirmExample(params: {
	setupPromptText: string;
	examples: BringTheFirmExamplesCandidate;
	draftExamples: BringTheFirmExampleCandidate[];
	aiContext?: BringTheFirmAiContext;
	openAIConfig: OpenAIConfig;
}) {
	const prompt = buildBringTheFirmExampleAdaptationPrompt(params);
	const result = await callStructuredTool<BringTheFirmAdaptedExampleResult>({
		openAIConfig: params.openAIConfig,
		systemPrompt: prompt.systemPrompt,
		userPrompt: prompt.userPrompt,
		toolName: BRING_THE_FIRM_ADAPT_TOOL_NAME,
		toolDescription: 'Pick the closest Bring the firm example and return the adapted email draft.',
		toolParameters: {
			type: 'object',
			additionalProperties: false,
			properties: {
				exampleSlug: {
					type: 'string',
					enum: params.draftExamples.map((example) => example.slug)
				},
				emailDraft: emailDraftJsonSchema
			},
			required: ['exampleSlug', 'emailDraft']
		}
	});
	const selectedExample =
		params.draftExamples.find((example) => example.slug === result.exampleSlug) ??
		params.draftExamples[0];

	if (!selectedExample) {
		throw new Error('No Bring the firm examples are available to adapt.');
	}

	return {
		...result,
		exampleSlug: selectedExample.slug,
		emailDraft: normalizeEmailDraft(result.emailDraft)
	};
}

export async function applyBringTheFirmInitialAnswer(params: {
	setupPromptText: string;
	initialQuestion: string;
	initialAnswer: string;
	draft: EmailDraft;
	aiContext?: BringTheFirmAiContext;
	openAIConfig: OpenAIConfig;
}) {
	const prompt = buildBringTheFirmInitialAnswerPrompt(params);
	const result = await callStructuredTool<{ emailDraft: EmailDraft }>({
		openAIConfig: params.openAIConfig,
		systemPrompt: prompt.systemPrompt,
		userPrompt: prompt.userPrompt,
		toolName: BRING_THE_FIRM_INITIAL_ANSWER_TOOL_NAME,
		toolDescription: 'Return the hidden Bring the firm email draft after applying the initial answer.',
		toolParameters: {
			type: 'object',
			additionalProperties: false,
			properties: {
				emailDraft: emailDraftJsonSchema
			},
			required: ['emailDraft']
		}
	});

	return normalizeEmailDraft(result.emailDraft);
}

export async function streamBringTheFirmBuilderTurn(params: {
	transcript: TranscriptMessage[];
	draft: EmailDraft;
	aiContext?: BringTheFirmAiContext;
	handlers: EmailBuilderTurnStreamHandlers;
	openAIConfig: OpenAIConfig;
}): Promise<EmailBuilderTurnStreamResult> {
	const { apiKey, model, reasoningEffort } = params.openAIConfig;
	const refinementSystemPrompt = buildBringTheFirmRefinementSystemPrompt();
	const refinementUserPrompt = buildBringTheFirmRefinementUserPrompt({
		draft: params.draft,
		aiContext: params.aiContext
	});
	const response = await fetch(OPENAI_RESPONSES_URL, {
		method: 'POST',
		headers: getOpenAIHeaders(apiKey),
		body: JSON.stringify({
			model,
			input: [
				{
					role: 'system',
					content: refinementSystemPrompt
				},
				...params.transcript.map((message) => ({
					role: message.role,
					content: message.text
				})),
				{
					role: 'user',
					content: refinementUserPrompt
				}
			],
			tools: [
				{
					type: 'function',
					name: UPDATE_EMAIL_DRAFT_TOOL_NAME,
					description: 'Patch the visible opportunity format email draft.',
					parameters: emailDraftPatchJsonSchema
				}
			],
			parallel_tool_calls: false,
			...(supportsReasoningOptions(model) ? { reasoning: { effort: reasoningEffort } } : {}),
			max_output_tokens: STRUCTURED_MAX_OUTPUT_TOKENS,
			store: false,
			stream: true
		})
	});

	if (!response.ok) {
		throw new Error(await getOpenAIErrorMessage(response));
	}

	const result = await readEmailBuilderTurnStream(response, params.handlers);
	const normalizedDraft = normalizeEmailDraft(params.draft);
	const nextDraft = hasEmailDraftPatchFields(result.patch)
		? applyEmailDraftPatch(params.draft, result.patch)
		: null;
	const patchChanged = nextDraft
		? JSON.stringify(nextDraft) !== JSON.stringify(normalizedDraft)
		: false;

	return {
		...result,
		patch: patchChanged ? result.patch : null
	};
}
