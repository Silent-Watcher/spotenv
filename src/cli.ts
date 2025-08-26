#!/usr/bin/env node

import { resolve } from 'node:path';
import chalk from 'chalk';
import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import ora from 'ora';
import { DEFAULT_IGNORE } from './utils/constants';
import {
	acquireFormat,
	doesEnvExampleFileExists,
	makeExampleFilenameHandler,
} from './utils/helpers';
import { initialProgram } from './utils/program';
import { renderFile, writeFile } from './utils/render';
import { scanProject } from './utils/scan';
import type { Format } from './utils/types';

async function main() {
	let watcher: FSWatcher;
	const program = initialProgram();

	const options = program.opts();
	const directoryToScan: string = resolve(options.dir);
	const filename: string = options?.out;
	const requestToMerge: boolean = options.merge;
	const watchMode: boolean = options.watch;
	const ignorePatterns = Array.isArray(options.ignore)
		? options.ignore
		: DEFAULT_IGNORE;
	const targetFormat: Format = acquireFormat(options?.format);
	const fullFilename = makeExampleFilenameHandler[targetFormat](filename);
	const path = resolve(fullFilename);

	if (requestToMerge) {
		console.log(
			chalk.yellowBright(
				`requested to merge with existing ${fullFilename} file...`,
			),
		);
	}

	const envExampleFileExists = doesEnvExampleFileExists(path);

	if (envExampleFileExists.result) {
		console.log(
			chalk.gray(
				`${fullFilename} file detected at ${envExampleFileExists.at}!`,
			),
		);
	} else {
		console.log(
			chalk.gray(
				`${fullFilename} file not found at ${envExampleFileExists.at}!`,
			),
		);
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
			const content = renderFile(envMap, targetFormat);
			await writeFile(path, content, requestToMerge);
			if (envExampleFileExists.result && requestToMerge) {
				// * control how much change we have
				console.log(chalk.green(`${fullFilename} updated`));
			} else {
				console.log(chalk.green(`${fullFilename} written to ${path}`));
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
