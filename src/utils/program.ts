import { Command } from 'commander';
import { version } from '../../package.json';
import { DEFAULT_IGNORE } from './constants';

export function initialProgram(): Command {
	const program = new Command();
	program
		.name('spotenv')
		.description(
			'Scan project for environment variable usage and generate .env.sample-filename',
		)
		.version(version)
		.showHelpAfterError()
		.requiredOption('-d, --dir <dir>', 'project directory to scan')
		.option('-o, --out <file>', 'path for output file', 'sample-filename')
		.option('-w, --watch', 'watch files and auto-regenerate', false)
		.option(
			'-m, --merge',
			'merge with existing .env.example (keep existing keys)',
			false,
		)
		.option(
			'--ignore <patterns...>',
			'glob ignore patterns',
			DEFAULT_IGNORE,
		)
		.option(
			'-f, --format <extension>',
			'output format for environment variables (env, json, yml)',
			'env',
		)
		.parse(process.argv);

	return program;
}
