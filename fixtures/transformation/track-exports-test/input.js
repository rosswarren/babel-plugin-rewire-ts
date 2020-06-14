// Multiple variable declarators test case
export let a, b, c;
export let d = '';

let do_not_include = ':(';
export function e () {
    // To make sure rewire applies it's transformation
    // and to test his does't count as a export!
    do_not_include = ':((((';
}

// To test that identifiers inside the class
// do not count as identifier
let do_not_include_class = ':(';
export class f {
    constructor() {
        do_not_include_class = ':((((';
    }
}

// Export specifier's to test that we don't
// count local identifier as exported.
let g_local, h_local, i_local;
export { g_local as g, h_local as h };
export { i_local as i };

// Spread operator test. j and k should be
// recognized as exported.
const do_not_include_obj = {};
export const { j, ...k } = do_not_include_obj;

// Export all should be ignored
export * from '';
export * as l from '2';

export { m, n, o } from '2';
export { import1 as p, import2 as q, r } from 'd';

// This will test the function expression, and class expression
// case.
export const s = function do_not_include_func() {
    let do_not_include_2 = ':(';
}, t = function () {
    let do_not_include_3 = ':('
}, u = () => {
    let do_not_include_4 = ':(';
}, v = class DoNotIncludeClass {
    constructor() {
        let do_not_include_5 = ':(';
    }
}, w = class {
    constructor() {
        let do_not_include_6 = ':(';
    }
}
