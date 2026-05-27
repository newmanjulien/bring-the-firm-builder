export type RuntimeHealthPayload = {
	ok: true;
	app: 'bring-the-firm-builder';
};

export function createRuntimeHealthPayload(): RuntimeHealthPayload {
	return {
		ok: true,
		app: 'bring-the-firm-builder'
	};
}
