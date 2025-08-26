// configuration file functions
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DEFAULT_IGNORE } from './constants';
import type { SpotenvConfig } from './types';

// default configuration
const defaultConfig: SpotenvConfig = {
	dir: process.cwd(),
	out: '.env.example',
	watch: false,
	merge: false,
	ignore: DEFAULT_IGNORE,
};

// function to find the nearest project root by looking for package.json
function findProjectRoot(startDir: string): string | null {
	let currentDir = resolve(startDir);
	const markerFile = 'package.json';

	while (currentDir !== dirname(currentDir)) {
		const markerPath = join(currentDir, markerFile);
		if (existsSync(markerPath)) {
			return currentDir;
		}
		currentDir = dirname(currentDir);
	}

	return null;
}

// function to find the config file
function findConfigFile(startDir: string = process.cwd()): string | undefined {
	const root = findProjectRoot(startDir) ?? resolve(startDir);
	let dir = resolve(startDir);

	while (true) {
		const path = join(dir, '.spotenv.json');
		if (existsSync(path)) return path;
		if (dir === root || dir === dirname(dir)) break;
		dir = dirname(dir);
	}

	// check root
	const possibleRootPath = join(root, '.spotenv.json');
	if (existsSync(possibleRootPath)) return possibleRootPath;

	return undefined;
}

/*function createConfigFile(startDir: string = process.cwd()): string | undefined {
    // default configuration
    const defaultConfig: SpotenvConfig = {
        dir: findProjectRoot(process.cwd()),
        out: '.env.example',
        watch: false,
        merge: false,
        ignore: DEFAULT_IGNORE,
    }
    let configDir = findProjectRoot(startDir);
    if (configDir === null) {
        console.error('No project root found. Please run in a valid project directory.');
        process.exit(1);
    }
    let spotenvConfigFile = join(configDir, '.spotenv.json');

    if (existsSync(spotenvConfigFile)) {
        console.warn(`${spotenvConfigFile} already exists. Skipping creation.`);
        return;
    }

    const configContent = JSON.stringify(defaultConfig, null, 2);
    try {
        writeFileSync(spotenvConfigFile, configContent);
        console.log(`Created ${spotenvConfigFile}`);
        return spotenvConfigFile
    } catch (error) {
        console.error(`Error creating ${spotenvConfigFile}:`, error);
        process.exit(1);
    }
}*/

// function to load the configuration file if it exists
export function loadSpotenvConfig(startDir: string = process.cwd()): {
	path?: string;
	config?: SpotenvConfig;
} {
	const path = findConfigFile(startDir);
	if (!path) return { path: undefined, config: defaultConfig };

	try {
		const data = readFileSync(path, 'utf-8');
		const parsedData = JSON.parse(data) as SpotenvConfig;
		return { path, config: { ...defaultConfig, ...parsedData } };
	} catch (error) {
		console.error(`Error reading configuration file ${path}:`, error);
		return { path, config: defaultConfig };
	}
}

// merge CLI options with config but CLI takes precedence
export function mergeConfigWithCliOptions(
	config: SpotenvConfig | undefined,
	cliOptions: Record<string, any>,
): SpotenvConfig {
	const currentConfig = config ?? defaultConfig;
	return {
		...currentConfig,
		...cliOptions,
		ignore: cliOptions.ignore ?? currentConfig.ignore ?? DEFAULT_IGNORE,
	};
}
