import { existsSync, type PathLike } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import type { ParseResult } from '@babel/parser';
import { parse } from '@babel/parser';
import * as t from '@babel/types';
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

export function doesEnvExampleFileExists(targetAddr: string): {
	result: boolean;
	at: string;
} {
	let envExampleExists = false;
	envExampleExists = existsSync(targetAddr);

	return {
		result: envExampleExists,
		at: targetAddr,
	};
}

const isFormat = (x: any): x is Format => {
	return x === 'json' || x === 'env' || x === 'yml';
};

export const acquireFormat = (raw: string): Format => {
	return isFormat(raw) ? raw : 'env';
};

const createFilename = (
	filename: string,
	extension: string,
	prefix = '',
): string => {
	const dir = dirname(filename);
	const base = basename(filename, extname(filename));
	const newFilename = `${prefix}${base}${extension}`;
	return dir === '.' ? newFilename : join(dir, newFilename);
};

export const makeExampleFilenameHandler: {
	[k in Format]: (filename: string) => string;
} = {
	json: (filename) => createFilename(filename, '.json'),
	env: (filename) => createFilename(filename, '', '.env.'),
	yml: (filename) => createFilename(filename, '.yml'),
};
