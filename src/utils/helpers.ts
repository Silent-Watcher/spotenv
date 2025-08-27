import { existsSync, type PathLike, statSync } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, normalize, sep } from 'node:path';
import type { ParseResult } from '@babel/parser';
import { parse } from '@babel/parser';
import * as t from '@babel/types';
import { KNOWN_FILE_EXTS } from './constants';
import type { Format } from './types';

export function parseFileToAst(sourceCode: string): ParseResult {
	return parse(sourceCode, {
		sourceType: 'unambiguous',
		plugins: [
			'typescript',
			'jsx',
			'classProperties',
			'optionalChaining',
			'nullishCoalescingOperator',
			'dynamicImport',
			'decorators-legacy',
		],
	});
}

export function looksSensitive(key: string) {
	return /secret|token|key|pwd|password|private/i.test(key);
}

export function tryExtractDefaultFromParent(path: any): string | null {
	// look for patterns: process.env.FOO || 'bar'  or process.env.FOO ?? 'bar'
	const parent = path.parentPath?.node;
	if (!parent) return null;

	if (
		t.isLogicalExpression(parent) &&
		(parent.operator === '||' || parent.operator === '??')
	) {
		const right = parent.right;
		if (
			t.isStringLiteral(right) ||
			t.isNumericLiteral(right) ||
			t.isBooleanLiteral(right)
		) {
			return String((right as any).value);
		}
	}

	// conditional expression like process.env.FOO ? process.env.FOO : 'bar'
	if (t.isConditionalExpression(parent)) {
		const consequent = parent.consequent;
		const alternate = parent.alternate;
		if (t.isStringLiteral(alternate) || t.isNumericLiteral(alternate)) {
			return String((alternate as any).value);
		}
	}

	return null;
}

export async function outputFile(file: PathLike | FileHandle, data: string) {
	await mkdir(dirname(String(file)), { recursive: true });
	await writeFile(file, data, { encoding: 'utf-8' });
}

// export function doesEnvExampleFileExists(targetAddr: string): {
// 	result: boolean;
// 	at: string;
// } {
// 	let envExampleExists = false;
// 	envExampleExists = existsSync(targetAddr);

// 	return {
// 		result: envExampleExists,
// 		at: targetAddr,
// 	};
// }

// const isFormat = (x: any): x is Format => {
// 	return x === "json" || x === "env" || x === "yml";
// };

// export const acquireFormatFromInput = (raw: string): Format => {
// 	return isFormat(raw) ? raw : "env";
// };

// const createFilename = (
// 	filename: string,
// 	extension: string,
// 	prefix = "",
// ): string => {
// 	console.log("filename: ", filename);
// 	console.log("extname(filename)", extname(filename));
// 	const dir = dirname(filename);
// 	console.log("dir: ", dir);
// 	const base = basename(filename, extname(filename));
// 	let newFilename: string | null = "";
// 	console.log('base === ".env": ', base === ".env");
// 	if (base === ".env") {
// 		newFilename = `${prefix}${extname(filename).replace(".", "")}`;
// 	} else {
// 		newFilename = `${prefix}${base}${extension}`;
// 	}
// 	console.log("base: ", base);
// 	console.log("newFilename: ", newFilename);
// 	return dir === "." ? newFilename : join(dir, newFilename);
// };

// export const makeExampleFilenameHandler: {
// 	[k in Format]: (filename: string) => string;
// } = {
// 	json: (filename) => createFilename(filename, ".json"),
// 	env: (filename) => createFilename(filename, "", ".env."),
// 	yml: (filename) => createFilename(filename, ".yml"),
// };

function isDotEnv(basename: string) {
	return basename.toLowerCase().startsWith('.env');
}

function inferFormatFromBase(basename: string): Format | null {
	const b = basename.toLowerCase();

	if (b.startsWith('.env') || extname(b) === '.env') return 'env';
	if (b.endsWith('.json')) return 'json';
	if (b.endsWith('.yml') || b.endsWith('.yaml')) return 'yml';
	return null;
}

function filenameForFormat(format: Format, name: string = 'env'): string {
	console.log('filenameForFormat: ', filenameForFormat);
	if (format === 'json') return `${name}.json`;
	if (format === 'yml') return `${name}.yaml`;

	// default env
	return `.env.example`;
}

export function inferOutputTarget(
	rawPath: string,
	requestedFormat?: Format,
): {
	type: 'stdout' | 'file' | 'directory';
	format: Format | null;
	finalPath: string | null;
	reason: string;
	exists?: boolean;
} {
	if (!rawPath) {
		return {
			type: 'stdout',
			format: null,
			finalPath: null,
			reason: 'no path',
		};
	}

	const normalized = normalize(rawPath);
	const base = basename(normalized);
	console.log('base: ', base);
	const ext = extname(base).toLowerCase();
	const filename = base.startsWith('.')
		? base.split('.')[1]
		: base.split('.')[0];
	console.log('filename: ', filename);
	const format = requestedFormat ?? inferFormatFromBase(base) ?? 'env';
	console.log('format: ', format);

	// 1) If exists -> trust filesystem
	if (existsSync(normalized)) {
		const s = statSync(normalized);
		if (s.isDirectory()) {
			console.log(1);
			const chosenFile = filenameForFormat(requestedFormat ?? 'env');
			console.log('chosenFile: ', chosenFile);
			return {
				type: 'directory',
				format,
				finalPath: join(normalized, chosenFile),
				reason: 'path exists and is directory',
			};
		}

		if (s.isFile()) {
			let finalPath: string;
			console.log('rawPath: ', rawPath);
			console.log('filename: ', filename);
			if (format === 'env') {
				finalPath = join(dirname(rawPath), base);
			} else {
				finalPath = join(dirname(rawPath), `${filename}.${format}`);
			}
			console.log(2);
			console.log('finalPath: ', finalPath);
			return {
				type: 'file',
				format,
				finalPath,
				reason: 'path exists and is file',
				exists: existsSync(finalPath),
			};
		}
	}

	// 2) ends with separator -> directory
	if (
		rawPath.endsWith('/') ||
		rawPath.endsWith(sep) ||
		rawPath.endsWith('\\')
	) {
		const chosenFile = filenameForFormat(requestedFormat ?? 'env');
		console.log(3);
		console.log('chosenFile: ', chosenFile);

		return {
			type: 'directory',
			format,
			finalPath: join(normalized, chosenFile),
			reason: 'ends with separator (looks like directory)',
		};
	}

	// 3) basename indicates a file (extension or dotfile starting with .env)
	if (isDotEnv(base) || KNOWN_FILE_EXTS.has(ext) || ext !== '') {
		// ext !== '' covers unknown extensions too (user explicitly provided file name with extension)
		let finalPath: string;
		if (format === 'env') {
			finalPath = join(dirname(rawPath), base);
		} else {
			finalPath = join(dirname(rawPath), `${filename}.${format}`);
		}
		console.log('rawPath: ', rawPath);
		console.log('`${filename}.${format}`: ', `${filename}.${format}`);
		console.log('dirname(rawPath): ', dirname(rawPath));
		console.log(4);
		console.log('finalPath: ', finalPath);
		return {
			type: 'file',
			format,
			finalPath,
			reason: 'basename has extension or .env-style dotfile (treat as file)',
			exists: existsSync(finalPath),
		};
	}

	// 4) ambiguous: default to directory
	const finalPath = join(
		normalized,
		filenameForFormat(requestedFormat ?? 'env'),
	);
	console.log('finalPath: ', finalPath);
	console.log(5);
	return {
		type: 'directory',
		format,
		finalPath,
		reason: 'no extension and does not exist — choose directory by default',
		exists: existsSync(finalPath),
	};
}
