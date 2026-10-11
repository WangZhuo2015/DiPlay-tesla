import test from 'node:test';
import assert from 'node:assert/strict';
import {displayPreset} from '../src/main/assets/tesla/display-presets.js';

test('right and full window presets follow actual viewport aspect ratio',()=>{
  assert.deepEqual(displayPreset('fit',1024,768),{width:1024,height:768,fps:20,jpegQuality:80});
  assert.deepEqual(displayPreset('light',1920,1080),{width:1280,height:720,fps:15,jpegQuality:70});
  assert.deepEqual(displayPreset('clear',1024,768),{width:1440,height:1080,fps:20,jpegQuality:85});
  assert.deepEqual(displayPreset('clear',1600,900),{width:1920,height:1080,fps:20,jpegQuality:85});
});
test('2K preserves right and full viewport shapes within 2560 by 1440',()=>{
  assert.deepEqual(displayPreset('qhd',1920,1080),{width:2560,height:1440,fps:20,jpegQuality:85});
  assert.deepEqual(displayPreset('qhd',1024,768),{width:1920,height:1440,fps:20,jpegQuality:85});
  assert.deepEqual(displayPreset('qhd',1280,1440),{width:1280,height:1440,fps:20,jpegQuality:85});
  assert.deepEqual(displayPreset('qhd',2560,1200),{width:2560,height:1200,fps:20,jpegQuality:85});
});
test('density, wide, tall and odd viewports stay within negotiated bounds',()=>{
  for(const [w,h,d] of [[1280,720,2],[2560,1440,1],[2200,1300,1.5],[701,899,3],[3840,1080,2],[360,740,1]]) {
    for(const kind of ['fit','light','clear','qhd']) {
      const size=displayPreset(kind,w,h,d);
      if(size===null){assert.ok(w/h<320/1080);continue;}
      assert.ok(size.width>=320 && size.width<=(kind==='qhd'?2560:1920) && size.height>=240 && size.height<=(kind==='qhd'?1440:1080));
      assert.equal(size.width%2,0); assert.equal(size.height%2,0);
      assert.ok(Math.abs(size.width/size.height-w/h)<.01);
    }
  }
  assert.equal(displayPreset('fit',1280,720,2).width,1920);
});
test('unusable viewport and unsupported presets cannot produce an invalid profile',()=>{
  for(const args of [['fit',0,720],['fit',NaN,720],['fit',1920,Infinity],['fit',320,240,0],['fit',300,200],['bad',1920,1080]])assert.equal(displayPreset(...args),null);
});
