import { Command } from 'commander';
import { version } from '../../package.json';
import { loadSpotenvConfig, mergeConfigWithCliOptions } from './config';
import { DEFAULT_IGNORE } from './constants';

export function initialProgram(): Command {
	const program = new Command();

	// load the configuration file
	const { path, config: loadedConfig } = loadSpotenvConfig();
	const config = loadedConfig ?? {
		dir: process.cwd(),
		out: '.env.example',
		watch: false,
		merge: false,
		ignore: DEFAULT_IGNORE,
	};

	if (path) {
		console.log(`Using configuration file: ${path}`);
	}

	program
		.name('spotenv')
		.description(
			'Scan project for environment variable usage and generate .env.sample-filename',
		)
		.version(version)
		.showHelpAfterError()
		.requiredOption(
			'-d, --dir <dir>',
			'project directory to scan',
			config.dir ?? process.cwd(),
		)
		.option(
			'-o, --out <file>',
			'path for output file',
			config.out ?? '.env.example',
		)
		.option(
			'-w, --watch',
			'watch files and auto-regenerate',
			config.watch ?? false,
		)
		.option(
			'-m, --merge',
			'merge with existing .env.example (keep existing keys)',
			config.merge ?? false,
		)
		.option(
			'--ignore <patterns...>',
			'glob ignore patterns',
			config.ignore ?? DEFAULT_IGNORE,
		)
		.option(
			'-f, --format <extension>',
			'output format for environment variables (env, json, yml)',
			'env',
		)
		.parse(process.argv);

	// Merge cli options with config file
	const cliOptions = program.opts();
	const finalConfig = mergeConfigWithCliOptions(config, cliOptions);

	// update program options with finalConfig
	Object.assign(program.opts(), finalConfig);

	return program;
}
