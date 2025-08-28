#!/usr/bin/env node

import { basename, resolve } from 'node:path';
import chalk from 'chalk';
import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import ora from 'ora';
import { DEFAULT_IGNORE } from './utils/constants';
import { inferOutputTarget } from './utils/helpers';
import { initialProgram } from './utils/program';
import { renderFile, writeDeifinitionFile, writeFile } from './utils/render';
import { scanProject } from './utils/scan';
import type { Format } from './utils/types';

async function main() {
	let watcher: FSWatcher;
	const program = initialProgram();

	const options = program.opts();
	const directoryToScan: string = resolve(options.dir);
	const targetOutput: string = options?.out;
	const requestToMerge: boolean = options.merge;
	const watchMode: boolean = options.watch;
	const ignorePatterns = Array.isArray(options.ignore)
		? options.ignore
		: DEFAULT_IGNORE;

	const {
		finalPath,
		format: targetFormat,
		type: outputType,
		exists: outputFileExists,
	} = inferOutputTarget(targetOutput, options?.format);

	if (outputType === 'stdout') {
		throw new Error('invalid target path to generate output file');
	}

	if (requestToMerge) {
		console.log(
			chalk.yellowBright(
				`requested to merge with existing ${finalPath} file...`,
			),
		);
	}

	if (outputFileExists) {
		console.log(chalk.gray(`${finalPath} file detected!`));
	} else {
		console.log(chalk.gray(`${finalPath} file not found!`));
	}

	const spinner = ora('Scanning project for env usage...').start();

	async function runScanAndWrite() {
		try {
			const envMap = await scanProject(directoryToScan, ignorePatterns);
			const foundedVariablesCount = Array.from(envMap.keys()).filter(
				(k) => k !== '<DYNAMIC_KEY>',
			).length;
			spinner.clear();
			spinner.succeed(`Found ${foundedVariablesCount} env keys`).stop();

			if (!outputFileExists && foundedVariablesCount === 0) {
				return;
			}

			if (options.types) {
				writeDeifinitionFile(envMap);
				console.log(
					chalk.green(`Type definition has generated env.d.ts`),
				);
			}

			const content = renderFile(envMap, targetFormat as Format);
			await writeFile(finalPath as string, content, requestToMerge);
			if (outputFileExists && requestToMerge) {
				console.log(
					chalk.green(`${basename(finalPath as string)} updated`),
				);
			} else {
				console.log(chalk.green(`written to ${finalPath as string}`));
			}
		} catch (error) {
			spinner.fail('Scan failed');
			console.error(error);
		}
	}

	if (watchMode) {
		spinner.clear();
		console.log(chalk.blue('\nWatching for file changes...'));
		watcher = chokidar.watch('.', {
			ignored: [
				...ignorePatterns,
				/\.d\.ts$/,
				(path, stats) =>
					stats?.isFile() &&
					!path.endsWith('.js') &&
					!path.endsWith('.ts') &&
					!path.endsWith('.mts') &&
					!path.endsWith('.mjs') &&
					!path.endsWith('.jsx') &&
					!path.endsWith('.tsx'),
			],
			cwd: directoryToScan,
			ignoreInitial: false,
			awaitWriteFinish: { stabilityThreshold: 300 },
		});

		const debounced = (() => {
			let t: NodeJS.Timeout | null = null;
			return (fn: () => void, ms = 500) => {
				if (t) clearTimeout(t);
				t = setTimeout(fn, ms);
			};
		})();

		watcher.on('all', (_event, _path) => {
			debounced(async () => {
				try {
					await runScanAndWrite();
				} catch (error) {
					console.error('Error in runScanAndWrite:', error);
				}
			}, 400);
		});
	} else {
		await runScanAndWrite();
	}

	process.on('SIGINT', async () => {
		spinner.stop(); // stop the spinner so it doesnt block terminal
		await watcher.close();
		process.exit(0);
	});
}

main();
