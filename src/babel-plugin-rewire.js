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
						replaceWith(path.parentPath, t.callExpression(rewireInformation.getUpdateOperationID(), [t.stringLiteral(parent.operator), t.stringLiteral(variableName), t.booleanLiteral(parent.prefix)]));
					} else {
						rewireInformation.ensureAccessor(variableName, isWildCardImport);
						replaceWith(path, t.callExpression(rewireInformation.getUniversalGetterID(), [t.stringLiteral(variableName)]));
					}
				} else if(parent.type === 'AssignmentExpression' && parent.left == node) {
					rewireInformation.addUpdateableVariable(variableName);

					if(parent.operator === '=') {
						replaceWith(path.parentPath, noRewire(t.callExpression(rewireInformation.getAssignmentOperationID(), [t.stringLiteral(variableName), parent.right])));
					} else {
						let baseOperator = parent.operator.substring(0, parent.operator.length - 1);
						replaceWith(path.parentPath, t.assignmentExpression('=', parent.left, t.binaryExpression(baseOperator, t.callExpression(rewireInformation.getUniversalGetterID(), [t.stringLiteral(variableName)]), parent.right)));
					}
					//TODO variable bindings add accessor for each variable declaration even if its unused. The reason is that any other plugin could potentially change the code otherwise
				}

				if(variableBinding.identifier === node) {
					rewireInformation.addTrackedIdentifier(variableName, isWildCardImport);
				}
			}
		},

		'ExportNamedDeclaration|ExportAllDeclaration': function ({node: {specifiers = []}}, rewireInformation) {
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
							replaceWith(path,
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
							replaceWith(path,
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
					replaceWithMultiple(path, [
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
				replaceWith(path, t.callExpression(rewireInformation.getUniversalGetterID(), [t.stringLiteral(variableName)]));
			}
		}
	};

	const ProgramVisitor = {
		Program: {
			enter: function (path, state) {
				if (!wasProcessed(path)) {
					let rewireState = new RewireState(path.scope, t, template);
					rewireState.setIgnoredIdentifiers(state.opts.ignoredIdentifiers);
					if (state.opts.syncInternalStateWithExports === false) {
						rewireState.syncInternalStateWithExports = false;
					}

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

						registerDeclarations(path.pushContainer("body", rewireState.nodesToAppendToProgramBody));
					}
				}
			}
		}
	};

	return {
		visitor: ProgramVisitor
	};
};

// Registers declarations return by calling path.replace or
// path.replaceWithMultiple in babel's scope tracker.
function registerDeclarations(path, declarations) {
	// path.replace, path.replaceWithMultiple and path.pushContainer should
	// return and array always. No idea why it is undefined sometimes :(
	if (declarations === undefined) { return; }
	declarations.forEach((declaration) => {
		path.scope.registerDeclaration(declaration);
	});
}

// The functions, replaceWith and replaceWithMultiple are meant
// to replace path.replaceWith and path.replaceWithMultiple for
// our uses. We need register new declaration to babel's scope
// tracker otherwise plugins like babel-plugin-transform-typescript
// throw warning stating DefaultExports, _set__, _get__ are not
// registred in babel scope tracker.
function replaceWith(path, node) {
	const declarations = path.replaceWith(node);
	registerDeclarations(path, declarations);
	return declarations;
}

function replaceWithMultiple(path, nodes) {
	const declarations = path.replaceWithMultiple(nodes);
	registerDeclarations(path, declarations);
	return declarations;
}
