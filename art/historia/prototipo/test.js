'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const template = fs.readFileSync(path.join(__dirname,'plantilla.html'),'utf8');
const source = template.split('// STORY_ENGINE_START')[1]?.split('// STORY_ENGINE_END')[0];
assert.ok(source,'The engine section is marked for DOM-free extraction.');
const context = vm.createContext({});
vm.runInContext(source + '\nglobalThis.Engine = StoryEngine;',context);
const Engine = context.Engine;
const chapter = JSON.parse(fs.readFileSync(path.join(__dirname,'muestra.json'),'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));
let assertions = 0;
function equal(actual,expected,message) {assert.deepEqual(plain(actual),expected,message);assertions++;}
function ok(condition,message) {assert.ok(condition,message);assertions++;}
function correctAnswer(pending) {
  const v = pending.variant;
  return ({mc:() => v.answer,numeric:() => String(v.answer),match:() => v.pairs,order:() => v.items,
    grid:() => v.answer,reading:() => v.questions.map(q=>q.answer)})[pending.beat.kind]();
}
function wrongAnswer(pending) {
  if(pending.beat.kind === 'match') return pending.variant.pairs.map((pair,i,array)=>[pair[0],array[(i+1)%array.length][1]]);
  if(pending.beat.kind === 'grid') return [-1,-1];
  return 'incorrect';
}

const engine = new Engine(chapter);
equal(engine.view().type,'chapter','The title comes first.');
equal(engine.levelFor('matematica'),'intermedio','The default starting level is intermediate.');
engine.advance();equal(engine.view().type,'scene','A scene card precedes its beats.');
const firstCheckpoint = engine.checkpoint();
engine.advance();equal(engine.state.flags.confianza,1,'Set beats execute automatically.');
equal(engine.state.currentGoal,chapter.goals[0],'Goals update while walking.');

const kinds = new Set(), visible = [], levels = {}, outcomes = {};
let nestedSnapshot, secondCheckpoint, guard = 0;
while(engine.view().type !== 'chronicle') {
  assert.ok(++guard < 120,'Playback must terminate.');
  const view = engine.view();visible.push(view.type);
  if(view.type === 'scene') {
    equal(engine.state.tokens,14,'Scene two checkpoint includes all scene one rewards.');
    secondCheckpoint = engine.checkpoint();engine.advance();
  } else if(view.type === 'choice') {
    if(view.beat.id === 'carga') {
      engine.choose(0);
      nestedSnapshot = engine.serialize();
      ok(engine.state.stack.length > 1,'A choice opens a nested stack frame.');
    } else engine.choose(0);
  } else if(view.type === 'challenge') {
    if(view.stage === 'intro') {engine.advance();continue;}
    kinds.add(view.beat.kind);levels[view.beat.id] = view.level;
    if(view.beat.id === 'C' || view.beat.id === 'E') {
      const fixedVariant = JSON.stringify(view.variant);
      const miss = engine.submit(wrongAnswer(view));equal(miss.status,'hint','The first miss shows the pet hint.');
      ok(!view.resolved,'The first miss cannot finish a challenge.');
      equal(engine.state.streaks[view.beat.subject],0,'Any miss resets the subject streak.');
      assert.throws(()=>engine.submit(correctAnswer(view)),/listo/,'The hint must be acknowledged.');
      engine.advance();
      equal(JSON.stringify(view.variant),fixedVariant,'Retry keeps the originally selected variant.');
      const afterHint = new Engine(chapter);afterHint.restore(engine.serialize());
      equal(afterHint.state.pending.attempts,1,'A full snapshot retains the retry count.');
      outcomes[view.beat.id] = engine.submit(view.beat.id === 'C' ? wrongAnswer(view) : correctAnswer(view));
    } else outcomes[view.beat.id] = engine.submit(correctAnswer(view));
    ok(view.resolved,'Success or the second miss resolves the challenge.');
    assert.throws(()=>engine.submit(correctAnswer(view)),/listo/,'Rewards cannot be awarded twice.');
    if(view.beat.id === 'B') equal(engine.levelFor('matematica'),'avanzado','Two first-try successes raise the subject level.');
    engine.advance();
  } else engine.advance();
}
equal([...kinds].sort(),['grid','match','mc','numeric','order','reading'],'The sample plays every challenge kind.');
ok(visible.includes('item') && visible.includes('perspective') && visible.includes('line'),'The visible beats are exercised.');
equal(levels,{A:'intermedio',B:'intermedio',C:'intermedio',D:'intermedio',E:'avanzado',F:'intermedio'},'Each challenge chooses the current subject level.');
equal(engine.state.tokens,22,'First-try bonuses, hint success, and two-miss consolation tokens sum correctly.');
equal(engine.state.flags,{confianza:1,carga:'agua',companero:'diego',equipo:true,escucho:true},'Nested choices and sets persist.');
equal(engine.state.items.map(item=>item.id),['cantimplora'],'Only the selected branch grants an item.');
equal(engine.levelFor('matematica'),'intermedio','A miss lowers the next math level.');
equal(engine.levelFor('ingles'),'inicial','Difficulty cannot fall below initial.');
equal(outcomes.C.status,'help','A second miss continues with explanation.');
equal(outcomes.C.tokens,1,'A second miss awards one token.');
equal(outcomes.E.tokens,4,'A correct retry has no first-try bonus.');
equal(engine.state.results['MA-OA16'].solvedWithHint,1,'OA records distinguish hint-assisted success.');
equal(engine.state.results['IN-OA1'].explained,1,'OA records distinguish the worked explanation.');
equal(engine.state.results['LE-OA2'].firstTry,1,'Reading awards an OA result.');
equal(engine.state.results['LE-OA6'].firstTry,1,'A challenge can practise several OAs.');

engine.advance();equal(engine.view().type,'recap','Chronicle is followed by a conditional recap.');
equal(engine.view().lines.length,3,'Only conditions that hold appear in the recap.');
engine.advance();equal(engine.view().type,'reflection','Reflection follows the recap.');
engine.reflect('preguntar');equal(engine.view().type,'reason','Reflection separates the idea from its reason.');
assert.throws(()=>engine.justify(' '),/razón/);
assert.throws(()=>engine.justify('x'.repeat(201)),/200/);
const beforeReflectionTokens = engine.state.tokens;
engine.justify('Porque quiero entender lo que necesitan las personas.');
equal(engine.state.tokens,beforeReflectionTokens,'Reflection is never graded.');
equal(engine.state.results['HI-OA20'].reflections,1,'Reflection records its OAs without marking right or wrong.');
equal(engine.view().type,'closing','Estela closes the reflection.');
engine.advance();equal(engine.view().type,'rewards','Rewards follow the closing.');
equal(engine.state.piece.id,'engranaje_muestra','The clock piece is awarded.');
engine.advance();equal(engine.view().type,'end','The final screen follows rewards.');
equal(engine.summary().length,5,'All five subjects appear in the sample summary.');

const restored = new Engine(chapter);restored.restore(nestedSnapshot);
equal(restored.state.flags.carga,'agua','Mid-branch restoration keeps the selected flags.');
restored.advance();equal(restored.view().beat.id,'ayuda','Restoration continues the nested choice.');
restored.choose(1);restored.advance();equal(restored.view().type,'item','A nested branch rejoins its parent.');
equal(restored.state.flags.companero,'solo','New choices apply their flags after restore.');
const checkpointRestored = new Engine(chapter);checkpointRestored.restore(secondCheckpoint);
equal(checkpointRestored.view().type,'scene','Scene-start saves restore the scene card.');
equal(checkpointRestored.state.tokens,14,'A checkpoint does not include partial scene rewards.');
equal(checkpointRestored.levelFor('matematica'),'avanzado','A checkpoint keeps adaptive levels.');
checkpointRestored.advance();equal(checkpointRestored.view().type,'perspective','Scene-start restores replay the whole scene.');
const initialRestored = new Engine(chapter);initialRestored.restore(firstCheckpoint);
equal(initialRestored.state.flags,{},'Scene one checkpoint precedes its beats.');
assert.throws(()=>initialRestored.restore({...JSON.parse(firstCheckpoint),chapterId:'another'}),/corresponde/);
assert.throws(()=>initialRestored.restore('{invalid'));

const alternate = new Engine(chapter,{startingLevel:'inicial'});
let altGuard = 0;
while(alternate.view().type !== 'recap') {
  assert.ok(++altGuard < 120,'Alternate branch must terminate.');
  const view = alternate.view();
  if(view.type === 'choice') alternate.choose(1);
  else if(view.type === 'challenge' && view.stage === 'question') {alternate.submit(correctAnswer(view));alternate.advance();}
  else alternate.advance();
}
equal(alternate.state.items.map(item=>item.id),['cuerda'],'The other choice executes the then branch.');
equal(alternate.view().lines.length,2,'Alternate recap excludes the water and team flags.');
equal(alternate.state.choices,{carga:1},'A skipped nested choice is never recorded.');
ok(!alternate.condition({flag:'equipo',set:true}),'Unset flags fail set:true.');
ok(alternate.condition({flag:'equipo',set:false}),'Unset flags satisfy set:false.');
ok(alternate.condition({flag:'carga',ne:'agua'}),'ne compares flag values.');
alternate.state.flags.zero = 0;
ok(alternate.condition({flag:'zero',set:true}),'A zero value is still a set flag.');
alternate.advance();alternate.reflect('escuchar');alternate.justify(chapter.reflection.reasons[0]);
equal(alternate.state.reflection.reason,chapter.reflection.reasons[0],'Prewritten reflection reasons are supported.');

// Validate every authored level, not just the adaptive path taken above.
for(const scene of chapter.scenes) for(const beat of scene.beats.filter(beat=>beat.type === 'challenge')) {
  for(const level of ['inicial','intermedio','avanzado']) {
    const variant = beat.variants[level];
    ok(engine.checkAnswer(beat.kind,variant,correctAnswer({beat,variant})),`${beat.id}/${level}: canonical answer is accepted.`);
    ok(!engine.checkAnswer(beat.kind,variant,wrongAnswer({beat,variant})),`${beat.id}/${level}: wrong answer is rejected.`);
  }
}
ok(!engine.checkAnswer('numeric',{answer:0},''),'Empty numeric input is not zero.');
ok(!engine.checkAnswer('numeric',{answer:12},'12abc'),'Numeric answers cannot contain trailing junk.');
ok(engine.checkAnswer('numeric',{answer:1.5,tolerance:.1},'1,5'),'Chilean decimal commas are accepted.');
ok(engine.checkAnswer('numeric',{answer:12,tolerance:1},13),'Numeric tolerance is inclusive.');
ok(!engine.checkAnswer('grid',{answer:[2,1]},[1,2]),'Grid axes cannot be swapped.');
ok(engine.checkAnswer('match',{pairs:[['a','A'],['b','B']]},[['b','B'],['a','A']]),'Pairs can be submitted in any order.');
ok(!engine.checkAnswer('match',{pairs:[['a','A'],['b','B']]},[['a','A'],['a','A']]),'Duplicate pairs cannot masquerade as complete matching.');
ok(!engine.checkAnswer('reading',{questions:[{answer:0},{answer:1}]},[0]),'Every reading question must be answered.');
const complete = new Engine(chapter);complete.restore(engine.serialize());
equal(complete.state,plain(engine.state),'Full state serialization round-trips including results and rewards.');
const maximum = new Engine(chapter,{startingLevel:'avanzado'});
maximum.enterScene(0);maximum.state.flags.confianza=0;maximum.advance();
while(maximum.view().type !== 'challenge') {const view=maximum.view();if(view.type==='choice')maximum.choose(0);else maximum.advance();}
if(maximum.view().stage==='intro') maximum.advance();
maximum.submit(correctAnswer(maximum.view()));maximum.advance();maximum.submit(correctAnswer(maximum.view()));
equal(maximum.levelFor('matematica'),'avanzado','Difficulty cannot exceed advanced.');
console.log(`PASS: ${assertions} assertions; both chapter paths, six kinds, 18 variants, adaptation, OA results, reflection, rewards, and saves.`);
