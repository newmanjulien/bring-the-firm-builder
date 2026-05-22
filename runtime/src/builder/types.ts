import type { EmailDraft } from '@overbase/builder-sdk/email';

export type {
	BuilderAppManifest,
	GuideChoiceQuestion,
	GuideDefinition,
	GuideQuestion,
	GuideTextQuestion
} from '@overbase/builder-sdk/catalog';
export type {
	EmailBuilderTurnStreamHandlers,
	EmailBuilderTurnStreamResult,
	TranscriptMessage
} from '@overbase/builder-sdk/streams';

export type BringTheFirmExamplesCandidate = {
	slug: string;
	description: string;
	questionGuidance: string;
};

export type BringTheFirmExampleCandidate = {
	slug: string;
	description: string;
	matchSignals: string[];
	emailDraft: EmailDraft;
};

export type BringTheFirmAiContext = {
	personContext?: string;
	conversationReason?: string;
	formatUse?: string;
};

export type BringTheFirmRouteResult = {
	examplesSlug: string;
	publicQuestion: string;
};

export type BringTheFirmAdaptedExampleResult = {
	exampleSlug: string;
	emailDraft: EmailDraft;
};
