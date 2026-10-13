'use strict';
// Event and lifecycle checks for the compiled page; this shim does not render CSS.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const page=fs.readFileSync(__dirname+'/academia.html','utf8');
let unpacked=page;for(const [name,marker] of [['SRC','__SRC_JSON__'],['ART_META','__ART_JSON__'],['KID_SPRITES','__KID_JSON__'],['PET_SPRITES','__PET_JSON__'],['MAP_DATA','__MAP_JSON__'],['CHALLENGES','__CHALLENGES_JSON__']])unpacked=unpacked.replace(new RegExp('^const '+name+' = [^\\n]*;$','m'),'const '+name+' = '+marker+';');assert.ok(unpacked===fs.readFileSync(__dirname+'/plantilla.html','utf8'),'compiled artifact must match the current template');
const script=page.match(/<script>([\s\S]*)<\/script>/)[1];
const sources=JSON.parse(page.match(/^const SRC = ([^\n]*);$/m)[1]),art=JSON.parse(page.match(/^const ART_META = ([^\n]*);$/m)[1]);
function dimensions(uri){
 if(!uri.startsWith('data:image/webp'))return [32,32];
 const b=Buffer.from(uri.split(',')[1],'base64');
 for(let at=12;at+8<b.length;){const tag=b.toString('ascii',at,at+4),size=b.readUInt32LE(at+4),data=at+8;
  if(tag==='VP8X')return [1+b.readUIntLE(data+4,3),1+b.readUIntLE(data+7,3)];
  if(tag==='VP8L'){const bits=b.readUInt32LE(data+1);return [1+(bits&16383),1+((bits>>>14)&16383)];}
  if(tag==='VP8 ')return [b.readUInt16LE(data+6)&16383,b.readUInt16LE(data+8)&16383];at=data+size+(size%2);
 }
 throw Error('Missing WebP dimensions');
}
const imageInfo=new Map(Object.entries(sources).map(([name,src])=>[src,{name,size:dimensions(src)}]));
async function launch({width=400,height=820,playHeight=570,touch=true,reduced=false,saved=null,popupBlocked=false,path='/',server=null,expectReady=true}={}){
 const errors=[],nodes={},animations=[],timers=new Map(),hold=[],events={},audio={contexts:0,notes:[]},draws=[],tabs=[],transforms=[];let now=0,nextTimer=1,raf,observer,seed=123456;const seededMath=Object.create(Math);seededMath.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const makeContext=canvas=>{
  const stack=[],state={globalAlpha:1,globalCompositeOperation:'source-over',flipX:1};
  Object.assign(state,{save:()=>stack.push({globalAlpha:state.globalAlpha,globalCompositeOperation:state.globalCompositeOperation,flipX:state.flipX}),restore:()=>Object.assign(state,stack.pop()||{}),
   setTransform:(a)=>{state.flipX=Math.sign(a)||1;},scale:(x)=>{state.flipX*=Math.sign(x)||1;},
   transform:(...args)=>{assert.ok(args.every(Number.isFinite));transforms.push(args);},createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}}),
   drawImage:(img,...args)=>{assert.ok(img,'drawImage needs a loaded image');assert.ok(args.every(n=>Number.isFinite(n)),'drawImage coordinates must be finite');draws.push({img,canvas,name:img.assetName,args,alpha:state.globalAlpha,composite:state.globalCompositeOperation,flipX:state.flipX});},measureText:t=>({width:String(t).length*7}),getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)})});
  return new Proxy(state,{get:(o,k)=>k in o?o[k]:(()=>{})});
 };
 class Element{
  constructor(tag='div'){
   this.tagName=tag.toUpperCase();this.children=[];this.hidden=false;this._text='';this.dataset={};this.style={properties:{},setProperty(k,v){this.properties[k]=v;}};this.events={};this.attributes={};this.width=100;this.height=100;this.isConnected=true;this.parentElement=null;this.disabled=false;
   this.classes=new Set();this.classList={add:(...a)=>a.forEach(x=>this.classes.add(x)),remove:(...a)=>a.forEach(x=>this.classes.delete(x)),contains:a=>this.classes.has(a),toggle:(a,b)=>{if(b===undefined)b=!this.classes.has(a);b?this.classes.add(a):this.classes.delete(a);return b;}};
  }
  set className(v){this.classes=new Set(v.split(/\s+/).filter(Boolean));}get className(){return [...this.classes].join(' ');}
  set textContent(v){this._text=String(v);this.replaceChildren();}get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
  append(...a){for(const child of a){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(n=>n!==child);child.parentElement=this;this.children.push(child);}}replaceChildren(...a){for(const child of this.children){child.parentElement=null;child.isConnected=false;}this.children=[];for(const child of a)child.isConnected=true;this.append(...a);}
  get lastElementChild(){return this.children.at(-1);}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);this.isConnected=false;}
  addEventListener(name,fn){(this.events[name]??=fn);}setAttribute(name,val){this.attributes[name]=String(val);if(name==='class')this.className=val;}getAttribute(name){return this.attributes[name];}
  removeAttribute(name){delete this.attributes[name];if(name==='id')delete this.id;}
  cloneNode(deep){const copy=new Element(this.tagName);for(const key of ['id','src','alt','hidden','_text','disabled','tabIndex','href'])if(this[key]!==undefined)copy[key]=this[key];copy.className=this.className;copy.attributes={...this.attributes};if(deep)copy.append(...this.children.map(n=>n.cloneNode(true)));return copy;}
  animate(frames,options){const animation={frames,options,cancelled:false,cancel(){this.cancelled=true;timers.delete(id);}};animations.push(animation);const id=nextTimer++;timers.set(id,{at:now+options.duration,fn:()=>animation.onfinish?.()});return animation;}
  focus(){document.activeElement=this;this.events.focus?.();}click(){if(!this.disabled)this.events.click?.({target:this,preventDefault(){}});}
  matches(selector){return selector.split(',').some(selector=>{selector=selector.trim();if(selector.includes(':not(:disabled)')&&this.disabled)return false;selector=selector.replace(':not(:disabled)','');const attr=selector.match(/\[([^=\]]+)(?:="?([^"\]]+)"?)?\]/);if(attr){let val=attr[1].startsWith('data-')?this.dataset[attr[1].slice(5)]:this.getAttribute(attr[1]);if(attr[1]==='tabindex')val=this.tabIndex??val;if(attr[1]==='href')val=this.href;if(val===undefined||attr[2]!==undefined&&String(val)!==attr[2])return false;selector=selector.replace(attr[0],'');}if(selector.startsWith('.'))return this.classList.contains(selector.slice(1));if(selector.startsWith('#'))return this.id===selector.slice(1);return !selector||this.tagName===selector.toUpperCase();});}
  closest(selector){for(let n=this;n;n=n.parentElement)if(n.matches(selector))return n;return null;}getClientRects(){for(let n=this;n;n=n.parentElement)if(n.hidden)return [];return [1];}
  querySelectorAll(selector){const found=[];for(const child of this.children){if(child.matches(selector))found.push(child);found.push(...child.querySelectorAll(selector));}return found;}querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  getContext(){return this.context??=makeContext(this);}setPointerCapture(){}scrollIntoView(){}
  getBoundingClientRect(){return {left:0,top:0,width,height:playHeight};}
 }
 const document={hidden:false,body:new Element(),getElementById:id=>document.body.querySelector('#'+id)||nodes[id]||(nodes[id]=new Element(['view','mini'].includes(id)?'canvas':'div')),createElement:t=>new Element(t),createElementNS:(ns,t)=>new Element(t),querySelectorAll:selector=>selector==='[data-hold]'?hold:document.body.querySelectorAll(selector),addEventListener(){}};
 const overlay=document.getElementById('overlay');overlay.hidden=true;document.getElementById('toast').hidden=true;document.getElementById('portal-flash').hidden=true;
 const gameWindow=document.getElementById('game-window'),header=document.getElementById('window-header'),stage=document.getElementById('stage');stage.tabIndex=-1;header.append(document.getElementById('window-title'),document.getElementById('window-wallet'),document.getElementById('overlay-close'));gameWindow.append(header,stage);overlay.append(gameWindow);document.body.append(overlay);
 for(const id of ['overlay-close','bag','gestures','objectives-toggle','clock-hud','settings'])document.getElementById(id).tagName='BUTTON';
 for(const key of ['left','right','run','drop','jump']){const button=new Element('button');button.dataset.hold=key;hold.push(button);}
 const storage={value:saved,getItem(k){return k==='academia_student_token'?(server?'student-jwt':null):this.value;},setItem(k,v){this.value=v;}};
 const redirects=[],location={pathname:path,replace:url=>redirects.push(url),set href(url){redirects.push(url);}};
 const c=vm.createContext({Math:seededMath,document,location,fetch:server,innerWidth:width,innerHeight:height,devicePixelRatio:2,navigator:{maxTouchPoints:touch?5:0},localStorage:storage,
  open:(href,target,features)=>{if(popupBlocked)return null;const tab={href,target,features,opener:'parent',location:{replace:next=>{tab.href=next;tab.navigations=(tab.navigations||0)+1;}}};tabs.push(tab);return tab;},console:{error:e=>errors.push(String(e))},AudioContext:class{constructor(){audio.contexts++;this.currentTime=0;this.state='running';this.destination={};}createOscillator(){const note={};audio.notes.push(note);return {type:'',frequency:{setValueAtTime:f=>note.frequency=f},connect(){},start:at=>note.at=at,stop(){}};}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime:v=>audio.volume=v,exponentialRampToValueAtTime(){}},connect(){}};}},matchMedia:q=>({matches:q.includes('reduced')?reduced:touch,addEventListener(){}}),performance:{now:()=>now},
  requestAnimationFrame:f=>{raf=f;return 1;},ResizeObserver:class{constructor(cb){observer=cb;}observe(){}},
  setTimeout:(fn,delay)=>{const id=nextTimer++;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),
  Image:class{set src(s){const info=imageInfo.get(s);assert.ok(info,'packed image exists');this.assetName=info.name;[this.width,this.height]=info.size;this.onload?.();}},ImageData:class{},Uint8Array,Float32Array,Uint8ClampedArray});
 c.window=c;c.addEventListener=(name,fn)=>events[name]=fn;vm.runInContext(script,c);await new Promise(setImmediate);
 const runTime=ms=>{const until=now+ms;for(;;){const [id,entry]=[...timers].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0]||[];if(!entry)break;now=entry.at;timers.delete(id);entry.fn();}now=until;};
 const frames=n=>{for(let i=0;i<n;i++){now+=1000/60;draws.length=0;transforms.length=0;raf(now);}};
 assert.deepEqual(errors,[]);if(expectReady){assert.equal(nodes.loading.hidden,true);assert.ok(raf);}
 return {game:c.Academia,nodes,hold,errors,storage,redirects,runTime,frames,audio,draws,tabs,transforms,animations,active:()=>document.activeElement,key:(key,kind='keydown',modifiers={})=>{const target=document.activeElement||nodes.view;let prevented=false;const event={key,repeat:false,preventDefault(){prevented=true;},target,...modifiers};events[kind](event);if(kind==='keydown'&&!prevented&&key==='Enter'&&target.tagName==='BUTTON')target.click();},resize:(w,h,ph)=>{width=w;height=h;playHeight=ph;c.innerWidth=w;c.innerHeight=h;observer();}};
}
function findText(root,text){if(root.textContent===text && root.tagName==='BUTTON')return root;for(const child of root.children||[]){const found=findText(child,text);if(found)return found;}return null;}
(async()=>{
 for(const touch of [false,true]){
  const app=await launch({touch}),{game,nodes,runTime}=app;
  assert.equal(nodes.objective.hidden,false);assert.equal(nodes['objectives-toggle'].getAttribute('aria-expanded'),'true');
  assert.equal(nodes.toast.hidden,false);assert.equal(nodes.toast.textContent.includes(touch?'toca Hablar':'pulsa E'),true);
  runTime(4599);assert.equal(nodes.toast.classList.contains('fading'),false);
  runTime(1);assert.equal(nodes.toast.classList.contains('fading'),true);assert.equal(nodes.toast.hidden,false);
  runTime(400);assert.equal(nodes.toast.hidden,true);
  assert.equal(nodes.view.width,600);assert.equal(nodes.view.height,855,'buffer uses play height and capped DPR');
  app.resize(820,400,250);assert.equal(nodes.view.width,1230);assert.equal(nodes.view.height,375);
  app.resize(400,820,570);
  game.interact(game.map.entities.find(e=>e.id==='estela'));assert.equal(game.state.flags.metEstela,true);assert.equal(nodes.objective.hidden,true);
  game.closeOverlay();assert.equal(nodes.objective.hidden,true,'closing dialogue keeps objectives collapsed');
  nodes['objectives-toggle'].onclick();assert.equal(nodes.overlay.hidden,false);assert.equal(nodes['window-title'].textContent,'Objetivos');findText(nodes.stage,'Mostrar objetivo en el mapa').click();assert.equal(nodes.objective.hidden,false);assert.equal(nodes['objectives-toggle'].getAttribute('aria-expanded'),'true');
  game.showSettings();assert.equal(nodes.objective.hidden,true);game.closeOverlay();assert.equal(nodes.objective.hidden,false,'panel preserves manual disclosure');
  const restored=await launch({touch,saved:app.storage.value});assert.equal(restored.nodes.objective.hidden,true,'first contact persists');assert.equal(restored.nodes.toast.hidden,true,'welcome is not repeated');
  game.interact(game.map.entities.find(e=>e.id==='guide'));assert.equal(nodes.overlay.hidden,false);assert.ok(nodes.stage.children[0].children.some(n=>n.textContent==='Camino de estrellas'));game.closeOverlay();
  for(const action of ['travel','shop','bank','reading','arcade','board','garden','practice']){game.station(action);assert.equal(nodes.overlay.hidden,false,action);game.closeOverlay();}
  // Cancelling a held direction must release it, including while the device rotates.
  const right=app.hold.find(b=>b.dataset.hold==='right');app.frames(3);const x=game.player.x;
  right.events.pointerdown({preventDefault(){},pointerId:1});app.frames(40);assert.ok(game.player.x>x+20);assert.ok(right.classList.contains('pressed'));
  right.events.pointercancel();app.frames(30);const stopped=game.player.x;app.frames(30);assert.ok(Math.abs(game.player.x-stopped)<1);assert.equal(right.classList.contains('pressed'),false);
  const jump=app.hold.find(b=>b.dataset.hold==='jump');Object.assign(game.player,{x:1860,y:440,ground:true,energy:1});app.resize(400,820,570);
  jump.events.pointerdown({preventDefault(){},pointerId:2});
  for(let i=0;i<70;i++){app.frames(1);const v=game.viewport;assert.ok((game.player.y-100-v.y)*v.zoom>=-1e-8,'head remains visible through a charged jump: '+JSON.stringify({i,y:game.player.y,v}));assert.ok((game.player.y-v.y)*v.zoom<=v.height,'feet remain in play area');}
  jump.events.pointerup();
  game.showSettings();findText(nodes.stage,'Reiniciar progreso').events.click();findText(nodes.stage,'Sí, reiniciar').events.click();assert.equal(nodes.objective.hidden,false);assert.equal(Boolean(game.state.flags.metEstela),false);
  assert.deepEqual(app.errors,[]);console.log('✓ compiled UI: '+(touch?'touch':'keyboard')+', toast timing, objectives, save/restore, controls, resize and panels');
 }
 const reduced=await launch({reduced:true});reduced.runTime(4600);assert.equal(reduced.nodes.toast.hidden,true);console.log('✓ reduced motion dismisses the welcome without waiting for a fade');
 const replacement=await launch();replacement.runTime(4000);replacement.game.loadMap({id:'second',title:'Otro mapa',unit:'CH',size:[20,9],floors:[{x:0,y:7.8,w:20,h:1.2,sprite:'suelo'}],entities:[{id:'second-spawn',type:'spawn',x:2,y:7.8}]});replacement.runTime(1000);assert.equal(replacement.nodes.toast.hidden,false);assert.equal(replacement.nodes.toast.textContent,'Otro mapa');replacement.runTime(2900);assert.equal(replacement.nodes.toast.hidden,true);console.log('✓ a replacement toast clears the previous dismissal');

 for(const reducedMotion of [false,true]){
  const app=await launch({width:1600,height:900,playHeight:820,touch:false,reduced:reducedMotion}),{game,nodes}=app;
  for(const e of game.map.entities.filter(e=>['station','portal','npc','sign','secret'].includes(e.type))){
   // Cross the station under real tick() movement, then interact using the keyboard event.
   if(e.type==='secret')game.state.revealed.push(e.id);
   Object.assign(game.player,{x:e.x-135,y:e.y,vx:0,vy:0,ground:true});app.key('ArrowRight');app.frames(170);app.key('ArrowRight','keyup');
   assert.equal(nodes.overlay.hidden,true,'passing '+e.id+' must not open a panel');assert.equal(game.treasure,null);
   Object.assign(game.player,{x:e.x,y:e.y,vx:0,vy:0,ground:true});app.frames(3);app.key('e');assert.equal(nodes.overlay.hidden,false,'E opens '+e.id);game.closeOverlay();
  }
  console.log('✓ E-only interaction at every station, portal, NPC, sign and telescope ('+(reducedMotion?'reduced':'animated')+')');
 }
 const chestApp=await launch({width:1600,height:900,playHeight:820,touch:false}),{game:cg,nodes:cn}=chestApp;
 const chest=cg.map.entities.find(e=>e.id==='high-chest');Object.assign(cg.player,{x:chest.x-55,y:chest.y,vx:0,vy:0,ground:true});chestApp.frames(3);
 assert.equal(cg.state.revealed.includes(chest.id),true,'secret proximity only reveals');assert.equal(cn.overlay.hidden,true);assert.equal(chestApp.audio.contexts,0);
 chestApp.key('Enter');assert.ok(cg.treasure);assert.equal(cg.state.tokens,75);assert.equal(cg.state.copihues,1);assert.equal(cg.state.items.filter(i=>i.id==='medallon').length,1);assert.equal(cn.overlay.hidden,true);assert.equal(chestApp.audio.contexts,1);assert.equal(chestApp.audio.notes.length,0);
 const chestX=cg.player.x,baseZoom=cg.viewport.zoom;chestApp.key('ArrowRight');chestApp.frames(20);chestApp.key('e');assert.ok(cg.treasure,'anticipation cannot be skipped');assert.equal(cg.player.x,chestX,'cinematic locks control');assert.ok(cg.viewport.zoom>baseZoom);
 chestApp.frames(150);assert.equal(cn.treasure.hidden,false);assert.equal(cg.treasure.banner,true);assert.equal(chestApp.audio.notes.length,5);assert.ok(chestApp.audio.volume<=.02);assert.equal(cn['treasure-title'].textContent,'¡Conseguiste: Medallón del cielo!');assert.equal(cn['treasure-tokens'].textContent,'+15 tokens · +1 copihue');
 const up=cg.viewport.zoom;chestApp.key('e');assert.equal(cg.treasure,null);assert.equal(cn.treasure.hidden,true);chestApp.frames(80);assert.ok(cg.viewport.zoom<up);chestApp.key('Enter');assert.equal(cg.state.tokens,75);assert.equal(cg.state.copihues,1);assert.equal(cg.state.items.length,1);assert.equal(cg.treasure,null);cg.closeOverlay();
 const savedChest=await launch({saved:chestApp.storage.value});assert.equal(savedChest.game.state.chests.includes(chest.id),true);assert.equal(savedChest.game.state.tokens,75);
 console.log('✓ chest timing, control lock, fanfare after input, banner, camera return, persistence and rewards once');
 const short=await launch();const sc=short.game.map.entities.find(e=>e.id==='high-chest');Object.assign(short.game.player,{x:sc.x,y:sc.y,ground:true});short.frames(3);short.key('e');short.frames(70);short.key('e');assert.equal(short.game.treasure,null);assert.equal(short.game.state.tokens,75);console.log('✓ E can skip once the item appears');
 const quiet=await launch({reduced:true});quiet.game.state.settings.sound=false;const qc=quiet.game.map.entities.find(e=>e.id==='high-chest');Object.assign(quiet.game.player,{x:qc.x,y:qc.y,ground:true});quiet.frames(3);const qz=quiet.game.viewport.zoom;quiet.nodes['action-touch'].onclick();quiet.frames(1);assert.equal(quiet.nodes.treasure.hidden,false);assert.equal(quiet.game.viewport.zoom,qz);assert.equal(quiet.audio.contexts,0);quiet.nodes['treasure-close'].onclick();assert.equal(quiet.game.treasure,null);assert.equal(quiet.game.state.tokens,75);console.log('✓ reduced chest swaps directly to banner, tap closes, sound toggle mutes');
 const locked=await launch();const lc=locked.game.map.entities.find(e=>e.id==='spark-chest');Object.assign(locked.game.player,{x:lc.x,y:lc.y,ground:true});locked.frames(3);locked.key('e');assert.equal(locked.nodes.overlay.hidden,false);assert.equal(locked.game.treasure,null);assert.equal(locked.game.state.tokens,60);locked.game.closeOverlay();locked.game.state.sparks.push(...locked.game.map.entities.filter(e=>e.type==='collectible').map(e=>e.id));locked.key('e');assert.equal(locked.game.state.tokens,80);locked.frames(180);locked.nodes['treasure-close'].onclick();assert.equal(locked.game.state.chests.filter(id=>id===lc.id).length,1);console.log('✓ locked chest hint, all twelve sparks unlock, touch dismisses');
 const prefs=await launch();prefs.game.showSettings();const prefCard=prefs.nodes.stage.querySelector('.window-content'),soundLabel=prefCard.children.find(n=>n.children?.some(c=>c.textContent==='Sonido de los tesoros')),motionLabel=prefCard.children.find(n=>n.children?.some(c=>c.textContent==='Reducir movimiento'));assert.ok(soundLabel&&motionLabel);const soundInput=soundLabel.children.find(n=>n.tagName==='INPUT'),motionInput=motionLabel.children.find(n=>n.tagName==='INPUT');soundInput.checked=false;soundInput.events.change();motionInput.checked=true;motionInput.events.change();assert.equal(prefs.game.reducedMotion,true);prefs.game.closeOverlay();const prefRestored=await launch({saved:prefs.storage.value});assert.equal(prefRestored.game.state.settings.sound,false);assert.equal(prefRestored.game.reducedMotion,true);console.log('✓ sound and reduced-motion controls persist');
 const moving=await launch({width:1600,height:900,playHeight:820,touch:false});const starts=new Map(moving.game.classmates.map(c=>[c.id,c.x])),wandered=new Set();for(let minuteStep=0;minuteStep<60;minuteStep++){moving.frames(60);for(const c of moving.game.classmates)if(Math.abs(c.x-starts.get(c.id))>20)wandered.add(c.id);}assert.ok(wandered.has('benja') && wandered.has('tomas'),'both upstairs classmates wander between their own destinations');for(const c of moving.game.classmates){assert.ok(c.x>=c.zone[0]*100-1 && c.x<=c.zone[1]*100+1);assert.ok(Math.abs(c.y-(c.id==='benja'||c.id==='tomas'?440:780))<1e-8);}console.log('✓ classmates stay on their own floor and within their wing');
 for(const [width,height,playHeight,touch] of [[1600,900,820,false],[1024,768,606,true],[400,820,570,true],[820,400,250,true]]){const device=await launch({width,height,playHeight,touch});device.frames(5);const v=device.game.viewport;assert.equal(v.width,width);assert.equal(v.height,playHeight);assert.ok((device.game.player.y-v.y)*v.zoom<playHeight);assert.equal(device.nodes.view.width,Math.round(width*1.5));assert.deepEqual(device.errors,[]);}console.log('✓ desktop, tablet touch, phone portrait and landscape canvas/camera sizes');
 // Game menus: assert visible states and exercise the same handlers used by keyboard/touch.
 const shopApp=await launch({width:1600,height:900,touch:false}),{game:sg,nodes:sn}=shopApp;
 sg.showShop();assert.equal(sn['window-title'].textContent,'Puesto del Mercader');assert.equal(sn.overlay.getAttribute('aria-labelledby'),'window-title');assert.equal(sn['window-wallet'].hidden,false);
 const slots=sn.stage.querySelectorAll('.item-slot');assert.equal(slots.length,4,'wearables moved to the character (2026-10-12): four keepsakes left');assert.equal(slots[0].getAttribute('aria-pressed'),'true');
 slots[1].click();assert.equal(slots[1].getAttribute('aria-pressed'),'true');assert.ok(sn.stage.querySelector('.merchant-bubble').textContent.includes('¡Nunca te perderás!'));
 const buy=sn.stage.querySelector('[data-action="buy"]');assert.equal(buy.disabled,false);assert.equal(buy.textContent,'Comprar25');buy.click();assert.equal(sg.state.tokens,35);assert.equal(sg.state.items.filter(i=>i.id==='brujula').length,1);assert.equal(sn.stage.querySelector('.owned-stamp').textContent,'En tu mochila');assert.equal(sn.stage.querySelector('[data-action="buy"]'),null);slots[1].click();assert.equal(sg.state.tokens,35,'repeat tap cannot buy an owned item');assert.ok(sn.stage.querySelector('.merchant-bubble').textContent.includes('¡Gracias!'));assert.ok(shopApp.animations.length>0,'buy animates an item toward the HUD');shopApp.runTime(400);assert.equal(sn['window-wallet'].children[1].textContent,'35');
 shopApp.key('ArrowRight');assert.equal(slots[2].getAttribute('aria-pressed'),'true');shopApp.key('e');assert.equal(sg.state.tokens,20);assert.equal(sg.state.items.length,2);
 slots[3].click();const poor=sn.stage.querySelector('[data-action="buy"]');assert.equal(poor.disabled,true);assert.equal(poor.textContent,'Te faltan 10 tokens');poor.click();assert.equal(sg.state.tokens,20);assert.equal(sg.state.items.length,2);shopApp.key('Escape');assert.equal(sn.overlay.hidden,true);assert.equal(sn.view,shopApp.active(),'Escape returns focus to the canvas');
 sg.showBag();assert.equal(sn.stage.querySelectorAll('.item-slot').length,12);assert.equal(sn.stage.querySelectorAll('.item-slot').filter(n=>!n.className.includes('empty')).length,2);
 // Tap an item, then an empty slot: it moves there and stays there when the bag reopens.
 {const first=sn.stage.querySelectorAll('.item-slot')[0],id=sg.state.items.find(i=>i.name===first.getAttribute('aria-label')).id;first.click();sn.stage.querySelectorAll('.item-slot')[6].click();assert.equal(sg.state.bag[id],6);sg.closeOverlay();sg.showBag();assert.equal(sn.stage.querySelectorAll('.item-slot')[6].getAttribute('aria-label'),first.getAttribute('aria-label'));assert.equal(sn.stage.querySelectorAll('.item-slot')[0].getAttribute('aria-label'),'Casilla vacía');sn.stage.querySelectorAll('.item-slot')[6].click();}
 findText(sn.stage,'Vender · 12 tokens').click();assert.equal(sg.state.tokens,32);assert.equal(sg.state.items.some(i=>i.id==='brujula'),false);shopApp.key('q');assert.equal(sn.overlay.hidden,true);
 sg.showShop();shopApp.resize(400,820,570);shopApp.key('ArrowDown');assert.equal(sn.stage.querySelectorAll('.item-slot')[2].getAttribute('aria-pressed'),'true','grid navigation follows the phone two-column layout after rotation');sg.closeOverlay();
 console.log('✓ shop selection, prices, purchase, duplicate protection, insufficient balance, owned stamp, sale, rotation and E / Esc / Q');

 const messages=await launch({touch:true}),{game:mg,nodes:mn}=messages;const sparkChest=mg.map.entities.find(e=>e.id==='spark-chest');mg.state.sparks.push('spark-1','spark-2');mg.interact(sparkChest);
 assert.equal(mn.overlay.dataset.mode,'dialogue');assert.equal(mn.overlay.getAttribute('aria-labelledby'),'message-title');assert.equal(mn.stage.querySelectorAll('.spark-row')[0].children.length,12);assert.equal(mn.stage.querySelectorAll('.spark-row')[0].children.filter(n=>n.classList.contains('lit')).length,2);
 const line=mn.stage.querySelector('.message-text'),full=line.getAttribute('aria-label');assert.ok(line.textContent.length<full.length);messages.key('x');assert.equal(line.textContent,full);assert.equal(mn.overlay.hidden,false,'first key only completes the text');mn.stage.querySelector('.message-next').focus();messages.key('x');assert.equal(mn.overlay.hidden,true,'next key advances the short message, including with the arrow focused');
 mg.interact(mg.map.entities.find(e=>e.id==='estela'));const first=mn.stage.querySelector('.message-text');messages.key('e');assert.equal(first.textContent,first.getAttribute('aria-label'));messages.key('Enter');assert.notEqual(mn.stage.querySelector('.message-text').getAttribute('aria-label'),first.getAttribute('aria-label'));messages.runTime(1500);const auto=mn.stage.querySelector('.message-text');assert.equal(auto.textContent,auto.getAttribute('aria-label'),'typing completes quickly without input');mn['action-touch'].onclick();assert.notEqual(mn.stage.querySelector('.message-text'),auto,'touch action advances NPC dialogue');mg.closeOverlay();
 mg.state.flags.welcomed=true;mg.interact(mg.map.entities.find(e=>e.id==='estela'));assert.ok(mn.stage.querySelector('.message-choices'));messages.key(' ');messages.key('ArrowDown');messages.key('e');assert.equal(mn.overlay.hidden,true);assert.equal(mg.state.flags.travelReady,false,'stacked NPC choices retain their branch');
 mg.interact(mg.map.entities.find(e=>e.id==='guide'));messages.key('Escape');messages.runTime(2000);assert.equal(mn.overlay.hidden,true,'closed messages cannot restart from typing timers');
 console.log('✓ bottom message box, twelve-spark row, typewriter, any-key completion/advance, touch advance, NPC choices and timer cleanup');

 const bankApp=await launch({touch:false}),{game:bg,nodes:bn}=bankApp;bg.showBank();const amount=bn.stage.querySelector('input');assert.equal(amount.value,'10');findText(bn.stage,'+').click();assert.equal(amount.value,'11');findText(bn.stage,'−').click();assert.equal(amount.value,'10');findText(bn.stage,'5').click();assert.equal(amount.value,'5');findText(bn.stage,'Todo').click();assert.equal(amount.value,'60');findText(bn.stage,'Depositar').click();assert.equal(bg.state.tokens,0);assert.equal(bg.state.bank.balance,60);bankApp.runTime(400);assert.equal(bn.stage.querySelectorAll('.vault-column')[0].querySelector('strong').textContent,'0');assert.equal(bn.stage.querySelectorAll('.vault-column')[1].querySelector('strong').textContent,'60');
 findText(bn.stage,'10').click();findText(bn.stage,'Retirar').click();assert.equal(bg.state.tokens,10);assert.equal(bg.state.bank.balance,50);amount.value='2.5';findText(bn.stage,'Depositar').click();assert.equal(bg.state.tokens,10);amount.value='999';findText(bn.stage,'Retirar').click();assert.equal(bg.state.bank.balance,50);assert.ok(bn.stage.querySelector('.week-dial').getAttribute('aria-label').includes('semana'));
 bg.state.settings.testMode=true;bg.showBank();findText(bn.stage,'Avanzar una semana').click();assert.equal(bg.state.bank.balance,52);assert.equal(bg.state.tokens,10);bn['overlay-close'].onclick();assert.equal(bn.overlay.hidden,true);
 console.log('✓ bank stepper, 5 / 10 / Todo, transfers, count roll, invalid amount, weekly dial, interest test mode and close');

 const menus=await launch({width:1024,height:768,touch:true}),{game:ug,nodes:un}=menus;ug.showClock();assert.equal(un.stage.querySelectorAll('.clock-piece').length,8);menus.key('ArrowRight');assert.ok(un.stage.textContent.includes('Pronto'));ug.state.pieces.push('chapter-2');ug.showClock();assert.ok(un.stage.querySelectorAll('.clock-piece')[1].classList.contains('owned'));ug.closeOverlay();
 ug.showTravel();assert.equal(un.stage.querySelectorAll('.postcard').length,8);const travelLink=un.stage.querySelector('a');assert.ok(travelLink.href.includes('4rjPdYSBxNpHofQ8u5MU7s'));assert.equal(un.stage.querySelector('.postcard').querySelector('img').src.startsWith('data:image/webp'),true);menus.key('d');assert.equal(un.stage.querySelector('a'),null);assert.ok(un.stage.querySelector('.travel-bottom').textContent.includes('Pronto'));menus.key('Escape');
 ug.showReading();const bookText=un.stage.querySelector('.book-page').textContent;findText(un.stage,'Página siguiente →').click();assert.notEqual(un.stage.querySelector('.book-page').textContent,bookText);assert.equal(ug.state.sparks.filter(id=>id==='reading-spark').length,1);ug.closeOverlay();ug.showReading();assert.equal(ug.state.sparks.filter(id=>id==='reading-spark').length,1);ug.closeOverlay();
 ug.station('telescope');menus.runTime(1500);menus.key('Enter');assert.ok(un.stage.querySelector('.sky-map'));assert.equal(ug.state.sparks.filter(id=>id==='sky-spark').length,1);ug.closeOverlay();ug.showObjectives();assert.equal(un.stage.querySelectorAll('li').length,7);ug.closeOverlay();
 ug.showSettings();menus.key('Tab');assert.equal(menus.active(),un['overlay-close']);menus.key('Tab', 'keydown', {shiftKey:true});assert.equal(menus.active(),findText(un.stage,'Reiniciar progreso'));menus.key('Tab');assert.equal(menus.active(),un['overlay-close']);
 const touchToggle=un.stage.querySelectorAll('input').find(n=>n.getAttribute('aria-label')==='Controles táctiles');touchToggle.checked=false;touchToggle.events.change();ug.closeOverlay();const restoredTouch=await launch({saved:menus.storage.value});assert.equal(restoredTouch.game.state.settings.touchControls,false);
 console.log('✓ clock selection, travel postcards and locks, reading pages and unique rewards, sky chart, objectives, Tab focus trap and touch preference save');

 const noMotion=await launch({reduced:true,touch:false}),{game:rg,nodes:rn}=noMotion;rg.state.settings.sound=false;rg.showShop();const notes=noMotion.audio.notes.length;rn.stage.querySelector('[data-action="buy"]').click();assert.equal(rg.state.tokens,50);assert.equal(rn['window-wallet'].children[1].textContent,'50','reduced motion updates counts immediately');assert.equal(noMotion.audio.notes.length,notes,'sound toggle mutes menu sounds');assert.equal(noMotion.animations.length,0,'reduced motion skips item flight');rg.closeOverlay();rg.interact(rg.map.entities.find(e=>e.id==='guide'));const text=rn.stage.querySelector('.message-text');assert.equal(text.textContent,text.getAttribute('aria-label'));noMotion.key('e');assert.equal(rn.overlay.hidden,true,'reduced-motion text needs only the advance input');
 console.log('✓ reduced-motion instant counts and message text, and muted menu sounds');

 const practiceApp=await launch({touch:false,reduced:true}),{game:pg,nodes:pn}=practiceApp;pg.station('practice');practiceApp.key('e');assert.equal(pn['window-title'].textContent,'Práctica de la Academia');assert.ok(pn.stage.querySelector('.challenge'));
 const answerCurrent=()=>{const view=pg.dialogue,answer=view.variant;switch(view.beat.kind){
  case 'mc':{const nodes=pn.stage.querySelectorAll('.option');for(let i=0;i<answer.answer;i++)practiceApp.key('ArrowDown');assert.equal(nodes[answer.answer].getAttribute('aria-pressed'),'true');practiceApp.key('e');break;}
  case 'numeric':{const input=pn.stage.querySelector('input');input.value=String(answer.answer);input.events.input();findText(pn.stage,'Comprobar respuesta →').click();break;}
  case 'order':{const list=pn.stage.querySelector('.order-list');for(let target=0;target<answer.items.length;target++){let at=list.children.findIndex(n=>n.textContent.includes(answer.items[target]));while(at>target){list.children[at].querySelectorAll('button')[0].click();at--;}}findText(pn.stage,'Comprobar orden →').click();break;}
  case 'match':{const columns=pn.stage.querySelectorAll('.match-column');for(const [left,right] of answer.pairs){columns[0].children.find(n=>n.textContent===left).click();columns[1].children.find(n=>n.textContent===right).click();}findText(pn.stage,'Comprobar parejas →').click();break;}
  case 'grid':{const svg=pn.stage.querySelector('.coordinate-grid');const chosen=svg.children.find(n=>n.getAttribute('aria-label')===`(${answer.answer[0]}, ${answer.answer[1]})`);chosen.click();findText(pn.stage,'Comprobar coordenadas →').click();break;}
  case 'reading':{pn.stage.querySelectorAll('.reading-question').forEach((node,i)=>node.querySelectorAll('.option')[answer.questions[i].answer].click());findText(pn.stage,'Comprobar respuestas →').click();break;}
 }};
 for(let i=0;i<3;i++){answerCurrent();assert.equal(pg.dialogue.resolved,true);assert.ok(pn.stage.querySelector('.feedback'));assert.equal(pg.state.tokens,60+2*(i+1));findText(pn.stage,'Continuar la práctica →').click();}assert.equal(pg.dialogue.type,'line');practiceApp.key('e');assert.equal(pn.overlay.hidden,true);console.log('✓ parchment practice preserves input handlers, success feedback, three challenges and exact two-token rewards');

 // Controls moved into a fixed action strip must remain the actual controls, not clones.
 for(const c of pg.practiceCases){
  pg.practiceKind(c.kind,c.level,c.id);
  assert.equal(pg.dialogue.beat.kind,c.kind);assert.equal(pg.dialogue.level,c.level);
  const check=pn.stage.querySelector('.submit-action');
  assert.ok(check?.closest('.window-actions'),'submit belongs to the persistent strip: '+c.id+'/'+c.level);
  if(['numeric','match','grid','reading'].includes(c.kind))assert.equal(check.disabled,true,'incomplete answers remain disabled');
  const before=pg.state.tokens;answerCurrent();
  assert.equal(pg.dialogue.resolved,true,c.id+'/'+c.level);assert.equal(pg.state.tokens,before+2);
  assert.ok(findText(pn.stage,'Continuar la práctica →').closest('.window-actions'));
  findText(pn.stage,'Continuar la práctica →').click();assert.equal(pn.overlay.hidden,true);
 }
 pg.practiceKind('mc');const wrong=(pg.dialogue.variant.answer+1)%pg.dialogue.variant.options.length;
 pn.stage.querySelectorAll('.option')[wrong].click();assert.equal(pg.dialogue.stage,'hint');
 assert.ok(findText(pn.stage,'Volver a intentar →').closest('.window-actions'));
 findText(pn.stage,'Volver a intentar →').click();answerCurrent();assert.equal(pg.dialogue.resolved,true);pg.closeOverlay();
 pg.practiceKind('match');const cols=pn.stage.querySelectorAll('.match-column');cols[0].children[0].click();cols[1].children[0].click();
 assert.equal(cols[0].children[0].disabled,true);findText(pn.stage,'Rehacer las parejas').click();assert.equal(cols[0].children[0].disabled,false);assert.equal(pn.stage.querySelector('.submit-action').disabled,true);pg.closeOverlay();
 practiceApp.resize(1132,693,590);pg.practiceKind('mc');practiceApp.key('ArrowDown');assert.equal(pn.stage.querySelectorAll('.option')[2].getAttribute('aria-pressed'),'true','wide MC uses two-column keyboard navigation');pg.closeOverlay();
 assert.throws(()=>pg.practiceKind('missing'));assert.throws(()=>pg.practiceKind('mc','missing'));
 for(const open of [pg.showShop,pg.showBag,pg.showBank,pg.showClock,pg.showTravel,pg.showReading,pg.showObjectives,pg.showSettings]){
  open();const actions=pn.stage.querySelector('.window-actions');assert.ok(actions,'fixed actions for '+open.name);assert.ok(actions.querySelector('button,a[href]'),'real buttons/links remain in '+open.name);pg.closeOverlay();
 }
 assert.deepEqual(practiceApp.errors,[]);
 console.log('✓ all 33 challenge variants, disabled/complete answers, exact rewards, docked feedback/hints, reset pairs and two-column keyboard navigation');
 // TASK6 currency, map, travel and renderer lifecycle checks.
 const economy=await launch({touch:false}),{game:eg,nodes:en}=economy;
 assert.equal(en.copihues.children[1].textContent,'0');assert.ok(en.copihues.children[0].src.startsWith('data:image/svg+xml;base64,'));
 const svg=Buffer.from(en.copihues.children[0].src.split(',')[1],'base64').toString();assert.equal((svg.match(/<path/g)||[]).length,7);assert.ok(svg.includes('M13.4 10.4C11.6 15'));assert.ok(svg.includes('stroke="#1A1A2E"'));
 en.copihues.onclick();assert.ok(en.stage.querySelector('.message-text').getAttribute('aria-label').includes('no se compra con tokens'));assert.equal(en.toast.hidden,true);eg.closeOverlay();assert.equal(en.toast.hidden,true,'stale welcome stays dismissed');
 en['clock-hud'].onclick();assert.equal(en['window-title'].textContent,'Reloj de las Épocas');assert.equal(en.stage.querySelectorAll('.clock-piece').length,8);eg.closeOverlay();
 eg.showShop();findText(en.stage,'Colección copihue').click();assert.equal(en.stage.querySelectorAll('.item-slot').length,1,'outside the game only the pet collar is a copihue keepsake');assert.equal(en.stage.querySelector('[data-action="buy"]').disabled,true);assert.ok(en.stage.querySelector('.price-tag').querySelector('img').src.startsWith('data:image/svg+xml'));
 eg.state.copihues=3;eg.showShop(0,'','copihues');en.stage.querySelector('[data-action="buy"]').click();assert.equal(eg.state.copihues,2);assert.equal(eg.state.tokens,60);assert.ok(eg.state.items.some(i=>i.id==='collar_copihue'));
 eg.closeOverlay();
 const recovered=await launch({saved:economy.storage.value});assert.equal(recovered.game.state.copihues,2);assert.ok(recovered.game.state.items.some(i=>i.id==='collar_copihue'));
 eg.loadMap({id:'empty-map',unit:'CH',size:[20,9],floors:[{x:0,y:7.8,w:20,h:1.2,sprite:'suelo'}],entities:[{id:'spawn',type:'spawn',x:2,y:7.8}]});assert.equal(en.sparks.hidden,true);
 eg.loadMap({id:'spark-map',unit:'CH',size:[20,9],floors:[{x:0,y:7.8,w:20,h:1.2,sprite:'suelo'}],entities:[{id:'spawn',type:'spawn',x:2,y:7.8},{id:'local-spark',type:'collectible',x:4,y:7.15}]});assert.equal(en.sparks.hidden,false);assert.equal(en.sparks.children[1].textContent,'0/1','sparks belong to the current map');
 console.log('✓ exact copihue SVG, two currencies, tab prices, purchase, persistence, clock button, suppressed toasts and map-local sparks');
 const flight=await launch({width:1600,height:900,playHeight:852,touch:false}),{game:fg,nodes:fn}=flight;fg.showTravel();const link=fn.stage.querySelector('.travel-link'),destination=link.href;link.click();
 assert.ok(fg.travel);assert.equal(fn.overlay.hidden,true);assert.equal(fn['portal-flash'].hidden,false);assert.equal(flight.tabs.length,1);assert.equal(flight.tabs[0].href,'about:blank');assert.equal(flight.tabs[0].opener,null);
 const beforeX=fg.player.x;flight.key('ArrowRight');flight.frames(35);assert.equal(fg.player.x,beforeX);assert.equal(flight.tabs[0].href,'about:blank','no early travel');assert.ok(fg.travel.time<1.2);
 flight.frames(33);assert.ok(Number(fn['portal-flash'].style.opacity)>.9,'final white flash');flight.frames(12);assert.equal(fg.travel,null);assert.equal(flight.tabs[0].href,destination,'existing external travel destination runs after the sequence');assert.equal(flight.tabs[0].navigations,1);assert.equal(fn['portal-flash'].hidden,true);flight.frames(90);assert.equal(flight.tabs[0].navigations,1,'travel action runs once');
 for(const activate of ['keyboard','postcard']){fg.showTravel();if(activate==='keyboard')flight.key('Enter');else fn.stage.querySelector('.postcard').click();flight.frames(80);assert.equal(flight.tabs.at(-1).href,destination);assert.equal(flight.tabs.at(-1).navigations,1);}
 const calm=await launch({reduced:true});calm.game.showTravel();calm.nodes.stage.querySelector('.travel-link').click();assert.equal(calm.game.travel,null);assert.equal(calm.tabs.length,1);assert.equal(calm.tabs[0].href,destination);assert.equal(calm.nodes['portal-flash'].hidden,true,'reduced motion skips the flash');
 const blocked=await launch({popupBlocked:true});blocked.game.showTravel();blocked.nodes.stage.querySelector('.travel-link').click();assert.equal(blocked.game.travel,null);assert.equal(blocked.nodes.overlay.hidden,false);assert.equal(blocked.nodes.stage.querySelector('.message-link').href,destination,'blocked tabs retain a real travel link');
 console.log('✓ 1.2s travel, white flash, frozen controls, action once, keyboard/postcard activation, reduced motion and popup fallback');
 const renderer=await launch({width:1600,height:900,playHeight:852,touch:false});renderer.frames(5);assert.equal(renderer.nodes.mini.width,600);assert.equal(renderer.nodes.mini.height,120);assert.ok(renderer.game.portalEffect.particles<=160);assert.ok(renderer.game.portalEffect.resolution[0]<=320);
 Object.assign(renderer.game.player,{x:3100,y:780,ground:true});renderer.frames(120);const closePull=renderer.game.portalEffect.pull,phase=renderer.game.portalEffect.phase;assert.ok(closePull>.9);Object.assign(renderer.game.player,{x:4000,y:780,ground:true});renderer.frames(120);assert.ok(renderer.game.portalEffect.pull<.05);assert.ok(renderer.game.portalEffect.phase>phase);
 Object.assign(renderer.game.player,{x:5000,y:780,ground:true});renderer.resize(1600,900,852);renderer.frames(1);assert.ok(renderer.transforms.some(a=>JSON.stringify(a)==='[65,-1,8,63,41,74]'),'arcade content follows the measured affine screen basis');
 const still=await launch({reduced:true});still.frames(120);assert.equal(still.game.portalEffect.phase,0);assert.equal(still.game.portalEffect.pull,0);assert.deepEqual(renderer.errors,[]);assert.deepEqual(still.errors,[]);
 console.log('✓ sharp illustrated minimap, bounded offscreen vortex/particles, proximity response, affine arcade and static reduced motion');
 const loops=await launch({width:1600,height:900,playHeight:852,touch:false});
 const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
 function loopPaint(app,name,e){
  const meta=art[name],inputs=app.draws.filter(d=>meta.frameKeys.includes(d.name));assert.equal(inputs.length,2,name+' crossfades two frames');
  const index=meta.frameKeys.indexOf(inputs[0].name);assert.equal(inputs[1].name,meta.frameKeys[(index+1)%meta.frames]);
  assert.equal(inputs[0].composite,'source-over');assert.equal(inputs[1].composite,'lighter');close(inputs[0].alpha+inputs[1].alpha,1);
  const paint=app.draws.find(d=>d.img===inputs[0].canvas && d.canvas===app.nodes.view);assert.ok(paint,name+' is drawn in the world');
  const scale=e.h/meta.stand;close(paint.args[0],-meta.centerX*scale);close(paint.args[1],-meta.ground*scale);close(paint.args[3],meta.size[1]*scale);
  assert.equal(paint.flipX,app.game.player.x<e.x?-1:1);assert.equal(app.draws.some(d=>d.name===e.id || d.name==='mercader'),false,'static portrait is not a world sprite');return inputs;
 }
 for(const id of ['estela','merchant','tempo']){
  const e=loops.game.map.entities.find(e=>e.id===id);let surface;
  for(const side of [-1,1]){Object.assign(loops.game.player,{x:e.x+side*45,y:e.y,ground:true,vx:0});loops.resize(1600,900,852);loops.frames(1);const inputs=loopPaint(loops,e.animation,e);if(surface)assert.equal(inputs[0].canvas,surface,'reuse the loop surface');surface=inputs[0].canvas;}
  if(id!=='estela'){
   const calmNPC=await launch({width:1600,height:900,playHeight:852,touch:false,reduced:true});Object.assign(calmNPC.game.player,{x:e.x-45,y:e.y,ground:true});calmNPC.resize(1600,900,852);calmNPC.frames(1);
   const stillPaint=calmNPC.draws.find(d=>d.name===art[e.animation].frameKeys[0] && d.canvas===calmNPC.nodes.view);assert.ok(stillPaint);assert.equal(stillPaint.flipX,-1);calmNPC.frames(120);assert.equal(calmNPC.draws.filter(d=>art[e.animation].frameKeys.includes(d.name)).length,1);assert.equal(calmNPC.draws.some(d=>d.name && art[e.animation].frameKeys.slice(1).includes(d.name)),false);
  }
 }
 Object.assign(loops.game.player,{x:3100,y:780,ground:true});loops.resize(1600,900,852);loops.frames(1);
 const videoInputs=loops.draws.filter(d=>art.portal_video.frameKeys.includes(d.name));assert.equal(videoInputs.length,2);close(videoInputs[0].alpha+videoInputs[1].alpha,1);assert.equal(videoInputs[1].composite,'lighter');
 const vortexDraws=loops.draws.filter(d=>d.img===videoInputs[0].canvas);assert.equal(vortexDraws.length,3,'measured base, slight rotation, additive surge');const [l,t,r,b]=art.portal_video.sourceRect;assert.deepEqual(vortexDraws[0].args,[l,t,r-l,b-t]);assert.equal(vortexDraws[2].composite,'lighter');
 let npcWrapped=false,videoWrapped=false;
 for(let i=0;i<365;i++){
  Object.assign(loops.game.player,{x:3450,y:780,ground:true,vx:0});loops.resize(1600,900,852);loops.frames(1);
  for(const [name,set] of [['mercader_idle',v=>npcWrapped||=v],['portal_video',v=>videoWrapped||=v]]){const keys=art[name].frameKeys,inputs=loops.draws.filter(d=>keys.includes(d.name));if(name==='portal_video' && !inputs.length)continue;assert.equal(inputs.length,2);set(inputs[0].name===keys.at(-1)&&inputs[1].name===keys[0]);}
 }
 assert.ok(npcWrapped && videoWrapped,'both loops crossfade from the last retained frame to the first');
 const wheel=await launch({width:1600,height:900,playHeight:852,touch:false});Object.assign(wheel.game.player,{x:4420,y:780,ground:true});wheel.resize(1600,900,852);wheel.frames(1);
 const bankDraw=wheel.draws.find(d=>d.name==='banco' && d.args.length===8);assert.ok(bankDraw,'wheel uses the packed bank image');const packed=imageInfo.get(sources.banco).size;close(bankDraw.args[0],(265-118)*packed[0]/1804);close(bankDraw.args[1],(393-118)*packed[1]/687);
 loops.game.showBank();assert.equal(loops.nodes.stage.querySelector('.portrait').src,sources.tempo);loops.game.closeOverlay();loops.game.showShop();assert.equal(loops.nodes.stage.querySelector('.portrait').src,sources.mercader);
 wheel.key('Shift');wheel.key('d');Object.assign(wheel.game.player,{energy:1,vx:340,ground:true});wheel.frames(1);assert.equal(wheel.nodes['energy-wrap'].classList.contains('ready'),true);assert.equal(wheel.nodes['energy-label'].textContent,'¡Súper salto listo!');wheel.key(' ');wheel.frames(2);assert.equal(wheel.nodes['energy-wrap'].classList.contains('ready'),false);assert.ok(wheel.game.player.super);wheel.key('Shift','keyup');wheel.key('d','keyup');wheel.key(' ','keyup');
 loops.game.closeOverlay();Object.assign(loops.game.player,{x:4420,y:780,ground:true,vx:0});loops.resize(1600,900,852);loops.frames(2);assert.equal(loops.nodes.context.textContent,'Banco del Tiempo');assert.ok(/#context\{visibility:visible!important;[^}]*clip-path:inset\(50%\)/.test(page));
 assert.deepEqual(loops.errors,[]);
 console.log('✓ video/NPC fractional crossfades and loop seams, body-centred facing, feet anchors, static reduced motion, retained portraits, resized vault-wheel sampling and preserved ready/context states');
 // Audit regressions: synthetic geometry isolates the reported false positives.
 const auditSource=fs.readFileSync(__dirname+'/overflow.cjs','utf8'),measureCode=auditSource.slice(auditSource.indexOf('function measure()'),auditSource.indexOf('\nasync function advanceMessages'));
 function auditFixture(axis=null){
  const box=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
  const make=(id,tag,r,classes='',style={})=>({id,tagName:tag,className:classes,hidden:false,parentElement:null,children:[],childNodes:[],clientLeft:0,clientTop:0,clientWidth:r.width,clientHeight:r.height,scrollWidth:r.width,scrollHeight:r.height,style:{position:'static',overflowX:'visible',overflowY:'visible',scrollbarColor:'auto',...style},classList:{contains:c=>classes.split(' ').includes(c)},getBoundingClientRect:()=>r,getClientRects:()=>[r],getAttribute(name){return this.attributes?.[name];},closest(selector){for(let n=this;n;n=n.parentElement)if(selector.split(',').some(s=>s==='[hidden]'?n.hidden:s.startsWith('.')&&n.className.split(' ').includes(s.slice(1))))return n;return null;},contains(n){for(let p=n;p;p=p.parentElement)if(p===this)return true;return false;},querySelectorAll(selector){if(selector.includes('window-actions') || selector.includes('#window-title'))return [];const all=[];for(const c of this.children){all.push(c,...c.querySelectorAll(selector));}return all;},querySelector(selector){return this.querySelectorAll('*').find(n=>selector==='.message-text'&&n.className==='message-text');}});
  const win=make('game-window','DIV',box(0,0,300,200)),stage=make('stage','DIV',box(20,30,260,160),'',{overflowX:'hidden',overflowY:'hidden'}),message=make('message','P',box(40,60,100,30),'message-text'),sr=make('hidden-label','SPAN',box(0,0,1,1),'sr-only',{overflowX:'hidden',overflowY:'hidden'}),carousel=make('cards','DIV',box(40,120,220,50),'postcards',{overflowX:'auto',overflowY:'hidden'}),postcard=make('offscreen-postcard','BUTTON',box(500,120,100,40));
  const attach=(parent,...children)=>{for(const child of children){child.parentElement=parent;parent.children.push(child);}};
  attach(win,stage);attach(stage,message,sr,carousel);attach(carousel,postcard);
  stage.scrollHeight=260;stage.scrollWidth=900;sr.scrollWidth=800;sr.scrollHeight=200;carousel.scrollWidth=900;
  message.textContent='Mensaje completo';message.attributes={'aria-label':'Mensaje completo'};message.childNodes=[{nodeType:3,textContent:message.textContent,glyph:box(40,60,100,30)}];sr.childNodes=[{nodeType:3,textContent:'Etiqueta accesible',glyph:box(-200,0,800,30)}];
  if(axis){const bad=make('bad-image','IMG',axis==='x'?box(290,60,20,20):box(40,200,20,20));attach(stage,bad);}
  const doc={querySelector:selector=>selector==='#stage'?stage:selector==='#game-window'?win:{dataset:{mode:'dialogue'}},createRange:()=>({selectNodeContents(node){this.node=node;},getClientRects(){return [this.node.glyph];}}),documentElement:{scrollWidth:300}};
  return vm.runInNewContext(measureCode+';measure()',{document:doc,getComputedStyle:n=>n.style,innerWidth:300,innerHeight:200,SVGElement:class{},Node:{TEXT_NODE:3}});
 }
 const cleanAudit=auditFixture();assert.equal(cleanAudit.hiddenOverflow.length,0,'empty scrollHeight overflow is not clipping');assert.equal(cleanAudit.horizontal.length,1);assert.equal(cleanAudit.horizontal[0].allowedCarousel,true,'intentional carousel is allowed');
 assert.ok(auditFixture('x').horizontal.some(n=>n.clippedElements.includes('bad-image')),'real horizontal clipping stays a failure');assert.ok(auditFixture('y').hiddenOverflow.some(n=>n.clippedElements.includes('bad-image')),'real vertical clipping stays a failure');
 console.log('✓ audit ignores sr-only, intentional carousel and empty overflow, and detects real clipped images');
 {
  // Served under /academia/ with a signed-in student: the server's save and wallet win over
  // this browser's, every economic action is sent, and the local save is never written.
  const calls=[];let snapshot={firstName:'Ana',tokens:30,copihues:2,items:[],chests:[],bank:{balance:0,lastWeek:0},practiceLeft:1,state:{version:1,flags:{welcomed:true,metEstela:true},sparks:['spark-1']},introSeenAt:'2026-10-09T12:00:00Z',open:true};
  const server=async(url,options={})=>{const body=options.body?JSON.parse(options.body):undefined;calls.push([options.method,url,body]);
   if(url.endsWith('/shop/buy'))snapshot={...snapshot,tokens:snapshot.tokens-10,items:[{id:body.itemId,name:'Pañuelo',text:''}]};
   if(url.endsWith('/practice'))snapshot={...snapshot,tokens:snapshot.tokens+2,practiceLeft:0};
   return {ok:true,status:200,json:async()=>({snapshot})};};
  const local=JSON.stringify({version:1,tokens:999,copihues:0,bank:{balance:0,lastWeek:0},sparks:[],chests:[],items:[],flags:{}});
  const app=await launch({path:'/academia/',server,saved:local,touch:false}),{game:g,nodes:n}=app;
  app.storage.setItem=()=>{throw new Error('the local save must not be written');};
  assert.equal(g.state.tokens,30,'tokens come from the server, not the local save');assert.deepEqual([...g.state.sparks],['spark-1']);assert.deepEqual(calls[0],['GET','/api/academy/me',undefined]);
  g.showShop();n.stage.querySelector('[data-action="buy"]').click();await new Promise(setImmediate);
  assert.deepEqual(calls.at(-1),['POST','/api/academy/shop/buy',{itemId:'panuelo'}]);assert.equal(g.state.tokens,20);g.closeOverlay();
  app.runTime(2000);await new Promise(setImmediate);const put=calls.find(([method])=>method==='PUT');
  assert.ok(put && put[1]==='/api/academy/me/state' && put[2].state.sparks.includes('spark-1'),'exploration is uploaded after a save');
  g.station('practice');app.runTime(6000);assert.ok(findText(n.stage,'Práctica rápida'));findText(n.stage,'Ir a las Islas de retos').click();assert.equal(app.redirects.at(-1),'/alumno/islas','Training leads to the Islands of challenges');g.closeOverlay();
    g.showSettings();assert.ok(findText(n.stage,'Salir de la Academia'));assert.equal(findText(n.stage,'Reiniciar progreso'),null);findText(n.stage,'Salir de la Academia').click();assert.equal(app.redirects.at(-1),'/alumno');
  const fresh=await launch({path:'/academia/',server:async()=>({ok:true,status:200,json:async()=>({snapshot:{...snapshot,introSeenAt:null}})}),expectReady:false});
  assert.deepEqual(fresh.redirects,['/alumno/apertura'],'the first visit starts with the opening film');
  const closed=await launch({path:'/academia/',server:async()=>({ok:true,status:200,json:async()=>({snapshot:{...snapshot,open:false}})}),expectReady:false});
  assert.deepEqual(closed.redirects,['/alumno'],'while closed, students who are not test accounts go back');
  console.log('✓ server mode: remote save and wallet, purchases sent, no local save, Training to the islands, exit and first-visit film');
 }
 assert.ok(script.includes('estela_idle-71'));assert.equal(script.includes('estela_idle-72'),false);assert.ok(script.includes('objeto_medallon'));assert.ok(fs.statSync(__dirname+'/academia.html').size<15500000);
 console.log('UI lifecycle checks passed (DOM/Canvas shim; browser layout is not verified).');
})().catch(e=>{console.error(e);process.exitCode=1;});
