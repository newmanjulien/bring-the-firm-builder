import type { EmailDraft } from '@overbase/builder-sdk/email';

export type BringTheFirmExamples = {
	slug: string;
	description: string;
	questionGuidance: string;
	examples: BringTheFirmExample[];
};

export type BringTheFirmExample = {
	slug: string;
	description: string;
	matchSignals: string[];
	emailDraft: EmailDraft;
};
