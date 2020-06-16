import { strict as assert } from 'assert';
import { a, __RewireAPI__ as ARewireAPI } from './src/a';
import { b, __RewireAPI__ as BRewireAPI } from './src/b';
import { main, __RewireAPI__ as MainRewireAPI } from './src/main';

describe('ExportsSyncsWithInternalState', () => {
    function ensureOriginalState() {
        assert.equal(a(), 'a');
        assert.equal(b(), 'a-b');
        assert.equal(main(), 'a-b-main');
    }

    it('should sync exports with internal state', () => {
        // Test that rewiring a on module a updates, both the
        // internal and exports state and it reflects across other
        // modules.
        ARewireAPI.__Rewire__('a', () => 'rewire-a');
        assert.equal(ARewireAPI.__get__('a')(), 'rewire-a');
        assert.equal(a(), 'rewire-a');
        assert.equal(b(), 'rewire-a-b')
        assert.equal(main(), 'rewire-a-b-main');
    });

    it('should restore the exports when calling __reset__', () => {
        // Reset should restore it to original state.
        ARewireAPI.__ResetDependency__('a');
        ensureOriginalState();

        // Also test that calling rewire more than once does
        // cause wrong restore value to be store in the Map.
        ARewireAPI.__Rewire__('a', () => 'rewire-1-a');
        ARewireAPI.__Rewire__('a', () => 'rewire-2-a');
        assert.equal(a(), 'rewire-2-a');
        assert.equal(b(), 'rewire-2-a-b');
        assert.equal(main(), 'rewire-2-a-b-main');

        ARewireAPI.__ResetDependency__('a');
        ensureOriginalState();
    });

    it('should restore all modules export state to original correctly', () => {
        ARewireAPI.__Rewire__('a', () => 'A');
        BRewireAPI.__Rewire__('b', () => 'B');
        MainRewireAPI.__Rewire__('main', () => 'MAIN');
        assert.equal(a(), 'A');
        assert.equal(b(), 'B');
        assert.equal(main(), 'MAIN');

        __rewire_reset_all__();
        ensureOriginalState();
    });
});

