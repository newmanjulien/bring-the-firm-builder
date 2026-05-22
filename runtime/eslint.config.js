import tseslint from 'typescript-eslint';

export default [
	{
		ignores: ['node_modules/**', 'dist/**', '.vercel/**', 'packages/builder-sdk/dist/**']
	},
	...tseslint.configs.recommended
];
