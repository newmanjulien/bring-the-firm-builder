import { bringTheFirmGuide } from './guide.js';
import type { BuilderAppManifest } from './types.js';

export const BRING_THE_FIRM_APP_SLUG = 'bring-the-firm';

export const bringTheFirmManifest = {
	slug: BRING_THE_FIRM_APP_SLUG,
	title: 'Bring the firm',
	description:
		"Accelerate your Bring the firm program by analyzing each consultant's upcoming meetings then proposing colleagues they could invite to join",
	details: {
		paragraphs: [
			'Bring the Firm reviews upcoming meetings and account signals to recommend colleagues who can add relevant expertise, relationships, or industry context before the next client conversation.',
			'The guided setup captures how your firm runs colleague introductions, when availability should be confirmed, and which recommendation patterns should shape the email format your consultants receive.'
		]
	},
	mode: 'guided',
	guide: bringTheFirmGuide
} satisfies BuilderAppManifest;
