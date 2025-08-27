#!/usr/bin/env node

import { basename, resolve } from 'node:path';
import chalk from 'chalk';
import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import ora from 'ora';
import { DEFAULT_IGNORE } from './utils/constants';
import { inferOutputTarget } from './utils/helpers';
import { initialProgram } from './utils/program';
import { renderFile, writeFile } from './utils/render';
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
	const targetFormat: Format = acquireFormat(options?.format);
	const fullFilename = makeExampleFilenameHandler[targetFormat](filename);
	const path = resolve(fullFilename);

	const {
		finalPath,
		format: targetFormat,
		type: outputType,
		exists: outputFileExists,
	} = inferOutputTarget(targetOutput, options?.format);
	// acquireFormatFromInput(options?.format)

	if (outputType === 'stdout') {
		throw new Error('invalid target path to generate output file');
	}

	// const fullFilename = makeExampleFilenameHandler[targetFormat](filename);
	// console.log("fullFilename: ", fullFilename);
	// const path = resolve(fullFilename);

	if (requestToMerge) {
		console.log(
			chalk.yellowBright(
				`requested to merge with existing ${finalPath} file...`,
			),
		);
	}

	// const envExampleFileExists = doesEnvExampleFileExists(path);

	if (outputFileExists) {
		console.log(chalk.gray(`${finalPath} file detected!`));
	} else {
		console.log(chalk.gray(`${finalPath} file not found!`));
	}

	const spinner = ora('Scanning project for env usage...').start();

	async function runScanAndWrite() {
		// spinner.text = "Scanning project for env usage...";
		try {
			const envMap = await scanProject(directoryToScan, ignorePatterns);
			spinner.clear();
			spinner
				.succeed(
					`Found ${
						Array.from(envMap.keys()).filter(
							(k) => k !== '<DYNAMIC_KEY>',
						).length
					} env keys`,
				)
				.stop();
			const content = renderFile(envMap, targetFormat as Format);
			await writeFile(finalPath as string, content, requestToMerge);
			if (outputFileExists && requestToMerge) {
				// * control how much change we have
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
		// sigint
		await runScanAndWrite();
	}

	process.on('SIGINT', async () => {
		spinner.stop(); // stop the spinner so it doesnt block terminal
		await watcher.close(); // close chokidar watcher
		// console.log("\n👋 Exiting gracefully...");
		process.exit(0); // exit cleanly
	});
}

main();
