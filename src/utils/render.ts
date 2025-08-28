import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { EnvKeyMap, KeyMeta } from './extract';
import { looksSensitive, outputFile } from './helpers';
import type { Format } from './types';

const DYNAMIC_KEY_WARNING =
	'NOTE: dynamic keys detected (e.g. process.env[someVar]).';
const DYNAMIC_KEY_INSTRUCTION =
	'Please review code and add any dynamic env keys manually.';

export function renderFile(map: EnvKeyMap, format: Format) {
	switch (format) {
		case 'env':
			return renderEnv(map);
		case 'json':
			return renderJson(map);
		case 'yml':
			return renderYml(map);
		default:
			throw new Error(
				'Unsupported file extension. Only declared extensions are allowed.',
			);
	}
}

const getSortedKeys = (map: EnvKeyMap) => {
	return Array.from(map.values())
		.filter((k) => k.key !== '<DYNAMIC_KEY>')
		.sort((a, b) => a.key.localeCompare(b.key));
};

const buildComments = (meta: KeyMeta, includeHash = false): string[] => {
	const comments: string[] = [];
	const filesArr = Array.from(meta.files).slice(0, 3);
	const prefix = includeHash ? '# ' : '';

	comments.push(
		`${prefix}used in: ${filesArr.join(', ')}${meta.files.size > 3 ? ', ...' : ''}`,
	);

	if (meta.hasDefault) {
		if (looksSensitive(meta.key)) {
			comments.push(`${prefix}has default (sensitive value hidden)`);
		} else if (meta.defaultExample != null) {
			comments.push(`${prefix}default: ${meta.defaultExample}`);
		} else {
			comments.push(`${prefix}has default`);
		}
	}

	return comments;
};

const renderYml = (map: EnvKeyMap): string => {
	const lines: string[] = [];
	const keys = getSortedKeys(map);

	for (const meta of keys) {
		const comments = buildComments(meta, false);
		lines.push(`# ${comments.join(', ')}`);
		lines.push(`${meta.key}: ''`);
		lines.push('');
	}

	if (map.has('<DYNAMIC_KEY>')) {
		lines.push(`# ${DYNAMIC_KEY_WARNING}`);
		lines.push(`# ${DYNAMIC_KEY_INSTRUCTION}`);
		lines.push('DYNAMIC_KEY: ""');
		lines.push('');
	}

	return lines.join('\n');
};

const renderJson = (map: EnvKeyMap): string => {
	const items: Array<{ description: string; key: string; value: string }> =
		[];
	const keys = getSortedKeys(map);

	for (const meta of keys) {
		const comments = buildComments(meta, false);
		items.push({
			description: comments.join(', '),
			key: meta.key,
			value: '',
		});
	}

	if (map.has('<DYNAMIC_KEY>')) {
		items.push({
			description: `${DYNAMIC_KEY_WARNING} ${DYNAMIC_KEY_INSTRUCTION}`,
			key: 'DYNAMIC_KEY',
			value: '',
		});
	}

	return JSON.stringify(items, null, 2);
};

const renderEnv = (map: EnvKeyMap): string => {
	const lines: string[] = [];
	const keys = getSortedKeys(map);

	for (const meta of keys) {
		const comments = buildComments(meta, true);
		lines.push(...comments);
		lines.push(`${meta.key}=`);
		lines.push('');
	}

	if (map.has('<DYNAMIC_KEY>')) {
		lines.push(`# ${DYNAMIC_KEY_WARNING}`);
		lines.push(`# ${DYNAMIC_KEY_INSTRUCTION}`);
		lines.push('');
	}

	return lines.join('\n');
};

export async function writeFile(
	outPath: string,
	content: string,
	requestToMerge: boolean = false,
): Promise<void> {
	const banner = `# .env.example (generated)\n# Add real values to .env — do NOT commit secrets to source control.
	`;
	if (requestToMerge && existsSync(outPath)) {
		const existingContent = await readFile(outPath, { encoding: 'utf-8' });
		const bannerExists = existingContent.startsWith(banner);

		const existingKeys = new Set(
			existingContent
				.split(/\r?\n/)
				.map((l) => l.trim())
				.filter((l) => /^[A-Z0-9_]+=/.test(l))
				.map((l) => l.split('=')[0]),
		);

		const lines = content.split(/\r?\n/);

		const newLines: string[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (/^[A-Z0-9_]+=/.test(line as string)) {
				const key = line?.split('=')[0];
				if (existingKeys.has(key)) {
					// skip this KEY and also drop preceding comments
					while (
						newLines.length > 0 &&
						newLines[newLines.length - 1]?.startsWith('#')
					) {
						newLines.pop();
					}
					continue;
				}
			}
			newLines.push(line as string);
		}

		const merged = [
			...(bannerExists ? [] : [banner]),
			existingContent.trim(),
			...newLines,
		].join('\n');
		outputFile(resolve(outPath), merged);
	} else {
		outputFile(resolve(outPath), content);
	}
}

export function writeDeifinitionFile(envKeyMap: EnvKeyMap) {
	const typeDefinition =
		`declare namespace NodeJS {\n` +
		`  interface ProcessEnv {\n` +
		Array.from(envKeyMap.keys())
			.map((k) => `    ${k}: string;`)
			.join('\n') +
		`\n  }\n}`;

	outputFile(resolve('env.d.ts'), typeDefinition);
}
