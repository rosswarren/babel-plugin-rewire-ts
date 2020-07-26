/**
 * This module depends on modula 'a'. More precisely, the function
 * b() that is exported dependends on a() from module 'a'.
 */

import { a } from './a';

export function b() {
    return a() + '-b';
}
