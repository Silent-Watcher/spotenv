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
	const ext = extname(base).toLowerCase();
	const filename = base.startsWith('.')
		? base.split('.')[1]
		: base.split('.')[0];
	const format = requestedFormat ?? inferFormatFromBase(base) ?? 'env';

	// 1) If exists -> trust filesystem
	if (existsSync(normalized)) {
		const s = statSync(normalized);
		if (s.isDirectory()) {
			const chosenFile = filenameForFormat(requestedFormat ?? 'env');
			return {
				type: 'directory',
				format,
				finalPath: join(normalized, chosenFile),
				reason: 'path exists and is directory',
			};
		}

		if (s.isFile()) {
			let finalPath: string;

			if (format === 'env') {
				finalPath = join(dirname(rawPath), base);
			} else {
				finalPath = join(dirname(rawPath), `${filename}.${format}`);
			}

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
	return {
		type: 'directory',
		format,
		finalPath,
		reason: 'no extension and does not exist — choose directory by default',
		exists: existsSync(finalPath),
	};
}
