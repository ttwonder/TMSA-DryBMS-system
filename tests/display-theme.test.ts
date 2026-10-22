import test from 'node:test';
import assert from 'node:assert/strict';
import {DISPLAY_THEMES,DISPLAY_THEME_KEY,normalizeDisplayTheme,loadDisplayTheme,persistDisplayTheme,applyDisplayTheme} from '../src/displayTheme.ts';

test('display preference accepts only the three explicit modes and defaults to normal',()=>{
 assert.deepEqual(DISPLAY_THEMES,['normal','dark','eye']);
 for(const value of DISPLAY_THEMES)assert.equal(normalizeDisplayTheme(value),value);
 for(const value of [null,undefined,'','DARK','system','other',{},42])assert.equal(normalizeDisplayTheme(value),'normal');
});
test('loading a display preference reads only its own key and survives blocked storage',()=>{
 const keys:string[]=[];
 assert.equal(loadDisplayTheme({getItem:key=>{keys.push(key);return 'eye';}}),'eye');
 assert.deepEqual(keys,[DISPLAY_THEME_KEY]);
 assert.equal(loadDisplayTheme({getItem:()=>null}),'normal');
 assert.equal(loadDisplayTheme({getItem:()=>{throw new Error('SecurityError');}}),'normal');
});
test('saving a display preference does not touch other browser data and tolerates quota failure',()=>{
 const values=new Map([['business-draft','do not touch'],['session','do not touch']]);
 assert.equal(persistDisplayTheme('dark',{setItem:(key,value)=>{values.set(key,value);}}),true);
 assert.deepEqual([...values],[['business-draft','do not touch'],['session','do not touch'],[DISPLAY_THEME_KEY,'dark']]);
 assert.equal(persistDisplayTheme('eye',{setItem:()=>{throw new Error('QuotaExceededError');}}),false);
});
test('applying a theme changes only the root presentation attribute',()=>{
 const root={dataset:{theme:'normal',workspace:'preserved'}};
 applyDisplayTheme('dark',root);assert.deepEqual(root.dataset,{theme:'dark',workspace:'preserved'});
 applyDisplayTheme('eye',root);assert.deepEqual(root.dataset,{theme:'eye',workspace:'preserved'});
 applyDisplayTheme('normal',root);assert.deepEqual(root.dataset,{theme:'normal',workspace:'preserved'});
});
