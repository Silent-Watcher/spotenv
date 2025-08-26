// types for the configuration file

export interface SpotenvConfig {
	dir?: string | null;
	out?: string;
	watch?: boolean;
	merge?: boolean;
	ignore?: string[];
}
