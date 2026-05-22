import { newProgramExamples } from './new-program.js';

export type { BringTheFirmExample, BringTheFirmExamples } from './types.js';
export * from './new-program.js';

export const bringTheFirmExamples = [newProgramExamples];

export function listBringTheFirmExamples() {
	return [...bringTheFirmExamples];
}

export function getBringTheFirmExamples(slug: string) {
	return bringTheFirmExamples.find((exampleSet) => exampleSet.slug === slug) ?? null;
}

export function listBringTheFirmDraftExamples(examplesSlug: string) {
	return getBringTheFirmExamples(examplesSlug)?.examples ?? [];
}
