import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { EnvKeyMap } from './extract';
import { looksSensitive, outputFile } from './helpers';

export function renderEnvExample(map: EnvKeyMap) {
	const lines: string[] = [];

	const keys = Array.from(map.values()).filter(
		(k) => k.key !== '<DYNAMIC_KEY>',
	);

	keys.sort((a, b) => a.key.localeCompare(b.key));

	for (const meta of keys) {
		const comments: string[] = [];
		const filesArr = Array.from(meta.files).slice(0, 3);
		comments.push(
			`# used in: ${filesArr.join(', ')}${
				meta.files.size > 3 ? ', ...' : ''
			}`,
		);
		if (meta.hasDefault) {
			if (looksSensitive(meta.key)) {
				comments.push(`# has default (sensitive value hidden)`);
			} else if (meta.defaultExample != null) {
				comments.push(`# default: ${meta.defaultExample}`);
			} else {
				comments.push(`# has default`);
			}
		}
		for (const c of comments) lines.push(c);
		lines.push(`${meta.key}=`);
		lines.push('');
	}

	if (map.has('<DYNAMIC_KEY>')) {
		lines.push(
			'# NOTE: dynamic keys detected (e.g. process.env[someVar]).',
		);
		lines.push(
			'# Please review code and add any dynamic env keys manually.',
		);
		lines.push('');
	}

	return lines.join('\n');
}

export async function writeEnvExample(
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
