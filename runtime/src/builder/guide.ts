// Questions asked at the beginning of the conversation through a structured form.

import type { GuideDefinition } from './types.js';

export const bringTheFirmGuide = {
	intro: 'Let\'s build your Bring the Firm email format. I just have a few quick questions.',
	questions: [
		{
			id: 'existing-program',
			type: 'choice',
			title: 'Does your firm already run a Bring the Firm program?',
			helpText:
				'Tell us whether this email format should support an established Bring the Firm motion or introduce the workflow from scratch.',
			options: [
				'Yes and it\'s widely adopted',
				'Yes and it\'s only somewhat successful',
				'No but we have in the past',
				'We\'ve never run one'
			],
			customAnswerPlaceholder: 'Describe your current program...'
		},
		{
			id: 'confirm-availability',
			type: 'choice',
			title:
				'Should we confirm that folks are available before proposing them in the generated opportunities?',
			helpText:
				'Choose when the email format should check colleague availability before recommending them for a client meeting.',
			options: [
				'Always confirm that folks are available',
				'Confirm when the person being invited is more senior',
				'Confirm when they\'re more junior',
				'Never confirm'
			],
			customAnswerPlaceholder: 'Explain when we should confirm...'
		}
	]
} satisfies GuideDefinition;
