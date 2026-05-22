export const EMAIL_DRAFT_LIMITS = {
	recipient: 140,
	recipients: 12,
	attachmentFilename: 160,
	spreadsheetColumns: 26,
	spreadsheetRows: 100,
	spreadsheetCell: 200,
	bodyBlocks: 12,
	bodyText: 1_000,
	bulletItems: 8,
	linkLabel: 120,
	linkHref: 500
} as const;

export const SPREADSHEET_COLUMN_LABELS = Array.from(
	{ length: EMAIL_DRAFT_LIMITS.spreadsheetColumns },
	(_, index) => String.fromCharCode('A'.charCodeAt(0) + index)
) as string[];

export const EMAIL_ATTACHMENT_FORMAT = {
	extension: 'xlsx',
	shortLabel: 'XLSX',
	label: 'Excel workbook'
} as const;

export type EmailParagraphBlock = {
	type: 'paragraph';
	text: string;
};

export type EmailBulletsBlock = {
	type: 'bullets';
	items: string[];
};

export type EmailLinkBlock = {
	type: 'link';
	label: string;
	href: string;
};

export type EmailBodyBlock = EmailParagraphBlock | EmailBulletsBlock | EmailLinkBlock;

export type EmailSpreadsheetAttachment = {
	filename: string;
	cells: string[][];
};

export type EmailDraft = {
	to: string[];
	cc: string[];
	attachment: EmailSpreadsheetAttachment | null;
	body: EmailBodyBlock[];
};

export type EmailDraftPatch = {
	to?: string[];
	cc?: string[];
	attachment?: EmailSpreadsheetAttachment | null;
	body?: EmailBodyBlock[];
};

export type EmailDraftState = {
	version: number;
	visibility: 'hidden' | 'visible';
	draft: EmailDraft;
};

export function createDefaultEmailDraft(): EmailDraft {
	return {
		to: [],
		cc: [],
		attachment: null,
		body: []
	};
}

function clampText(value: string, maxLength: number) {
	const normalized = value.trim().replace(/\s+/g, ' ');

	return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized;
}

function clampMultilineText(value: string, maxLength: number) {
	const normalized = value.trim();

	return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized;
}

function normalizeRecipients(recipients: string[]) {
	const normalizedRecipients = recipients
		.slice(0, EMAIL_DRAFT_LIMITS.recipients)
		.map((recipient) => clampText(recipient, EMAIL_DRAFT_LIMITS.recipient))
		.filter(Boolean);

	return Array.from(new Set(normalizedRecipients));
}

export function normalizeEmailAttachmentName(value: string) {
	const withoutQueryOrHash = value.trim().split(/[?#]/)[0] ?? '';
	const filename = withoutQueryOrHash.split(/[\\/]/).pop() ?? '';
	const baseName = filename.replace(/\.[^.]+$/i, '');
	const sanitizedBaseName = baseName
		.replace(/[^a-zA-Z0-9 ._()-]+/g, '_')
		.replace(/\s+/g, ' ')
		.replace(/\.+$/g, '')
		.trim();
	const normalized = clampText(sanitizedBaseName, EMAIL_DRAFT_LIMITS.attachmentFilename);

	return normalized ? `${normalized}.${EMAIL_ATTACHMENT_FORMAT.extension}` : '';
}

export function createDefaultEmailSpreadsheetAttachment(
	filename = `Spreadsheet.${EMAIL_ATTACHMENT_FORMAT.extension}`
): EmailSpreadsheetAttachment {
	return {
		filename,
		cells: Array.from({ length: EMAIL_DRAFT_LIMITS.spreadsheetRows }, () =>
			Array.from({ length: EMAIL_DRAFT_LIMITS.spreadsheetColumns }, () => '')
		)
	};
}

function normalizeSpreadsheetCell(value: string) {
	return clampText(value, EMAIL_DRAFT_LIMITS.spreadsheetCell);
}

export function normalizeEmailSpreadsheetAttachment(
	attachment: EmailSpreadsheetAttachment | null
): EmailSpreadsheetAttachment | null {
	if (!attachment) {
		return null;
	}

	const filename = normalizeEmailAttachmentName(attachment.filename);

	if (!filename) {
		return null;
	}

	const cells = Array.from({ length: EMAIL_DRAFT_LIMITS.spreadsheetRows }, (_, rowIndex) =>
		Array.from({ length: EMAIL_DRAFT_LIMITS.spreadsheetColumns }, (_, columnIndex) =>
			normalizeSpreadsheetCell(attachment.cells[rowIndex]?.[columnIndex] ?? '')
		)
	);

	return {
		filename,
		cells
	};
}

export function normalizeEmailBodyBlock(block: EmailBodyBlock): EmailBodyBlock | null {
	switch (block.type) {
		case 'paragraph': {
			const text = clampMultilineText(block.text, EMAIL_DRAFT_LIMITS.bodyText);

			return text ? { type: 'paragraph', text } : null;
		}
		case 'bullets': {
			const items = block.items
				.slice(0, EMAIL_DRAFT_LIMITS.bulletItems)
				.map((item) => clampMultilineText(item, EMAIL_DRAFT_LIMITS.bodyText))
				.filter(Boolean);

			return items.length > 0 ? { type: 'bullets', items } : null;
		}
		case 'link': {
			const label = clampText(block.label, EMAIL_DRAFT_LIMITS.linkLabel);
			const href = clampText(block.href, EMAIL_DRAFT_LIMITS.linkHref);

			return label && href ? { type: 'link', label, href } : null;
		}
	}
}

function normalizeEmailBody(body: EmailBodyBlock[]) {
	return body
		.slice(0, EMAIL_DRAFT_LIMITS.bodyBlocks)
		.map(normalizeEmailBodyBlock)
		.filter((block): block is EmailBodyBlock => block !== null);
}

export function normalizeEmailDraft(draft: EmailDraft): EmailDraft {
	return {
		to: normalizeRecipients(draft.to),
		cc: normalizeRecipients(draft.cc),
		attachment: normalizeEmailSpreadsheetAttachment(draft.attachment),
		body: normalizeEmailBody(draft.body)
	};
}

export function hasEmailDraftChanged(before: EmailDraft, after: EmailDraft) {
	const normalizedBefore = normalizeEmailDraft(before);
	const normalizedAfter = normalizeEmailDraft(after);

	return JSON.stringify(normalizedBefore) !== JSON.stringify(normalizedAfter);
}

export function applyEmailDraftPatch(draft: EmailDraft, patch: EmailDraftPatch): EmailDraft {
	const nextDraft: EmailDraft = {
		to: [...draft.to],
		cc: [...draft.cc],
		attachment: draft.attachment
			? {
					filename: draft.attachment.filename,
					cells: draft.attachment.cells.map((row) => [...row])
				}
			: null,
		body: [...draft.body]
	};

	if (patch.to) {
		nextDraft.to = patch.to;
	}

	if (patch.cc) {
		nextDraft.cc = patch.cc;
	}

	if (patch.attachment !== undefined) {
		nextDraft.attachment = patch.attachment;
	}

	if (patch.body) {
		nextDraft.body = patch.body;
	}

	return normalizeEmailDraft(nextDraft);
}

export function hasEmailDraftPatchFields(patch: EmailDraftPatch | null): patch is EmailDraftPatch {
	return Boolean(
		patch &&
			(patch.to !== undefined ||
				patch.cc !== undefined ||
				patch.attachment !== undefined ||
				patch.body !== undefined)
	);
}

export const emailBodyBlockJsonSchema = {
	anyOf: [
		{
			type: 'object',
			additionalProperties: false,
			properties: {
				type: { type: 'string', enum: ['paragraph'] },
				text: {
					type: 'string',
					description: 'A concise email paragraph. Prefer one or two sentences.'
				}
			},
			required: ['type', 'text']
		},
		{
			type: 'object',
			additionalProperties: false,
			properties: {
				type: { type: 'string', enum: ['bullets'] },
				items: {
					type: 'array',
					items: {
						type: 'string',
						description: 'A concise email bullet.'
					},
					maxItems: EMAIL_DRAFT_LIMITS.bulletItems
				}
			},
			required: ['type', 'items']
		},
		{
			type: 'object',
			additionalProperties: false,
			properties: {
				type: { type: 'string', enum: ['link'] },
				label: { type: 'string' },
				href: { type: 'string' }
			},
			required: ['type', 'label', 'href']
		}
	]
} as const;

export const emailSpreadsheetAttachmentJsonSchema = {
	type: 'object',
	additionalProperties: false,
	properties: {
		filename: { type: 'string' },
		cells: {
			type: 'array',
			items: {
				type: 'array',
				items: { type: 'string' },
				maxItems: EMAIL_DRAFT_LIMITS.spreadsheetColumns
			},
			maxItems: EMAIL_DRAFT_LIMITS.spreadsheetRows
		}
	},
	required: ['filename', 'cells']
} as const;

export const emailDraftJsonSchema = {
	type: 'object',
	additionalProperties: false,
	properties: {
		to: { type: 'array', items: { type: 'string' }, maxItems: EMAIL_DRAFT_LIMITS.recipients },
		cc: { type: 'array', items: { type: 'string' }, maxItems: EMAIL_DRAFT_LIMITS.recipients },
		attachment: {
			anyOf: [emailSpreadsheetAttachmentJsonSchema, { type: 'null' }]
		},
		body: {
			type: 'array',
			items: emailBodyBlockJsonSchema,
			maxItems: EMAIL_DRAFT_LIMITS.bodyBlocks
		}
	},
	required: ['to', 'cc', 'attachment', 'body']
} as const;

export const emailDraftPatchJsonSchema = {
	type: 'object',
	additionalProperties: false,
	properties: {
		to: {
			type: 'array',
			items: { type: 'string' },
			maxItems: EMAIL_DRAFT_LIMITS.recipients
		},
		cc: {
			type: 'array',
			items: { type: 'string' },
			maxItems: EMAIL_DRAFT_LIMITS.recipients
		},
		attachment: {
			anyOf: [emailSpreadsheetAttachmentJsonSchema, { type: 'null' }]
		},
		body: {
			type: 'array',
			items: emailBodyBlockJsonSchema,
			maxItems: EMAIL_DRAFT_LIMITS.bodyBlocks
		}
	}
} as const;
