export type RuntimeHealthPayload = {
	ok: true;
	app: 'bring-the-firm';
};

export function createRuntimeHealthPayload(): RuntimeHealthPayload {
	return {
		ok: true,
		app: 'bring-the-firm'
	};
}
