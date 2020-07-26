/**
 * This module depends on modula 'b', and module 'a' indirectly.
 */

import { b } from './b';

export function main() {
    return b() + '-main';
}
