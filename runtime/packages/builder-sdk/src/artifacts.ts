import {
	applyEmailDraftPatch,
	hasEmailDraftChanged,
	hasEmailDraftPatchFields,
	normalizeEmailDraft,
	type EmailDraft,
	type EmailDraftPatch
} from './email.js';

export const PRIMARY_EMAIL_DRAFT_ARTIFACT_ID = 'primary';

export type BuilderArtifactVisibility = 'hidden' | 'visible';

export type BuilderEmailDraftArtifact = {
	id: typeof PRIMARY_EMAIL_DRAFT_ARTIFACT_ID;
	kind: 'emailDraft';
	version: number;
	visibility: BuilderArtifactVisibility;
	value: EmailDraft;
};

export type BuilderArtifact = BuilderEmailDraftArtifact;

export type BuilderArtifacts = {
	primary?: BuilderEmailDraftArtifact;
};

export type BuilderEmailDraftArtifactSet = {
	artifactId: typeof PRIMARY_EMAIL_DRAFT_ARTIFACT_ID;
	kind: 'emailDraft';
	visibility: BuilderArtifactVisibility;
	value: EmailDraft;
};

export type BuilderArtifactSet = BuilderEmailDraftArtifactSet;

export type BuilderEmailDraftArtifactPatch = {
	artifactId: typeof PRIMARY_EMAIL_DRAFT_ARTIFACT_ID;
	kind: 'emailDraft';
	patch: EmailDraftPatch | null;
};

export type BuilderArtifactPatch = BuilderEmailDraftArtifactPatch;

export type BuilderArtifactChangeResult =
	| {
			changed: false;
			artifacts: BuilderArtifacts;
	  }
	| {
			changed: true;
			artifacts: BuilderArtifacts;
	  };

export function normalizeBuilderArtifacts(artifacts?: BuilderArtifacts | null): BuilderArtifacts {
	const artifact = artifacts?.primary;

	if (!artifact) {
		return {};
	}

	return {
		primary: {
			id: PRIMARY_EMAIL_DRAFT_ARTIFACT_ID,
			kind: 'emailDraft',
			version: artifact.version,
			visibility: artifact.visibility,
			value: normalizeEmailDraft(artifact.value)
		}
	};
}

export function createPrimaryEmailDraftArtifact(params: {
	value: EmailDraft;
	version?: number;
	visibility: BuilderArtifactVisibility;
}): BuilderEmailDraftArtifact {
	return {
		id: PRIMARY_EMAIL_DRAFT_ARTIFACT_ID,
		kind: 'emailDraft',
		version: params.version ?? 1,
		visibility: params.visibility,
		value: normalizeEmailDraft(params.value)
	};
}

export function createPrimaryEmailDraftArtifactSet(params: {
	value: EmailDraft;
	visibility: BuilderArtifactVisibility;
}): BuilderEmailDraftArtifactSet {
	return {
		artifactId: PRIMARY_EMAIL_DRAFT_ARTIFACT_ID,
		kind: 'emailDraft',
		visibility: params.visibility,
		value: normalizeEmailDraft(params.value)
	};
}

export function createPrimaryEmailDraftArtifactPatch(params: {
	patch: EmailDraftPatch | null;
}): BuilderEmailDraftArtifactPatch {
	return {
		artifactId: PRIMARY_EMAIL_DRAFT_ARTIFACT_ID,
		kind: 'emailDraft',
		patch: params.patch
	};
}

export function getPrimaryEmailDraftArtifact(
	artifacts?: BuilderArtifacts | null
): BuilderEmailDraftArtifact | null {
	const artifact = artifacts?.primary;

	return artifact?.kind === 'emailDraft' ? artifact : null;
}

export function getHiddenPrimaryEmailDraftArtifact(
	artifacts?: BuilderArtifacts | null
): BuilderEmailDraftArtifact | null {
	const artifact = getPrimaryEmailDraftArtifact(artifacts);

	return artifact?.visibility === 'hidden' ? artifact : null;
}

export function getVisiblePrimaryEmailDraftArtifact(
	artifacts?: BuilderArtifacts | null
): BuilderEmailDraftArtifact | null {
	const artifact = getPrimaryEmailDraftArtifact(artifacts);

	return artifact?.visibility === 'visible' ? artifact : null;
}

export function applyBuilderArtifactSetEvent(
	artifacts: BuilderArtifacts | null | undefined,
	artifactSet: BuilderArtifactSet
): BuilderArtifactChangeResult {
	const normalizedArtifacts = normalizeBuilderArtifacts(artifacts);
	const currentArtifact = normalizedArtifacts.primary;

	return {
		changed: true,
		artifacts: {
			...normalizedArtifacts,
			primary: {
				id: PRIMARY_EMAIL_DRAFT_ARTIFACT_ID,
				kind: 'emailDraft',
				version: (currentArtifact?.version ?? 0) + 1,
				visibility: artifactSet.visibility,
				value: normalizeEmailDraft(artifactSet.value)
			}
		}
	};
}

export function replaceBuilderArtifact(
	artifacts: BuilderArtifacts | null | undefined,
	artifact: BuilderArtifact
): BuilderArtifacts {
	const normalizedArtifacts = normalizeBuilderArtifacts(artifacts);

	return {
		...normalizedArtifacts,
		primary: {
			...artifact,
			id: PRIMARY_EMAIL_DRAFT_ARTIFACT_ID,
			kind: 'emailDraft',
			value: normalizeEmailDraft(artifact.value)
		}
	};
}

export function applyBuilderArtifactPatchEvent(
	artifacts: BuilderArtifacts | null | undefined,
	artifactPatch: BuilderArtifactPatch
): BuilderArtifactChangeResult {
	const normalizedArtifacts = normalizeBuilderArtifacts(artifacts);
	const artifact = normalizedArtifacts.primary;

	if (
		!artifact ||
		artifact.kind !== 'emailDraft' ||
		artifact.visibility !== 'visible' ||
		artifactPatch.kind !== 'emailDraft' ||
		!hasEmailDraftPatchFields(artifactPatch.patch)
	) {
		return {
			changed: false,
			artifacts: normalizedArtifacts
		};
	}

	const value = applyEmailDraftPatch(artifact.value, artifactPatch.patch);

	if (!hasEmailDraftChanged(artifact.value, value)) {
		return {
			changed: false,
			artifacts: normalizedArtifacts
		};
	}

	return {
		changed: true,
		artifacts: {
			...normalizedArtifacts,
			primary: {
				...artifact,
				version: artifact.version + 1,
				value
			}
		}
	};
}
