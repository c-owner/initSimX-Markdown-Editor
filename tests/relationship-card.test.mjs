import test from 'node:test';
import assert from 'node:assert/strict';
import {initial, validate, cardHTML} from '../public/helper/relationship-card.js';
test('all relationship themes change the exported visual palette',()=>{
 const state=initial();
 const general=cardHTML(state);
 for (const theme of ['love','revenge','family']) { state.theme=theme; const html=cardHTML(state); assert.notEqual(html,general); assert.ok(validate(state)); }
 state.theme='night';assert.equal(validate(state).theme,'general');
});
test('relationship project round-trip preserves both perspectives and rejects unsafe photos',()=>{
 const state=initial();state.people[0].position=83;
 assert.deepEqual(validate(JSON.parse(JSON.stringify(state))),state);
 state.people[0].photo='javascript:alert(1)';
 assert.throws(()=>validate(state),/사진/);
 state.people[0].photo='data:image/svg+xml;base64,PHN2Zz4=';
 assert.throws(()=>validate(state),/사진/);
 assert.throws(()=>validate({...initial(),kind:'profile'}));
});
test('relationship exports escape user content and omit empty record sections',()=>{
 const state=initial();state.people[0].name='@<script>alert(1)</script>';state.memory='line one\n<img src=x onerror=alert(1)>';state.change='';state.unfinished='';
 const html=cardHTML(validate(state));
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));
 assert.ok(html.includes('@&lt;script&gt;'));assert.ok(!html.includes('@@'));
 assert.ok(html.includes('line one<br>&lt;img'));
 assert.ok(!html.includes('최근 변화'));assert.ok(!html.includes('아직 남은 이야기'));
});

