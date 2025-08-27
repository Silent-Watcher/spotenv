import type { ParseResult } from '@babel/parser';
import _traverse from '@babel/traverse';

//@ts-ignore
const traverse = _traverse.default;

import * as t from '@babel/types';
import {
	looksSensitive,
	parseFileToAst,
	tryExtractDefaultFromParent,
} from './helpers';

export type KeyMeta = {
	key: string;
	files: Set<string>;
	isDynamic?: boolean;
	hasDefault?: boolean;
	defaultExample?: string | null; // store small defaults (non-sensitive)
};

export type EnvKeyMap = Map<string, KeyMeta>;

function addMeta(map: EnvKeyMap, key: string, file: string) {
	let m = map.get(key);
	if (!m) {
		m = {
			key,
			files: new Set(),
			isDynamic: false,
			hasDefault: false,
			defaultExample: null,
		};
		map.set(key, m);
	}
	m.files.add(file);
}

export function extractFromCode(
	sourceCode: string,
	filename: string,
	envKeyMap: EnvKeyMap,
) {
	let ast: ParseResult | undefined; // abstract syntax tree
	try {
		ast = parseFileToAst(sourceCode);
	} catch (error) {
		console.error(`Error parsing file to AST ${filename}:`, error);
		return;
	}

	try {
		traverse(ast, {
			MemberExpression(path: { node: any }) {
				const node = path.node;
				// process.env.X  OR process.env['X'] OR process.env[X]
				if (
					t.isMemberExpression(node.object) &&
					t.isIdentifier(node.object.object) &&
					node.object.object.name === 'process' &&
					t.isIdentifier(node.object.property) &&
					node.object.property.name === 'env'
				) {
					// property could be Identifier or StringLiteral (computed)
					if (!node.computed && t.isIdentifier(node.property)) {
						addMeta(envKeyMap, node.property.name, filename);
						const def = tryExtractDefaultFromParent(path);
						if (def) {
							const meta = envKeyMap.get(node.property.name)!;
							meta.hasDefault = true;
							if (!looksSensitive(node.property.name)) {
								meta.defaultExample = def;
							}
						}
					} else if (
						node.computed &&
						t.isStringLiteral(node.property)
					) {
						addMeta(envKeyMap, node.property.value, filename);
						const def = tryExtractDefaultFromParent(path);
						if (def) {
							const meta = envKeyMap.get(node.property.value)!;
							meta.hasDefault = true;
							if (!looksSensitive(node.property.value)) {
								meta.defaultExample = def;
							}
						}
					} else {
						// dynamic access: process.env[someVar]
						addMeta(envKeyMap, '<DYNAMIC_KEY>', filename);
						envKeyMap.get('<DYNAMIC_KEY>')!.isDynamic = true;
					}
				}

				// import.meta.env.FOO
				if (
					t.isMemberExpression(node.object) &&
					t.isMemberExpression(node.object.object) &&
					t.isMetaProperty(node.object.object.object) &&
					(node.object.property as any).name === 'env' &&
					(node.object.object as any).meta?.name === 'import'
				) {
					// node.property could be Identifier or computed
					if (!node.computed && t.isIdentifier(node.property)) {
						addMeta(envKeyMap, node.property.name, filename);
					} else if (
						node.computed &&
						t.isStringLiteral(node.property)
					) {
						addMeta(envKeyMap, node.property.value, filename);
					} else {
						addMeta(envKeyMap, '<DYNAMIC_KEY>', filename);
						envKeyMap.get('<DYNAMIC_KEY>')!.isDynamic = true;
					}
				}
			},

			VariableDeclarator(path: { node: any }) {
				// const { PORT, DB = 'sqlite' } = process.env
				const { node } = path;
				if (
					node.init &&
					t.isMemberExpression(node.init) &&
					t.isIdentifier(node.init.object) &&
					node.init.object.name === 'process' &&
					t.isIdentifier(node.init.property) &&
					node.init.property.name === 'env' &&
					t.isObjectPattern(node.id)
				) {
					for (const prop of node.id.properties) {
						if (t.isObjectProperty(prop)) {
							// key can be Identifier
							let keyName: string | null = null;
							if (t.isIdentifier(prop.key)) {
								keyName = prop.key.name;
							}
							if (keyName) {
								addMeta(envKeyMap, keyName, filename);
								// default via AssignmentPattern?
								if (
									t.isAssignmentPattern(prop.value) &&
									t.isLiteral(prop.value.right)
								) {
									const lit = prop.value.right;
									const meta = envKeyMap.get(keyName)!;
									meta.hasDefault = true;
									if (!looksSensitive(keyName)) {
										meta.defaultExample = String(
											(lit as any).value,
										);
									}
								}
							}
						}
					}
				}
			},
		});
	} catch (error) {
		console.error(error);
	}

	return envKeyMap;
}
