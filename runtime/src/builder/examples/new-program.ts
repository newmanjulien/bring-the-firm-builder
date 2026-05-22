import type { BringTheFirmExamples } from './types.js';

export const newProgramExamples = {
	slug: 'new-program',
	description:
		'Examples to use if this consulting firm doesn\'t have much experience with Bring the Firm programs',
	// The AI sometimes uses this text more literally than it should, so write it as user-facing question copy.
	questionGuidance:
		'What is most likely to motivate your colleagues to participate in a Bring the Firm program?',
	examples: [
		{
			slug: 'executive-sponsorship',
			description:
				'Email folks about Bring the Firm opportunities while highlighting executives who are participating in the program',
			matchSignals: ['executive sponsorship', 'CEO involvement'],
			emailDraft: {
				to: ['Relationship owner'],
				cc: [],
				attachment: null,
				body: [
					{
						type: 'paragraph',
						text: 'You have an upcoming meeting with Liam Taylor from Allianz. As you know, Nicolas and the broader leadership team has been pushing Bring the Firm and here are some ideas of colleagues you might bring along'
					},
					{
						type: 'bullets',
						items: [
							'Ajay Agrawal in the Tech practice - other carriers seem to be increasing their AI spend',
							'Amelia Fernandez in the Tech practice - if you want someone more junior than Ajay'
						]
					}
				]
			}
		}
	]
} satisfies BringTheFirmExamples;
