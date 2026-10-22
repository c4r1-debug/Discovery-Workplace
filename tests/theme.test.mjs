import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {THEME_BOOTSTRAP,THEME_STORAGE_KEY} from '../lib/theme.mjs';

test('theme bootstrap restores only a valid saved light theme and tolerates unavailable storage',()=>{
 for(const saved of ['light','dark',null,'invalid']){
  const root={dataset:{theme:'dark'},lang:'en'};
  runInNewContext(THEME_BOOTSTRAP,{document:{documentElement:root},localStorage:{getItem(key){assert.equal(key,THEME_STORAGE_KEY);return saved;}}});
  assert.deepEqual(root,{dataset:{theme:saved==='light'?'light':'dark'},lang:'en'});
 }
 const root={dataset:{theme:'dark'},lang:'en'};
 assert.doesNotThrow(()=>runInNewContext(THEME_BOOTSTRAP,{document:{documentElement:root},localStorage:{getItem(){throw new Error('Storage denied');}}}));
 assert.deepEqual(root,{dataset:{theme:'dark'},lang:'en'});
 assert.doesNotThrow(()=>runInNewContext(THEME_BOOTSTRAP,{document:{documentElement:root}}));
});
