export const DEFAULT_IGNORE = [
	'**/node_modules/**',
	'**/dist/**',
	'**/build/**',
	'**/.next/**',
	'**/.turbo/**',
	'**/.vercel/**',
	'**/out/**',
];

export const KNOWN_FILE_EXTS = new Set([
	'.env',
	'.json',
	'.yml',
	'.yaml',
	'.env.example',
]);
