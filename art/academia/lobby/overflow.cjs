'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const [,, file, out = '-', sizes = '1024x640,1132x693,1280x720,1366x768,1600x900,1920x1080,1024x768,400x820,360x740,820x400'] = process.argv;
if (!file || !path.isAbsolute(file)) {
  console.error('Usage: node overflow.cjs <absolute academia.html path> <shots directory or -> [1132x693,1024x768-touch,…]');
  process.exit(2);
}
const menus = ['practice', 'shop', 'bank', 'clock', 'travel', 'reading', 'items', 'sky', 'settings', 'gestures', 'objectives'];

// Measure real clipping ancestors, including the scrollport's inner border, on BOTH axes.
function measure() {
  const win = document.querySelector('#game-window'), stage = document.querySelector('#stage');
  const visible = n => n.getClientRects().length && !n.closest('[hidden],.sr-only');
  const label = n => n.id || (n.className?.baseVal ?? n.className) || n.tagName;
  const rect = n => {
    const r = n.getBoundingClientRect();
    return {left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height};
  };
  const clipped = n => {
    const r = rect(n), reasons = [];
    if (r.left < -1 || r.top < -1 || r.right > innerWidth+1 || r.bottom > innerHeight+1) reasons.push('viewport');
    for (let p=n.parentElement; p; p=p.parentElement) {
      const s=getComputedStyle(p), pr=p.getBoundingClientRect();
      const left=pr.left+p.clientLeft, top=pr.top+p.clientTop;
      if (['auto','scroll','hidden','clip'].includes(s.overflowX) && (r.left<left-1 || r.right>left+p.clientWidth+1)) reasons.push(label(p)+':x');
      if (['auto','scroll','hidden','clip'].includes(s.overflowY) && (r.top<top-1 || r.bottom>top+p.clientHeight+1)) reasons.push(label(p)+':y');
    }
    return reasons;
  };
  if (!visible(win)) return {error:'No window'};
  // scrollHeight can include ribbon/positioned geometry even when no content is cut off.
  // Report hidden overflow only with an actual text/control/image rect outside the clip.
  const material = (n,axis) => [n,...n.querySelectorAll('p,span,strong,small,h3,li,button,a,input,select,textarea,img,canvas,.item-slot')].filter(c=>{
    if(!visible(c) || c.closest('.sr-only') || axis==='x' && c.closest('.postcards') || ['absolute','fixed'].includes(getComputedStyle(c).position))return false;
    for(let p=c.parentElement;p && p!==n;p=p.parentElement){const style=getComputedStyle(p);if(['auto','scroll'].includes(style.overflowX) || ['auto','scroll'].includes(style.overflowY))return false;}
    return true;
  });
  const outside = (n,axis) => {
    const pr=rect(n),low=axis==='x'?pr.left+n.clientLeft:pr.top+n.clientTop,high=low+(axis==='x'?n.clientWidth:n.clientHeight),found=[];
    for(const c of material(n,axis)){
      const boxes=[];
      if(c!==n && ['BUTTON','A','INPUT','SELECT','TEXTAREA','IMG','CANVAS'].includes(c.tagName))boxes.push(rect(c));
      // Range reads the actual rendered glyph rectangles, including plain leaf text.
      for(const child of c.childNodes)if(child.nodeType===Node.TEXT_NODE && child.textContent.trim()){const range=document.createRange();range.selectNodeContents(child);boxes.push(...range.getClientRects());}
      if(boxes.some(r=>axis==='x'?r.left<low-2 || r.right>high+2:r.top<low-2 || r.bottom>high+2))found.push(label(c));
    }
    return [...new Set(found)];
  };
  const scrolling=[], horizontal=[], hiddenOverflow=[];
  for (const n of [stage,...stage.querySelectorAll('*')]) {
    if (!visible(n) || !n.clientWidth || !n.clientHeight || n instanceof SVGElement) continue;
    const s=getComputedStyle(n), y=n.scrollHeight>n.clientHeight+2, x=n.scrollWidth>n.clientWidth+2;
    if (y && ['auto','scroll'].includes(s.overflowY)) scrolling.push({element:label(n),height:n.clientHeight,scrollHeight:n.scrollHeight,insideStage:stage.contains(n),styled:s.scrollbarColor!=='auto'});
    if (x && ['auto','scroll','hidden','clip'].includes(s.overflowX)) {
      const allowedCarousel=n.classList.contains('postcards'),elements=allowedCarousel?[]:outside(n,'x');
      if(allowedCarousel || elements.length)horizontal.push({element:label(n),width:n.clientWidth,scrollWidth:n.scrollWidth,allowedCarousel,clippedElements:elements});
    }
    if (y && ['hidden','clip'].includes(s.overflowY)) {const elements=outside(n,'y');if(elements.length)hiddenOverflow.push({element:label(n),height:n.clientHeight,scrollHeight:n.scrollHeight,clippedElements:elements});}
  }
  const actions=[...stage.querySelectorAll('.window-actions button,.window-actions a[href],button.primary,a.travel-link,.message-next,.message-link')].filter(visible).map(n=>({text:n.textContent || n.getAttribute('aria-label'),disabled:n.disabled||false,rect:rect(n),clippedBy:clipped(n)}));
  const chrome=[...win.querySelectorAll('#window-title,#overlay-close,#window-wallet')].filter(visible).map(n=>({element:label(n),rect:rect(n),clippedBy:clipped(n)}));
  const message=stage.querySelector('.message-text');
  const messageFit=message?{text:message.textContent,full:message.textContent===message.getAttribute('aria-label'),clippedBy:clipped(message)}:null;
  return {mode:document.querySelector('#overlay').dataset.mode,window:rect(win),stage:{width:stage.clientWidth,height:stage.clientHeight,scrollWidth:stage.scrollWidth,scrollHeight:stage.scrollHeight},scrolling,horizontal,hiddenOverflow,actions,chrome,message:messageFit,documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth};
}

async function advanceMessages(page) {
  // First press may complete typing; the next actually advances the dialogue.
  for (let i=0;i<12;i++) {
    const mode=await page.evaluate(()=>document.querySelector('#overlay').dataset.mode);
    if(mode!=='dialogue') return;
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
  }
  throw new Error('Intro did not advance to its real window');
}

(async () => {
  let browser;
  const results=[];
  if (out!=='-') fs.mkdirSync(out,{recursive:true});
  try {
    browser=await chromium.launch({chromiumSandbox:false,args:['--no-sandbox','--disable-setuid-sandbox']});
    for (const size of sizes.split(',')) {
      const match=/^(\d+)x(\d+)(-touch)?$/.exec(size);
      if(!match) throw new Error('Invalid viewport: '+size);
      const [,ws,hs,explicitTouch]=match, w=Number(ws), h=Number(hs);
      const desktop=w>=1024 && h>=640;
      const touch=!!explicitTouch || !desktop || (w===1024 && h===768);
      const page=await browser.newPage({viewport:{width:w,height:h},hasTouch:touch,isMobile:touch,reducedMotion:'reduce'});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(pathToFileURL(file).href,{waitUntil:'load'});
      await page.waitForFunction(()=>window.Academia && document.querySelector('#loading').hidden);
      await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,1500))]));
      const hud=await page.evaluate(()=>{
        const h=document.querySelector('#lobby-hud'),r=h.getBoundingClientRect(),buttons=[...h.querySelectorAll('button')].filter(n=>!n.hidden);
        return {height:r.height,rows:new Set(buttons.map(n=>Math.round(n.getBoundingClientRect().top))).size,smallTouch:buttons.filter(n=>n.getBoundingClientRect().width<44 || n.getBoundingClientRect().height<44).map(n=>n.id),overflow:document.documentElement.scrollWidth>innerWidth};
      });
      const hudFailures=[];if(w>=1024 && (hud.rows!==1 || hud.height>52))hudFailures.push('Desktop HUD must fit one slim row');if(w<=600 && (hud.rows>2 || hud.smallTouch.length))hudFailures.push('Phone HUD needs at most two rows and 44px targets');if(hud.overflow)hudFailures.push('HUD horizontal overflow');
      results.push({size,name:'hud',failures:hudFailures,errors:[...errors],...hud});console.log(`${hudFailures.length?'FAIL':'PASS'} ${size} hud: ${hud.height}px, ${hud.rows} rows ${hudFailures.join('; ')}`);
      const check=async (name, expected='panel')=>{
        await page.waitForTimeout(70);
        // Always measure the initial, unscrolled view, even after arrow/focus navigation.
        await page.evaluate(()=>document.querySelectorAll('#stage, .window-content').forEach(n=>{n.scrollTop=0;n.scrollLeft=0;}));
        const m=await page.evaluate(measure), failures=[];
        if(m.error) failures.push(m.error);
        else {
          if(m.mode!==expected) failures.push('Expected '+expected+', got '+m.mode);
          if(desktop && m.scrolling.length) failures.push('Desktop/tablet scrolling');
          if(!desktop && m.scrolling.some(n=>!n.insideStage || !n.styled)) failures.push('Phone scroll must be internal and styled');
          if(m.hiddenOverflow.length) failures.push('Content clipped vertically');
          if(m.horizontal.some(n=>!n.allowedCarousel) || m.documentWidth>w) failures.push('Horizontal overflow');
          if(m.actions.some(n=>n.clippedBy.length)) failures.push('Primary action clipped');
          if(m.chrome.some(n=>n.clippedBy.length)) failures.push('Ribbon/close/wallet clipped');
          if(m.message && (!m.message.full || m.message.clippedBy.length)) failures.push('Message text clipped/incomplete');
          const wr=m.window;if(wr.left<0 || wr.top<0 || wr.right>w+1 || wr.bottom>h+1) failures.push('Window outside viewport');
          if(name.startsWith('practice-') && !m.actions.length) failures.push('Missing practice action');
        }
        const result={size,touch,desktop,name,...m,failures,errors:[...errors]};results.push(result);
        console.log(`${failures.length||errors.length?'FAIL':'PASS'} ${size} ${name}: stage ${m.stage?.scrollHeight}/${m.stage?.height}; y=${m.scrolling?.map(n=>n.element+':'+n.scrollHeight+'/'+n.height).join(',')||'-'}; x=${m.horizontal?.map(n=>n.element+(n.allowedCarousel?'(carousel)':'')).join(',')||'-'}; actions=${m.actions?.length??0} ${failures.join('; ')}`);
        if(out!=='-') await page.screenshot({path:path.join(out,`${size}-${name}.png`)});
      };
      for(const menu of menus) {
        await page.evaluate(menu=>{
          const A=Academia;A.closeOverlay();
          if(menu==='items')A.showBag();else if(menu==='gestures')document.querySelector('#gestures').click();
          else if(menu==='objectives')A.showObjectives();else if(menu==='settings')A.showSettings();
          else A.station(menu==='sky'?'telescope':menu);
        },menu);
        if(menu==='practice' || menu==='sky') {
          await check(menu+'-message','dialogue');
          await advanceMessages(page);
        }
        await check(menu);
      }
      // Every source beat at all three levels, plus the order example absent from cap1.
      const cases=await page.evaluate(()=>Academia.practiceCases);
      if(!cases?.length) throw new Error('This build needs Academia.practiceKind / practiceCases');
      for(const c of cases) {
        await page.evaluate(c=>{Academia.closeOverlay();Academia.practiceKind(c.kind,c.level,c.id);},c);
        await check(`practice-${c.kind}-${c.id}-${c.level}`);
      }
      // Exercise feedback/continue and hint/try-again layouts for each input kind.
      for(const kind of ['mc','numeric','match','order','grid','reading']) {
        await page.evaluate(kind=>Academia.practiceKind(kind,'avanzado'),kind);
        await page.evaluate(()=>{
          const view=Academia.dialogue,v=view.variant,stage=document.querySelector('#stage');
          switch(view.beat.kind){
            case 'mc':stage.querySelectorAll('.option')[v.answer].click();break;
            case 'numeric':{const n=stage.querySelector('input');n.value=String(v.answer);n.dispatchEvent(new Event('input'));stage.querySelector('.submit-action').click();break;}
            case 'match':{const cols=stage.querySelectorAll('.match-column');for(const [left,right] of v.pairs){[...cols[0].children].find(n=>n.textContent===left).click();[...cols[1].children].find(n=>n.textContent===right).click();}stage.querySelector('.submit-action').click();break;}
            case 'order':{const list=stage.querySelector('.order-list');for(let target=0;target<v.items.length;target++){let at=[...list.children].findIndex(n=>n.querySelector('.order-text').textContent===v.items[target]);while(at>target){list.children[at].querySelector('button').click();at--;}}stage.querySelector('.submit-action').click();break;}
            case 'grid':stage.querySelector(`[aria-label="(${v.answer.join(', ')})"]`).dispatchEvent(new Event('click'));stage.querySelector('.submit-action').click();break;
            case 'reading':stage.querySelectorAll('.reading-question').forEach((n,i)=>n.querySelectorAll('.option')[v.questions[i].answer].click());stage.querySelector('.submit-action').click();break;
          }
        });
        await check(`practice-${kind}-feedback`);
      }
      await page.evaluate(()=>{Academia.practiceKind('mc');const v=Academia.dialogue;document.querySelectorAll('.option')[(v.variant.answer+1)%v.variant.options.length].click();});
      await check('practice-mc-hint');
      // All book pages and a populated bag/owned shop state use different content.
      await page.evaluate(()=>Academia.showReading());
      for(let i=1;i<3;i++){await page.getByRole('button',{name:'Página siguiente →'}).click();await check('reading-page-'+i);}
      await page.evaluate(()=>{Academia.state.items.push(...Academia.map.catalog.filter(item=>!Academia.state.items.some(owned=>owned.id===item.id)));while(Academia.state.items.length<12)Academia.state.items.push({id:'audit-'+Academia.state.items.length,name:'Recuerdo de viaje',text:'Un recuerdo para tu próxima aventura.',icon:'objeto_brujula'});Academia.showBag();});
      await check('items-populated');
      await page.evaluate(()=>Academia.showShop());await check('shop-owned');
      await page.evaluate(()=>{Academia.state.settings.testMode=true;Academia.showBank();});await check('bank-test-mode');
      await page.evaluate(()=>Academia.showShop(0,'','copihues'));await check('shop-copihues');
      await page.evaluate(()=>{Academia.closeOverlay();document.getElementById('clock-hud').click();});await check('clock-hud');
      for(const id of ['tokens','copihues','sparks']){await page.evaluate(id=>{Academia.closeOverlay();document.getElementById(id).click();},id);await check('message-'+id,'dialogue');}
      await page.close();
    }
    const failed=results.filter(r=>r.failures.length||r.errors.length);
    console.log(`${results.length} checks; ${failed.length} failures.`);
    if(out!=='-')fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify({status:failed.length?'failed':'passed',results},null,2)+'\n');
    if(failed.length)process.exitCode=1;
  } catch(error) {
    const status=browser?'audit-error':'browser-unavailable';
    console.error(`${status}: ${error.message}`);
    if(out!=='-')fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify({status,error:error.message,results},null,2)+'\n');
    process.exitCode=1;
  } finally {await browser?.close();}
})();
