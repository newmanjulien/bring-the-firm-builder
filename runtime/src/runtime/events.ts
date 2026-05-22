import {
	createPrimaryEmailDraftArtifactPatch,
	createPrimaryEmailDraftArtifactSet
} from '@overbase/builder-sdk/artifacts';
import type { BuilderAppFinalEvent } from '@overbase/builder-sdk/app-protocol';
import type { EmailDraft, EmailDraftPatch } from '@overbase/builder-sdk/email';

export function askFollowUpQuestion(params: {
	questionText: string;
	selectedExamplesSlug: string;
}): BuilderAppFinalEvent[] {
	return [
		{ type: 'assistantComplete', text: params.questionText },
		{
			type: 'appStatePatch',
			patch: {
				selectedExamplesSlug: params.selectedExamplesSlug,
				initialQuestionText: params.questionText
			}
		},
		{ type: 'enqueueBackgroundJob' },
		{ type: 'waitForUser' },
		completeTurn()
	];
}

export function revealEmailDraft(emailDraft: EmailDraft): BuilderAppFinalEvent[] {
	return [
		{
			type: 'assistantComplete',
			text: 'I adjusted the draft based on that and put it in the panel.'
		},
		{
			type: 'artifactSet',
			artifact: createPrimaryEmailDraftArtifactSet({
				value: emailDraft,
				visibility: 'visible'
			})
		},
		completeTurn()
	];
}

export function setHiddenEmailDraft(params: {
	emailDraft: EmailDraft;
	selectedExampleSlug: string;
}): BuilderAppFinalEvent[] {
	return [
		{
			type: 'artifactSet',
			artifact: createPrimaryEmailDraftArtifactSet({
				value: params.emailDraft,
				visibility: 'hidden'
			})
		},
		{
			type: 'appStatePatch',
			patch: {
				selectedExampleSlug: params.selectedExampleSlug
			}
		},
		completeTurn()
	];
}

export function patchVisibleEmailDraft(result: {
	text: string;
	patch: EmailDraftPatch | null;
}): BuilderAppFinalEvent[] {
	return [
		{
			type: 'assistantComplete',
			text: result.text.trim() || (result.patch ? 'Updated the draft.' : 'No changes needed.')
		},
		{
			type: 'artifactPatch',
			artifact: createPrimaryEmailDraftArtifactPatch({
				patch: result.patch
			})
		},
		completeTurn()
	];
}

export function completeTurn(): BuilderAppFinalEvent {
	return { type: 'complete' };
}
