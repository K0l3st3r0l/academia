'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const template=fs.readFileSync(__dirname+'/plantilla.html','utf8'),core=template.split('// CORE_BEGIN')[1].split('\n').slice(1).join('\n').split('// CORE_END')[0];
const context=vm.createContext({Date,Math,JSON,Map,Set,Number,Object,Array,Error});vm.runInContext(core+'\nglobalThis.api=AcademiaCore;',context);
const A=context.api,raw=JSON.parse(fs.readFileSync(__dirname+'/academia.json','utf8')),map=A.loadMap(raw),json=v=>JSON.parse(JSON.stringify(v));
let passed=0;function test(name,fn){fn();passed++;console.log('✓ '+name);}
const scene=(floors=[],platforms=[])=>A.loadMap({id:'test',unit:'CH',size:[10,10],floors,platforms,entities:[{id:'spawn',type:'spawn',x:1,y:8}]});
const flat=scene([{x:0,y:8,w:10,h:2}]);
function sim(b,m,seconds,input={}){for(let i=0;i<Math.ceil(seconds*120);i++)A.moveBody(b,m,1/120,typeof input==='function'?input(i):input);return b;}
const validState=()=>A.freshState(1000);
test('map units, solids, spawn and twelve unique sparks',()=>{assert.equal(map.width,6000);assert.ok(Math.abs(map.spawn.x-2700)<1e-8);assert.equal(map.entities.filter(e=>e.type==='collectible').length,12);assert.equal(map.stairs.length,38);assert.equal(map.oneWays.length,5);assert.equal(raw.entities.some(e=>e.sprite==='estela_alt'),false);});
test('invalid maps fail without changing the input',()=>{const copy=JSON.stringify(raw);A.loadMap(raw);assert.equal(JSON.stringify(raw),copy);assert.throws(()=>A.loadMap({...raw,unit:'pixels'}));assert.throws(()=>A.loadMap({...raw,size:[NaN,9]}));assert.throws(()=>A.loadMap({...raw,entities:[raw.entities[0],raw.entities[0]]}));});
test('falling lands on a solid floor',()=>{const b=A.makeBody(100,300);sim(b,flat,2);assert.equal(b.y,800);assert.equal(b.ground,true);});
test('solid walls block horizontal movement',()=>{const m=scene([{x:0,y:8,w:10,h:2},{x:3,y:6,w:1,h:2}]),b=A.makeBody(220,800);b.ground=true;sim(b,m,2,{axis:1,run:true});assert.equal(b.x,279);});
test('solid ceilings stop a jump from below',()=>{const m=scene([{x:0,y:8,w:10,h:2},{x:1,y:5.8,w:2,h:.3}]),b=A.makeBody(180,800);b.ground=true;b.energy=1;sim(b,m,.3,i=>({jump:i===0,jumpHeld:true}));assert.ok(b.y>=706);assert.ok(b.vy>=0);});
test('one-way platforms let jumps pass from below and catch falls',()=>{const m=scene([{x:0,y:8,w:10,h:2}],[{x:1,y:6.8,w:3,h:.2,oneWay:true}]),b=A.makeBody(200,800);b.ground=true;sim(b,m,1.3,i=>({jump:i===0,jumpHeld:true}));assert.equal(b.y,680);assert.equal(b.ground,true);});
test('down drops through one-way surfaces but not solid floors',()=>{const m=scene([{x:0,y:8,w:10,h:2}],[{x:1,y:6.8,w:3,h:.2,oneWay:true}]),b=A.makeBody(200,680);b.ground=true;sim(b,m,1,i=>({drop:i===0}));assert.equal(b.y,800);assert.equal(b.ground,true);A.moveBody(b,m,1/60,{drop:true});assert.equal(b.y,800);});
test('steps under 0.3 CH climb automatically; taller walls do not',()=>{const m=scene([{x:0,y:8,w:10,h:2},{x:2,y:7.8,w:1,h:.2},{x:3,y:7.6,w:1,h:.4},{x:4,y:7.1,w:1,h:.9}]),b=A.makeBody(140,800);b.ground=true;sim(b,m,3,{axis:1});assert.equal(b.y,760);assert.equal(b.x,379);});
test('both staircases reach the gallery without jumping',()=>{for(const [x,axis] of [[21,1],[5979,-1]]){const b=A.makeBody(x,780);b.ground=true;sim(b,map,8,{axis});assert.ok(b.y<=441,'stair did not reach gallery: '+JSON.stringify(b));}});
test('running fills energy and super jump exceeds the normal jump',()=>{const b=A.makeBody(100,800);b.ground=true;sim(b,flat,2.6,{axis:1,run:true});assert.equal(b.energy,1);const sup=A.makeBody(200,800),normal=A.makeBody(200,800);sup.ground=normal.ground=true;sup.energy=1;let supMin=800,nMin=800;for(let i=0;i<180;i++){A.moveBody(sup,flat,1/120,{jump:i===0,jumpHeld:true});A.moveBody(normal,flat,1/120,{jump:i===0,jumpHeld:true});supMin=Math.min(supMin,sup.y);nMin=Math.min(nMin,normal.y);}assert.ok(supMin<nMin-180);assert.equal(sup.energy,0);});
test('high chest ledge is reachable with a charged jump, beyond a normal jump',()=>{for(const energy of [0,1]){const b=A.makeBody(1860,440);b.ground=true;b.energy=energy;b.vx=A.RUN;let touched=false;for(let i=0;i<300;i++){A.moveBody(b,map,1/120,{axis:i<110?1:0,run:true,jump:i===0,jumpHeld:true});if(b.ground && Math.abs(b.y-150)<1)touched=true;}assert.equal(touched,energy===1);}});
test('a full run along the left gallery charges and reaches the high chest',()=>{
 const b=A.makeBody(1030,440);b.ground=true;sim(b,map,290/120,{axis:1,run:true});assert.equal(b.energy,1);assert.ok(b.x<1950);let high=false;for(let i=0;i<300;i++){A.moveBody(b,map,1/120,{axis:i<115?1:0,run:true,jump:i===0,jumpHeld:true});if(b.ground && Math.abs(b.y-150)<1)high=true;}assert.equal(high,true);
});
test('releasing jump reduces height',()=>{const a=A.makeBody(200,800),b=A.makeBody(200,800);a.ground=b.ground=true;let low=800,high=800;for(let i=0;i<100;i++){A.moveBody(a,flat,1/120,{jump:i===0,jumpHeld:i<5});A.moveBody(b,flat,1/120,{jump:i===0,jumpHeld:true});low=Math.min(low,a.y);high=Math.min(high,b.y);}assert.ok(low>high+60);});
test('coyote jump and landing buffer work',()=>{const b=A.makeBody(100,790);b.coyote=.08;assert.equal(A.moveBody(b,flat,1/60,{jump:true,jumpHeld:true}).jumped,true);const c=A.makeBody(100,796);c.vy=180;assert.equal(A.moveBody(c,flat,1/30,{jump:true,jumpHeld:true}).jumped,true);assert.ok(c.vy<0);});
test('interaction uses floor height, range and secret visibility',()=>{const state=validState(),b=A.makeBody(2850,780);assert.equal(A.nearby(map,b,state).id,'estela');b.y=440;assert.equal(A.nearby(map,b,state),null);b.x=5200;assert.equal(A.nearby(map,b,state),null);state.revealed.push('telescope');assert.equal(A.nearby(map,b,state).id,'telescope');});
test('unique collectibles unlock chest; chest rewards are idempotent',()=>{const s=validState(),chest=map.entities.find(e=>e.id==='spark-chest');assert.equal(A.openChest(s,chest),false);for(const e of map.entities.filter(e=>e.type==='collectible')){assert.equal(A.collect(s,map,e.id),true);assert.equal(A.collect(s,map,e.id),false);}assert.equal(A.collect(s,map,'invented'),false);assert.equal(s.sparks.length,12);assert.equal(A.openChest(s,chest),true);assert.equal(A.openChest(s,chest),false);assert.equal(s.tokens,80);assert.equal(s.items.length,1);});
test('shop rejects overspend and duplicate ownership; refunds half price',()=>{const s=validState();assert.equal(A.trade(s,raw.catalog,'brujula').ok,true);assert.equal(s.tokens,35);assert.equal(A.trade(s,raw.catalog,'brujula').ok,false);assert.equal(A.trade(s,raw.catalog,'capa').ok,false);assert.equal(A.trade(s,raw.catalog,'brujula',true).ok,true);assert.equal(s.tokens,47);assert.equal(A.trade(s,raw.catalog,'brujula',true).ok,false);assert.equal(A.trade(s,raw.catalog,'no-item').ok,false);});
test('bank validates integers and preserves the total on transfer',()=>{const s=validState();for(const n of ['0','-2','2.5','1e2','',NaN,'Infinity'])assert.equal(A.bankTransfer(s,n,false,1000).ok,false);assert.equal(A.bankTransfer(s,30,false,1000).ok,true);assert.equal(s.tokens,30);assert.equal(s.bank.balance,30);assert.equal(A.bankTransfer(s,31,true,1000).ok,false);assert.equal(A.bankTransfer(s,10,true,1000).ok,true);assert.equal(s.tokens+s.bank.balance,60);});
test('interest accrues once per full real week; compounds and caps each week',()=>{const s=validState();s.bank.balance=100;assert.equal(A.accrueInterest(s,1000+A.WEEK-1).earned,0);assert.equal(A.accrueInterest(s,1000+A.WEEK).earned,5);assert.equal(A.accrueInterest(s,1000+A.WEEK).earned,0);assert.equal(A.accrueInterest(s,1000+3*A.WEEK).earned,10);assert.equal(s.bank.balance,115);const c=validState();c.bank.balance=1000;assert.equal(A.accrueInterest(c,1000+20*A.WEEK).earned,200);assert.equal(A.accrueInterest(c,0).earned,0);});
test('a first deposit starts a full week, without empty-account interest',()=>{const s=validState(),now=1000+A.WEEK*3+.8*A.WEEK;A.bankTransfer(s,40,false,now);assert.equal(s.bank.lastWeek,now);assert.equal(A.accrueInterest(s,now+.9*A.WEEK).earned,0);assert.equal(A.accrueInterest(s,now+A.WEEK).earned,2);});
test('save and restore retain shared state and accrue offline interest',()=>{const s=validState();s.flags.welcomed=true;s.items.push({id:'hat',name:'Sombrero'});s.levels.historia='avanzado';s.bank.balance=100;s.sparks.push('spark-1');s.position={mapId:'academia',x:1500,y:780};s.pending={large:'discard me'};const encoded=A.serializeState(s);assert.equal(encoded.includes('discard me'),false);const r=A.restoreState(encoded,1000+A.WEEK,map);assert.equal(r.tokens,60);assert.equal(r.bank.balance,105);assert.equal(r.flags.welcomed,true);assert.equal(r.levels.historia,'avanzado');assert.equal(r.sparks[0],'spark-1');assert.equal(r.position.x,1500);});
test('malformed or blocked storage safely falls back',()=>{for(const raw of ['{broken',null,'{}','{"version":2}'])assert.equal(A.restoreState(raw,1000).tokens,60);const denied={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};assert.equal(A.safeSave(denied,validState()),false);assert.equal(A.safeLoad(denied,1000,map).tokens,60);assert.equal(A.safeLoad(null,1000,map).tokens,60);});
test('dialogue branches, choices, items and flags mutate the one game state',()=>{const s=validState(),d=new A.MapDialogue([{type:'set',flag:'gate',value:true},{type:'if',cond:{flag:'gate',eq:true},then:[{type:'choice',id:'c',prompt:'?',options:[{text:'ok',set:{chosen:true},then:[{type:'item',id:'test',name:'Test'}]}]}]},{type:'goal',text:'Explore'}],s);assert.equal(d.state,s);assert.equal(d.view().type,'choice');d.choose(0);assert.equal(s.flags.chosen,true);assert.equal(s.items[0].id,'test');d.advance();assert.equal(s.currentGoal,'Explore');assert.equal(d.view().type,'chronicle');});
test('adaptive challenges have exact two-ficha rewards, hints and explanation',()=>{const beat={type:'challenge',id:'test',kind:'numeric',subject:'matematica',flatTokens:2,hint:'hint',success:'yes',variants:{intermedio:{answer:12,explain:'12'},inicial:{answer:10},avanzado:{answer:20}}};const s=validState(),d=new A.MapDialogue([beat],s);assert.equal(d.submit('wrong').status,'hint');assert.equal(s.levels.matematica,'inicial');d.advance();assert.equal(d.submit('12').tokens,2);assert.equal(s.tokens,62);assert.throws(()=>d.submit('12'));});
test('all story answer kinds accept correct answers and reject incorrect ones',()=>{const d=new A.StoryEngine({id:'x',scenes:[{beats:[]}]});for(const [kind,v,yes,no] of [['mc',{answer:1},1,0],['numeric',{answer:2.5},'2,5',''],['match',{pairs:[['a','b']]},[['a','b']],[['a','c']]],['order',{items:['a','b']},['a','b'],['b','a']],['grid',{answer:[2,3]},[2,3],[3,2]],['reading',{questions:[{answer:2}]},[2],[1]]]){assert.equal(d.checkAnswer(kind,v,yes),true,kind);assert.equal(d.checkAnswer(kind,v,no),false,kind);}});
test('byte LRU bounds cache memory and refreshes recent entries',()=>{const evicted=[],c=new A.ByteLRU(100,v=>evicted.push(v));c.set('a','A',40);c.set('b','B',40);assert.equal(c.get('a'),'A');c.set('c','C',40);assert.equal(c.get('b'),null);assert.ok(c.bytes<=100);assert.equal(evicted[0],'B');c.clear();assert.equal(c.bytes,0);});
test('portrait camera fills the play area with a child at one fifth of its height',()=>{
 const b=A.makeBody(map.spawn.x,map.spawn.y);
 for(const [width,height] of [[400,570],[320,520],[768,850]]){
  const view=A.cameraLayout(map,b,width,height,true);
  assert.ok(Math.abs(A.CH*view.zoom/height-.2)<1e-8);
  assert.ok((b.y-view.y)*view.zoom<height-40,'leave visible floor above controls');
  assert.ok((b.y-b.h-view.y)*view.zoom>0,'child is fully visible');
  assert.ok(view.y+height/view.zoom<=map.height,'no unused region below the world');
  assert.ok(Math.abs((b.x-view.x)*view.zoom-width/2)<1e-8,'follow horizontally');
 }
});
test('camera follows upper platforms and clamps at all map edges across orientations',()=>{
 for(const [width,height,portrait] of [[1600,830,false],[1024,600,false],[820,250,false],[400,570,true],[1600,1500,false]]){
  for(const [x,y] of [[25,780],[1840,220],[map.width-25,780],[1840,96]]){
   const b=A.makeBody(x,y),view=A.cameraLayout(map,b,width,height,portrait);
   assert.ok(view.x>=0 && view.y>=0);
   assert.ok(view.x+width/view.zoom<=map.width+1e-8);
   assert.ok(view.y+height/view.zoom<=map.height+1e-8);
   assert.ok((b.y-view.y)*view.zoom<height,'player stays above the bottom bar');
   assert.ok((b.y-b.h-view.y)*view.zoom>=-1e-8,'player stays below HUD');
  }
 }
});
test('first Estela interaction survives save and restore before welcome is finished',()=>{
 const s=validState();s.flags.metEstela=true;
 const restored=A.restoreState(A.serializeState(s),1000,map);
 assert.equal(restored.flags.metEstela,true);assert.equal(Boolean(restored.flags.welcomed),false);
});
test('every station, prop, NPC and chest has a supported base',()=>{
 for(const e of [...map.props,...map.entities.filter(e=>['station','portal','npc','chest','secret','sign'].includes(e.type))]){
  assert.ok(A.support(map,{x:e.x,y:e.y,w:10,dropTime:0}),'unsupported '+(e.id||e.sprite));
  if(e.y===780 && e.x>=660 && e.x<=1950 || e.y===780 && e.x>=4050 && e.x<=5340)assert.ok(e.h<=260,'too tall under gallery '+(e.id||e.sprite));
 }
});
test('all platforms use columns or two ceiling chains; atrium remains open',()=>{
 for(const p of raw.platforms){assert.ok(['columns','chains'].includes(p.support));if(p.support==='columns'){assert.ok(p.columns.length>=3);for(let i=1;i<p.columns.length;i++)assert.ok(p.columns[i]-p.columns[i-1]<=6);}else assert.equal(p.sprite,'colgante');}
 assert.ok(raw.platforms.filter(p=>p.sprite==='galeria').every(p=>p.x+p.w<=19.5 || p.x>=40.5));
});
test('both stairs also descend from gallery to ground without jumping',()=>{
 for(const [x,axis] of [[730,-1],[5270,1]]){const b=A.makeBody(x,440);b.ground=true;sim(b,map,9,{axis});assert.equal(b.y,780);assert.equal(b.ground,true);}
});
test('both low hanging platforms are reachable with a normal jump',()=>{
 for(const p of map.platforms.filter(p=>p.id.startsWith('hanging-'))){const b=A.makeBody(p.x+p.w/2,780);b.ground=true;sim(b,map,1.5,i=>({jump:i===0,jumpHeld:true}));assert.equal(b.y,630);assert.ok(b.ground);}
});
test('saved positions from v1 are isolated from the new layout',()=>{
 const keys=[],storage={getItem:k=>{keys.push(k);return null;},setItem:k=>keys.push(k)};A.safeLoad(storage,1000,map);A.safeSave(storage,validState());assert.deepEqual(keys,['academia:map:v2','academia:map:v2']);
});
test('stairs collision coordinates match the measured artwork',()=>{
 const a=raw.stairArt;for(const side of ['left','right'])for(const step of raw.stairs.filter(s=>s.id.startsWith(side) && !s.approach)){const [x,y]=a.treads[step.sourceTread];assert.ok(Math.abs(step.y-(7.8-(996-(y+8))*a.scale))<1e-8);const expected=.4+x*a.scale;assert.ok(Math.abs((side==='left'?step.x:60-step.x-step.w)-expected)<1e-8);}
});
test('measured bases and animation regions stay inside their source pieces',()=>{
 const measured=JSON.parse(fs.readFileSync(__dirname+'/shots3/measurements.json','utf8')).pieces;
 for(const e of raw.props){const meta=measured[e.sprite];assert.ok(meta,e.sprite);assert.equal(meta.ground,meta.bounds[3]-1);const scale=e.h/meta.size[1],origin=e.y-meta.ground*scale;assert.ok(Math.abs(origin+meta.ground*scale-e.y)<1e-10);}
 assert.equal(measured.cofre.ground,measured.cofre_abierto.ground);assert.equal(measured.estela.frames,72);assert.equal(measured.estela.fps,12);assert.ok(measured.estela.size[1]>=350);
 for(const [name,a] of Object.entries(raw.animations)){const [w,h]=measured[name].size;for(const [x,y,r] of [...(a.circles||[]),...(a.lights||[])])assert.ok(x-r>=0 && x+r<=w && y-r>=0 && y+r<=h,name+' region');for(const [x,y] of a.screen||a.sway?.polygon||[])assert.ok(x>=0 && x<=w && y>=0 && y<=h,name+' polygon');}
});
test('artifact template has only allowed markup and no network scripts',()=>{assert.ok(template.startsWith('<title>'));assert.equal(/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(template),false);assert.equal(/<script[^>]+src=|\bfetch\s*\(|\b(?:alert|confirm|prompt)\s*\(/.test(template),false);});
test('display assets stay within the menu budget',()=>{
 const measured=JSON.parse(fs.readFileSync(__dirname+'/shots3/measurements.json','utf8')).pieces;
 assert.equal(measured.ui_marco.packedSize[0],640);
 for(const [name,meta] of Object.entries(measured))if(name.startsWith('ico_')||name.startsWith('objeto_'))assert.ok(Math.max(...meta.packedSize)<=128,name);
 const budget=JSON.parse(fs.readFileSync(__dirname+'/shots3/asset-budget.json','utf8'));assert.ok(budget.htmlBytes<12500000);assert.equal(budget.htmlBytes,fs.statSync(__dirname+'/academia.html').size);
});
test('touch preference round-trips without changing v2 saves',()=>{for(const setting of [true,false,null]){const s=A.freshState(1000,{touchControls:setting});assert.equal(A.restoreState(A.serializeState(s),1000,map).settings.touchControls,setting);}});
test('double jump: a second, lower jump in the air with a flip, once per jump',()=>{const one=A.makeBody(200,800),two=A.makeBody(200,800);one.ground=two.ground=true;let a=800,b=800,flipped=false,doubles=0;for(let i=0;i<220;i++){A.moveBody(one,flat,1/120,{jump:i===0,jumpHeld:true});const e=A.moveBody(two,flat,1/120,{jump:i===0||i===70||i===90,jumpHeld:true});if(e.double)doubles++;if(two.flip>0)flipped=true;a=Math.min(a,one.y);b=Math.min(b,two.y);}assert.equal(doubles,1);assert.ok(flipped);assert.ok(b<a-60,'second jump adds height');assert.ok(800-b<A.CH*2.7,'stays below a super jump');});
test('a double jump from the gallery cannot reach the high chest: it still needs the super jump',()=>{let best=false;for(const at of [40,55,70,85]){const b=A.makeBody(1860,440);b.ground=true;b.vx=A.RUN;for(let i=0;i<300;i++){A.moveBody(b,map,1/120,{axis:i<110?1:0,run:true,jump:i===0||i===at,jumpHeld:true});if(b.ground && Math.abs(b.y-150)<1)best=true;}}assert.equal(best,false);});
test('stairs: walking from the hall passes in front of the staircase, then climbs it from its foot',()=>{const b=A.makeBody(900,780);b.ground=true;sim(b,map,10,{axis:-1});assert.ok(b.x<80,'reached the foot of the left stairs: '+b.x);assert.ok(Math.abs(b.y-780)<25);sim(b,map,9,{axis:1});assert.ok(Math.abs(b.y-440)<1,'on the gallery: '+b.y);const r=A.makeBody(5100,780);r.ground=true;sim(r,map,10,{axis:1});assert.ok(r.x>5880,'reached the foot of the right stairs: '+r.x);sim(r,map,9,{axis:-1});assert.ok(Math.abs(r.y-440)<1,'on the right gallery: '+r.y);});
console.log('\n'+passed+' tests passed.');
