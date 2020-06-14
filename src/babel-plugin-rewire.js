/*Copyright (c) 2015, Robert Binna <r.binna@synedra.com>

 Permission to use, copy, modify, and/or distribute this software for any
 purpose with or without fee is hereby granted, provided that the above
 copyright notice and this permission notice appear in all copies.

 THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.*/

import RewireState from './RewireState.js';
import { wasProcessed, noRewire, contains } from './RewireHelpers.js';

module.exports = function({ types: t, template }) {
	function isRewireable(path, variableBinding) {
		let { node, parent } = path;

		return (variableBinding.referencePaths !== null) &&
		!(parent.type === 'VariableDeclarator' && parent.id == node) &&
		!(parent.type === 'ForInStatement' && parent.left == node) &&
		!(parent.type === 'FunctionExpression' && parent.id === node) &&
		!(parent.type === 'MemberExpression' && parent.property === node) &&
		!(parent.type === 'ObjectProperty' && parent.key === node) &&
		!(parent.type === 'RestProperty') &&
		!(parent.type === 'ObjectMethod' && parent.key === node) &&
		!(parent.type === 'ObjectProperty' && path.parentPath && path.parentPath.parent && path.parentPath.parent.type === 'ObjectPattern') &&
		!(parent.type === 'ExportSpecifier') &&
		!(parent.type === 'ImportSpecifier') &&
		!(parent.type === 'ObjectTypeProperty') &&
		!(parent.type === 'ClassMethod') &&
		!(parent.type === 'TSDeclareFunction') &&
		!(parent.type === 'TSExpressionWithTypeArguments') &&
		!(parent.type === 'TSQualifiedName') &&
		!(parent.type === 'TSTypeQuery') &&
		!(parent.type === 'TSTypeReference') &&
		!(parent.type === 'TSInterfaceDeclaration') &&
		!(parent.type === 'TSTypeAliasDeclaration');
	}

	function doesIdentifierRepresentAValidReference(path, variableBinding, rewireInformation) {
		let isIgnoredVariable = rewireInformation.ignoredIdentifiers.indexOf(path.node.name) !== -1;
		return (!isIgnoredVariable) && (variableBinding !== undefined) && !wasProcessed(path) && (variableBinding.scope.block.type === 'Program');
	}

	function getVariableNameAndBinding(path) {
		let { node, parent, scope } = path;
		let variableName = node.name;
		let variableBinding = (!t.isFlow || (!t.isFlow(node) && !t.isFlow(parent))) ? scope.getBinding(variableName) : undefined;

		return {
			variableName,
			variableBinding
		};
	}

	const BodyVisitor = {
		Identifier: function (path, rewireInformation) {
			let { node, parent, scope } = path;
			let { variableName, variableBinding } = getVariableNameAndBinding(path);

			//Matches for body
			if (doesIdentifierRepresentAValidReference(path, variableBinding, rewireInformation)) {
				let isWildCardImport = (variableBinding.path.type === 'ImportNamespaceSpecifier');
				if(isRewireable(path, variableBinding) && contains(variableBinding.referencePaths, path)) {
					if (parent.type === 'UpdateExpression') {
						rewireInformation.addUpdateableVariable(variableName);
						path.parentPath.replaceWith(t.callExpression(rewireInformation.getUpdateOperationID(), [t.stringLiteral(parent.operator), t.stringLiteral(variableName), t.booleanLiteral(parent.prefix)]));
					} else {
						rewireInformation.ensureAccessor(variableName, isWildCardImport);
						path.replaceWith(t.callExpression(rewireInformation.getUniversalGetterID(), [t.stringLiteral(variableName)]));
					}
				} else if(parent.type === 'AssignmentExpression' && parent.left == node) {
					rewireInformation.addUpdateableVariable(variableName);

					if(parent.operator === '=') {
						path.parentPath.replaceWith(noRewire(t.callExpression(rewireInformation.getAssignmentOperationID(), [t.stringLiteral(variableName), parent.right])));
					} else {
						let baseOperator = parent.operator.substring(0, parent.operator.length - 1);
						path.parentPath.replaceWith(t.assignmentExpression('=', parent.left, t.binaryExpression(baseOperator, t.callExpression(rewireInformation.getUniversalGetterID(), [t.stringLiteral(variableName)]), parent.right)));
					}
					//TODO variable bindings add accessor for each variable declaration even if its unused. The reason is that any other plugin could potentially change the code otherwise
				}

				if(variableBinding.identifier === node) {
					rewireInformation.addTrackedIdentifier(variableName, isWildCardImport);
				}
			}
		},

		'ExportNamedDeclaration|ExportAllDeclaration': function (path, rewireInformation) {
			const {node: {specifiers = []}} = path;

			// We only add ExportNamedDeclaration's variable names here
			// because ExportAllDeclaration is: "export * from ..."
			if (path.isExportNamedDeclaration()) {
				path.traverse({
					Identifier(path) {
						addExportsToRewireInformation(path, t, rewireInformation);
					}
				});
			}

			let hasDefaultExport = specifiers.some(function (specifier) {
				return ((specifier.local && specifier.local.name === 'default') ||
				(specifier.exported && specifier.exported.name === 'default'));
			});
			rewireInformation.hasES6DefaultExport = rewireInformation.hasES6DefaultExport || hasDefaultExport;
			rewireInformation.isES6Module = true;
		},

		AssignmentExpression: function ({node: assignmentExpression, scope: {block: {type: blockType}}}, rewireInformation) {
			rewireInformation.hasCommonJSExport = blockType === 'Program' && !!assignmentExpression.left.object && assignmentExpression.left.object.name === 'module' && !!assignmentExpression.left.property && assignmentExpression.left.property.name === 'exports';
		},

		ExportDefaultDeclaration: function (path, rewireInformation) {
			if (!wasProcessed(path)) {
				let exportIdentifier = null;
				rewireInformation.hasES6DefaultExport = true;
				rewireInformation.hasES6Export = true;
				rewireInformation.isES6Module = true;

				let declarationVisitors = {
					ClassDeclaration: function (path, rewireInformation) {
						let {node: existingClassDeclaration, parent, scope} = path;
						if (existingClassDeclaration.id === null && parent.type === 'ExportDefaultDeclaration') {
							exportIdentifier = scope.generateUidIdentifier("DefaultExportValue");
							path.replaceWith(
								t.classDeclaration(
									exportIdentifier,
									existingClassDeclaration.superClass,
									existingClassDeclaration.body,
									existingClassDeclaration.decorators || []
								)
							);
						} else {
							exportIdentifier = existingClassDeclaration.id;
						}
					},
					FunctionDeclaration: function (path, rewireInformation) {
						let {node: existingFunctionDeclaration, scope} = path;
						if (existingFunctionDeclaration.id === null && path.parent.type === 'ExportDefaultDeclaration') {
							exportIdentifier = scope.generateUidIdentifier("DefaultExportValue");
							path.replaceWith(
								t.functionDeclaration(
									exportIdentifier,
									existingFunctionDeclaration.params,
									existingFunctionDeclaration.body,
									existingFunctionDeclaration.generator,
									existingFunctionDeclaration.async
								)
							);
						} else if(path.parent.type === 'ExportDefaultDeclaration') {
							exportIdentifier = existingFunctionDeclaration.id;
						}
					},
					Identifier: function ({parent: {type: parentType}, node: identifier}, rewireInformation) {
						if (parentType === 'ExportDefaultDeclaration') {
							exportIdentifier = identifier;
						}
					}
				};

				path.traverse(declarationVisitors, rewireInformation);
				if (exportIdentifier === null) {
					exportIdentifier = noRewire(path.scope.generateUidIdentifier("DefaultExportValue"));
					path.replaceWithMultiple([
						t.variableDeclaration('let', [t.variableDeclarator(exportIdentifier, path.node.declaration)]),
						noRewire(t.exportDefaultDeclaration(exportIdentifier))
					]);
				}
				rewireInformation.enrichExport(exportIdentifier);
			}
		},

		ImportDeclaration: function (path, rewireInformation) {
			rewireInformation.isES6Module = true;
		}
	};

	const BodySecondPassVisitor = {
		Identifier: function (path, rewireInformation) {
			let { node, parent } = path;
			let { variableName, variableBinding } = getVariableNameAndBinding(path);

			//Matches for body
			if (doesIdentifierRepresentAValidReference(path, variableBinding, rewireInformation) &&
				isRewireable(path, variableBinding) &&
				rewireInformation.hasTrackedIdentifier(variableName) &&
				(variableBinding.identifier !== node) &&
				(parent.type !== 'UpdateExpression')
			) {
				let isWildCardImport = (variableBinding.path.type === 'ImportNamespaceSpecifier');
				rewireInformation.ensureAccessor(variableName, isWildCardImport);
				path.replaceWith(t.callExpression(rewireInformation.getUniversalGetterID(), [t.stringLiteral(variableName)]));
			}
		}
	};

	const ProgramVisitor = {
		Program: {
			enter: function (path, state) {
				if (!wasProcessed(path)) {
					let rewireState = new RewireState(path.scope, t, template);
					rewireState.setIgnoredIdentifiers(state.opts.ignoredIdentifiers);

					path.traverse(BodyVisitor, rewireState);

					state.rewireState = rewireState;
				}
			},
			exit: function(path, state) {
				if (!wasProcessed(path)) {
					let {scope, node: program} = path;
					let rewireState = state.rewireState;
					path.traverse(BodySecondPassVisitor, rewireState);
					if (rewireState.containsDependenciesToRewire()) {
						rewireState.prependUniversalAccessors(scope);
						rewireState.appendExports();

						path.pushContainer("body", rewireState.nodesToAppendToProgramBody);
					}
				}
			}
		}
	};

	return {
		visitor: ProgramVisitor
	};
};

// This function is for every identifier in ExportNamedDeclaration.
// Since the Delecaration field of ExportNamedFunction is very broad,
// this is the easier way to do it. There are three possibilites
// of the declaration field:
//  - FunctionDeclaration: export function a() {}
//  - ClassDeclaration: export class A {}
//  - VariableDeclaratiion: export let a = .., b = ...;
// (There are other possibilites but they are not possible
//  i.e. TSInterfaceDeclaration.)
// We also handle ExportsSepcifier here too.
function addExportsToRewireInformation(path, t, rewireInformation) {
	const { parent, node } = path;
	if (t.isExportSpecifier(parent) && parent.exported.name !== node.name) {
		// We need the exported.name not local.name for
		// export { something as somethigElse } ...
		// Here, local.name will be something, whereas the exported name
		// will be somethingElse which we are after
		return;
	}

	// Although, ast nodes should have null instead of undefined
	// some nodes have undefined. This is mostly for id fields that
	// that could be null. But we use is where needed because it
	// takes up less space in conditional.
	function isDefined(node) {
		return (node !== undefined && node !== null);
	}

	const isVariableDeclaratorWithInit =
		t.isVariableDeclarator(parent) && isDefined(parent.init);
	if (isVariableDeclaratorWithInit && parent.init.name === node.name) {
		// If the idenitifer we are adding is variable declarator's identifier
		// don't add it. For example: exports const { a, b } = something;
		// we don't want to add the something
		return;
	}

	// getFunctionParent includes FunctionDeclaration and
	// FunctionExpression.
	const functionParent = path.getFunctionParent();
	if (isDefined(functionParent)) {
		// If functionParent.node.id is null that means it's
		// a arrow or anonmyous function which shows up in expressions
		if (!isDefined(functionParent.node.id)) {
			return;
		}

		// If there is a function parent to this path, that means
		// we are traversing over identifiers of a function. They
		// are defienatly not exported so ignore them.
		if (functionParent.node.id.name != node.name) {
			return;
		}
	}

	const classParent = path.find(p => p.isClassDeclaration() || p.isClassExpression());
	if (isDefined(classParent) && isDefined(classParent.node.id) &&
		classParent.node.id.name !== node.name) {
		// Same as function conditional above; do not add indentifiers
		// inside a class.
		return;
	}

	// Finally, if parent of the function or a class is a variable declartor
	// the we only want it's id identifier and not is init identifiers.
	// init is field that holds the right side of the assignment.
	if (isDefined(classParent) || isDefined(functionParent)) {
		const declarator = path.find(p => p.isVariableDeclarator());
		if (isDefined(declarator)) {
			const init = declarator.node.init;
			const functionNode = (functionParent || {}).node;
			const classNode = (classParent || {}).node;
			if (init === functionNode || init === classNode) {
				return;
			}
		}
	}

	let localIdentifier = node.name;
	if (t.isExportSpecifier(parent)) {
		localIdentifier = parent.local.name;
	}

	rewireInformation.addExportedIdentifier(node.name, localIdentifier);
}
