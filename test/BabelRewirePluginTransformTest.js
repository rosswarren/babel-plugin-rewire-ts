var babel = require('babel-core');
var path = require('path');
var fs = require('fs');
var os = require('os');
var expect = require('expect.js');
var babelPluginRewire = require('../lib/babel-plugin-rewire.js'); //  */ require('../test-helpers/getBabelPluginRewire.js');

// To run a single test do:
//   npx mocha test --test <test-one>,<test-2>
// or (if you do not have npx):
//   ./node_modules/.bin/mocha test --test <test-one>,<test-2>
const yargs = require('yargs');
const { argv } = yargs
	.help(true)
	.option('test',  {
		alias: 't',
		type: 'string',
		describe: 'Run a specific tests (seperate multiple tests by comma).',
	})
	.option('fix', {
		alias: 'f',
		type: 'boolean',
		describe: 'Fix failing translation tests by writing correct translation.'
	})

var featuresToTest = [
	'babelissue1315',
	'issue16',
	'forOf',
	'commonJSExportOnly',
	'defaultImport',
	'defaultExport',
	'defaultExportImport',
	'defaultExportWithClass',
	'defaultExportWithNamedFunction',
	'defaultExportWithObject',
	'issuePathReplaceWith',
	'importWithReactClass',
	'jsxSupport',
	'jsxWithComponentImport',
	'moduleExports',
	'multipleImports',
	'multipleImportsWithAliases',
	'namedFunctionExport',
	'namedFunctionImport',
	'namedVariableExport',
	'noDefaultExport',
	'passThrough',
	'primitiveExportWithNamedFunctionExport',
	'wildcardImport',
	'wildcardExport',
	'namedWildcardExport',
	'recursiveRewireCall',
	'requireExports',
	'requireMultiExports',
	'switch',
	'topLevelVar',
	'functionRewireScope',
	'issue69',
	'issue71-tdz',
	'issue71-tdz-index',
	'flowTypeExport',
	'flowTypeImport',
	'updateOperations',
	'assignmentOperations',
	'rewiringOfReactComponents',
	'rewiringOfSimpleFunctionalComponents',
	'issue121',
	'issue133',
	'issue136',
	'issue152',
	'issue155',
	'issue184'
];

var stage0FeaturesToTests = [
	'issue164'
];

var ignoredIdentifiers = [
	'ignoredIdentifiers'
];

const allTests = [...featuresToTest, ...stage0FeaturesToTests, ...ignoredIdentifiers];
if (argv.test !== undefined) {
	const tests = argv.test.split(',');
	tests.forEach(test => {
		if (!allTests.includes(test)) {
			console.error(`${test} is not a valid test.`);
			process.exit(1);
		};
	});

	// Instead of adding a if statement couple of time below
	// just simply remove every other test from respective test arrays
	const check = (test) => tests.includes(test);
	featuresToTest = featuresToTest.filter(check);
	stage0FeaturesToTests = stage0FeaturesToTests.filter(check);
	ignoredIdentifiers = ignoredIdentifiers.filter(check);
}

describe('BabelRewirePluginTest', function() {
	var babelTranslationOptions = {
		"presets": ["react"],
		"plugins": [
			babelPluginRewire,
			"syntax-async-functions",
			"syntax-flow",
			"transform-export-extensions"
		]
	};

	var babelTranslationOptionsIgnoredIdentifiers = {
		"presets": ["react"],
		"plugins": [
			[babelPluginRewire, {
				ignoredIdentifiers: ['ignoredIdentifier1', 'ignoredIdentifier2']
			}],
			"syntax-async-functions",
			"syntax-flow",
			"transform-export-extensions"
		]
	};

	var babelTranslationOptionsAllEnabled = {
		"presets": ["es2015", "react"], //,
		"plugins": [
			babelPluginRewire,
			"syntax-async-functions",
			"transform-runtime",
			"transform-es2015-block-scoping",
			"transform-es2015-template-literals",
			"transform-es2015-typeof-symbol",
			"transform-export-extensions",
			"transform-regenerator"
		]
	};

	function testTranslation(testName, options) {
		var directory = path.resolve(__dirname, '..', 'fixtures', 'transformation', testName);

		var input = fs.readFileSync(path.resolve(directory, 'input.js'), 'utf-8');
		var expected = fs.readFileSync(path.resolve(directory, 'expected.js'), 'utf-8');

		// For non-windows system such as Linux, the test fails because
		// expected has \r\n, windows line ending, while the output has
		// just \n. To fix this just replace \r\n with os.EOL.
		expected = expected.replace(/(\r)?\n/gm, os.EOL).trim();

		try {
			// Although the transformation output has os.EOL in it's
			// output, the comments still have /r/n. So we replace /r/n
			// with os.EOL here as well.
			var transformationOutput = babel.transform(input, options).code;
			transformationOutput = transformationOutput.replace(/(\r)?\n/gm, os.EOL).trim();
		} catch(error) {
			expect().fail("Transformation failed: \n" + error.stack)
		}

		var tempDir = path.resolve(os.tmpdir(), 'babel-plugin-rewire');
		try {
			fs.mkdirSync(tempDir);
		} catch(error) {}

		fs.writeFileSync(tempDir + '/testexpected' + testName + '.js', transformationOutput, 'utf-8');

		if (argv.fix === true) {
			fs.writeFileSync(path.resolve(directory, 'expected.js'), transformationOutput, 'utf-8');
		}

		if (expected.trim() != transformationOutput.trim()) {
			console.log(transformationOutput);
		}

		expect(transformationOutput.trim()).to.be(expected.trim());
	}

	function testSuccessfulTranslation(testName, additionalOptions) {
		var directory = path.resolve(__dirname, '..', 'fixtures', 'transformation', testName);
		var input = fs.readFileSync(path.resolve(directory, 'input.js'), 'utf-8');

		var transformationResult = babel.transform(input, combineOptions(babelTranslationOptionsAllEnabled, additionalOptions));
	}

	function testIgnoredIdentifiersTranslation(testName) {
		var directory = path.resolve(__dirname, '..', 'fixtures', 'transformation', testName);
		var input = fs.readFileSync(path.resolve(directory, 'input.js'), 'utf-8');

		var transformationResult = babel.transform(input, babelTranslationOptionsAllEnabledIgnoredIdentifiers);
	}

	function combineOptions(baseOptions, additionalOptions) {
		var additionalPresets = (additionalOptions && additionalOptions.presets) || [];
		var additionalPlugins = (additionalOptions && additionalOptions.plugins) || [];

		return {
			presets: baseOptions.presets.concat(additionalPresets),
			plugins: baseOptions.plugins.concat(additionalPlugins)
		};
	}

	featuresToTest.forEach(function(feature) {
		it('test babel-plugin-rewire for ' + feature, testTranslation.bind(null, feature, babelTranslationOptions));
	});

	featuresToTest.forEach(function(feature) {
		it('test translation babel-plugin-rewire with ignored identifiers for ' + feature, testTranslation.bind(null, feature, babelTranslationOptions));
	});

	ignoredIdentifiers.forEach(function(feature) {
		it('test translation babel-plugin-rewire with ignored identifiers for ' + feature, testTranslation.bind(null, feature, babelTranslationOptionsIgnoredIdentifiers));
	});

	featuresToTest.forEach(function(feature) {
		it('test successful translation babel-plugin-rewire for ' + feature, testSuccessfulTranslation.bind(null, feature, {}));
	});

	stage0FeaturesToTests.forEach(function(feature) {
		var additionalOptions = {
			presets: ['stage-0'],
		};

		it('test successful translation babel-plugin-rewire for ' + feature, testSuccessfulTranslation.bind(null, feature, combineOptions(babelTranslationOptions, additionalOptions)));
		it('test translation babel-plugin-rewire for ' + feature, testSuccessfulTranslation.bind(null, feature, additionalOptions));
	});
});
