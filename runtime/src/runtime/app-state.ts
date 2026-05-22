import type { BringTheFirmAiContext } from '../builder/index.js';
import { BRING_THE_FIRM_DEFAULT_AI_CONTEXT } from '../builder/rules/index.js';
import type { BuilderAppState } from '@overbase/builder-sdk/app-protocol';

export type BringTheFirmAppState = {
	selectedExamplesSlug?: string;
	selectedExampleSlug?: string;
	initialQuestionText?: string;
	aiContext?: BringTheFirmAiContext;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getStringField(value: Record<string, unknown>, field: string) {
	const fieldValue = value[field];

	return typeof fieldValue === 'string' ? fieldValue : undefined;
}

function getNonEmptyStringField(value: Record<string, unknown>, field: string) {
	const fieldValue = getStringField(value, field)?.trim();

	return fieldValue ? fieldValue : undefined;
}

function normalizeBringTheFirmAiContext(
	aiContext?: BringTheFirmAiContext
): BringTheFirmAiContext | undefined {
	const normalized = {
		personContext: aiContext?.personContext?.trim() || undefined,
		conversationReason: aiContext?.conversationReason?.trim() || undefined,
		formatUse: aiContext?.formatUse?.trim() || undefined
	};

	return Object.values(normalized).some(Boolean) ? normalized : undefined;
}

function parseBringTheFirmAiContextFromAppState(
	appState?: BuilderAppState
): BringTheFirmAiContext | undefined {
	const value = isRecord(appState?.value) ? appState.value : {};
	const aiContext = isRecord(value.aiContext) ? value.aiContext : {};
	const parsed = {
		personContext: getNonEmptyStringField(aiContext, 'personContext'),
		conversationReason: getNonEmptyStringField(aiContext, 'conversationReason'),
		formatUse: getNonEmptyStringField(aiContext, 'formatUse')
	};

	return Object.values(parsed).some(Boolean) ? parsed : undefined;
}

function getBringTheFirmAiContext(appState?: BuilderAppState) {
	const defaultAiContext = normalizeBringTheFirmAiContext(BRING_THE_FIRM_DEFAULT_AI_CONTEXT);
	const appStateAiContext = parseBringTheFirmAiContextFromAppState(appState);

	return normalizeBringTheFirmAiContext({
		...defaultAiContext,
		...appStateAiContext
	});
}

export function getBringTheFirmAppState(appState?: BuilderAppState): BringTheFirmAppState {
	const value = isRecord(appState?.value) ? appState.value : {};

	return {
		selectedExamplesSlug: getStringField(value, 'selectedExamplesSlug'),
		selectedExampleSlug: getStringField(value, 'selectedExampleSlug'),
		initialQuestionText: getStringField(value, 'initialQuestionText'),
		aiContext: getBringTheFirmAiContext(appState)
	};
}
