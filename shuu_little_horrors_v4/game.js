(() => {
'use strict';
const c = document.getElementById('game'), ctx = c.getContext('2d');
ctx.imageSmoothingEnabled = false;
const W=320,H=180,T=16;

const wrapEl=document.getElementById('wrap');
function fitGame(){
 const scale=Math.max(1,Math.min(3,Math.floor(Math.min(innerWidth*.96/W,innerHeight*.96/H))));
 wrapEl.style.width=(W*scale)+'px';
 wrapEl.style.height=(H*scale)+'px';
}
fitGame(); addEventListener('resize',fitGame);
const keys = new Set(), just = new Set();
let started=false, last=0;

const imgs={};
const files=['shuu_front','shuu_back','shuu_left','shuu_right','madoka_front','madoka_back','madoka_left','madoka_right'];
for(const n of files){ const i=new Image(); i.src='assets/'+n+'.png'; imgs[n]=i; }
const shuuSheets={
  front:{img:new Image(), cols:3, rows:3, frames:[0,1,2,3,4,5,6], bounds:[]},
  side:{img:new Image(), cols:2, rows:3, frames:[0,1,2,3,4,5], bounds:[]}
};
const shuuAnimationSheet=new Image();
shuuAnimationSheet.src='../shuu_animation_sheet_cropped.png';
const madokaAnimationSheet=new Image();
madokaAnimationSheet.src='../madoka_animation_sheet_cropped.png';
shuuSheets.front.img.src='../shuu_front_sheet.png';
shuuSheets.side.img.src='../shuu_side_sheet.png';

const state={
  room:'bedroom', phase:0, hasMed:false, gaveMed:false, hallucination:false,
  familyDead:false, epilogue:false, fade:0, fadeDir:0, objective:'Check on Madoka.',
  shots:0, shotFlash:0, glitch:0, motherTalk:false, doorLatch:false,
  checkedMadoka:false, secondMadokaTalk:false, endScreen:0, finalVoid:false, finalEnded:false,
  evidence:0, foundNote:false, sawPhoto:false, heardPhone:false, endingChoice:null
};
let playthrough=1;
const p={x:118,y:122,dir:'front',speed:54,walkPhase:0,moving:false};
let dialog=null, queued=[], choice=null, lock=false, eventTimer=0;

const rooms={
 bedroom:{ walls:[{x:28,y:28,w:264,h:124}], door:{x:144,y:144,w:32,h:8,to:'hall',spawn:[160,44]}, floor:'#19161a', wall:'#3a3036'},
 hall:{ walls:[{x:24,y:24,w:272,h:132}], doors:[
   {x:144,y:24,w:32,h:8,to:'bedroom',spawn:[160,134]},
   {x:24,y:78,w:8,h:32,to:'kitchen',spawn:[274,94]},
   {x:288,y:78,w:8,h:32,to:'foyer',spawn:[46,94]}
 ], floor:'#16171a', wall:'#303137'},
 kitchen:{ walls:[{x:20,y:24,w:276,h:132}], door:{x:288,y:78,w:8,h:32,to:'hall',spawn:[46,94]}, floor:'#161713', wall:'#343429'},
 foyer:{ walls:[{x:24,y:24,w:272,h:132}], door:{x:24,y:78,w:8,h:32,to:'hall',spawn:[274,94]}, floor:'#171414', wall:'#342a2a'},
 mother:{ walls:[{x:38,y:28,w:244,h:124}], floor:'#131216', wall:'#302b35'}
};

function say(lines, cb){ queued = lines.map(x=>typeof x==='string'?{s:'',t:x}:x); dialog={...queued.shift(),i:0,shown:'',tick:0,cb}; lock=true; }
function nextDialog(){
 if(!dialog) return;
 if(dialog.i < dialog.t.length){ dialog.i=dialog.t.length; dialog.shown=dialog.t; return; }
 if(queued.length){ dialog={...queued.shift(),i:0,shown:'',tick:0,cb:dialog.cb}; }
 else { const cb=dialog.cb; dialog=null; lock=false; if(cb) cb(); }
}
function obj(t){state.objective=t;}
function askChoice(prompt, options, cb){ choice={prompt,options,selected:0,cb}; lock=true; }
function finishTakingMedicine(){ state.hasMed=true; obj('Bring the medicine to Madoka.'); }
function resetRun(){
  Object.assign(state,{
    room:'bedroom', phase:0, hasMed:false, gaveMed:false, hallucination:false,
    familyDead:false, epilogue:false, fade:0, fadeDir:0, objective:'Check on Madoka.',
    shots:0, shotFlash:0, glitch:0, motherTalk:false, doorLatch:false,
      checkedMadoka:false, secondMadokaTalk:false, endScreen:0, finalVoid:false, finalEnded:false,
      foundNote:false, sawPhoto:false, heardPhone:false, endingChoice:null
  });
  p.x=118; p.y=122; p.dir='front'; p.walkPhase=0; p.moving=false;
  dialog=null; queued=[]; choice=null; lock=false; eventTimer=0;
}
function startGameEnd(){
  lock=true; state.fadeDir=1; state.endScreen=playthrough; state.finalVoid=false;
}

function transition(to,spawn){ state.fadeDir=1; lock=true; eventTimer=0.18; state._to=[to,spawn]; }
function completeTransition(){ const [to,sp]=state._to; state.room=to; p.x=sp[0]; p.y=sp[1]; state._to=null; state.doorLatch=true; state.fadeDir=-1; state.fade=1; lock=false; }

function solidRect(x,y,w,h){ return {x,y,w,h}; }
function roomSolids(){
 const a=[];
 if(state.room==='bedroom'){
   a.push(solidRect(192,48,76,42)); // bed
   a.push(solidRect(45,44,46,24));
   a.push(solidRect(46,104,36,26));
 } else if(state.room==='kitchen'){
   a.push(solidRect(45,43,95,24));
   a.push(solidRect(45,118,165,20));
   a.push(solidRect(235,43,34,72));
 } else if(state.room==='foyer'){
   a.push(solidRect(120,42,80,20));
 } else if(state.room==='mother'){
   a.push(solidRect(194,58,46,28));
 }
 return a;
}
function collides(nx,ny){
 const rx=nx-5, ry=ny-6, rw=10,rh=12;
 const room=rooms[state.room];
 const outer=room.walls[0];
 if(rx<outer.x+7||ry<outer.y+7||rx+rw>outer.x+outer.w-7||ry+rh>outer.y+outer.h-7) return true;
 for(const s of roomSolids()) if(rx<s.x+s.w&&rx+rw>s.x&&ry<s.y+s.h&&ry+rh>s.y) return true;
 return false;
}
function dist(x,y){ return Math.hypot(p.x-x,p.y-y); }
function interact(){
 if(dialog){nextDialog(); return;}
 if(lock) return;
 if(state.room==='bedroom' && dist(120,56)<30 && !state.foundNote){
   state.foundNote=true; state.evidence++;
   say([
    {s:'',t:'A paper is folded beneath the alarm clock.'},
    {s:'',t:'The handwriting is neat. Too neat.'},
    {s:'IKUE',t:'Shuu is a smart boy. He understands what happens when people make trouble.'},
    {s:'SHUU',t:'...That is not a rule.'}
   ],()=>obj('Check on Madoka.'));
   return;
  }
 if(state.room==='hall' && dist(82,52)<34 && !state.sawPhoto){
   state.sawPhoto=true; state.evidence++;
   say([
    {s:'',t:'A family photograph. Everyone is smiling except Yuutaro.'},
    {s:'',t:'The corner has been rubbed white, as if someone kept touching it.'},
    {s:'SHUU',t:'Dad did not look like that in my memories.'}
   ],()=>obj('Find Mum\'s special medicine in the kitchen.'));
   return;
  }
 if(state.room==='kitchen' && dist(34,70)<30 && !state.heardPhone){
   state.heardPhone=true; state.evidence++;
   beep(92,.22,'sine',.05);
   say([
    {s:'',t:'The telephone has been off the hook.'},
    {s:'',t:'There is no dial tone. Only a room breathing on the other end.'},
    {s:'MADOKA',t:'Shuu-niisan? Don\'t answer it.'}
   ],()=>obj('Find Mum\'s special medicine in the kitchen.'));
   return;
  }
 if(state.room==='bedroom'){
   if(dist(220,91)<34){
     if(!state.gaveMed && !state.hasMed && !state.checkedMadoka){
       state.checkedMadoka=true;
       say([{s:'SHUU',t:'Madoka?'},{s:'MADOKA',t:'Mm... I feel weird.'},{s:'MADOKA',t:'My head hurts.'},{s:'SHUU',t:'...I can get something.'}],()=>obj('Find Mum\'s special medicine in the kitchen.'));
     } else if(!state.gaveMed && !state.hasMed && state.checkedMadoka){
       if(playthrough===2 && !state.secondMadokaTalk){
         state.secondMadokaTalk=true;
         say([
           {s:'SHUU',t:state.evidence>=2?'I remember this room. I remember what comes after.':'What\'s the matter... cough...'},
           {s:'MADOKA',t:"What's the matter... cough..."},
           {s:'SHUU',t:"I don't think there's anything I can do about this..."},
           {s:'MADOKA',t:'...Shuu-niisan... do you hate me?'},
           {s:'SHUU',t:'...No.'},
           {s:'MADOKA',t:'But Aunt Ikue...'},
           {s:'SHUU',t:'...It\'s okay. Maybe I can find you some medicine...'}
         ],()=>obj('Find Mum\'s special medicine in the kitchen.'));
       } else {
         say([{s:'SHUU',t:'...I should get the medicine.'}]);
       }
     } else if(state.hasMed && !state.gaveMed){
       say([{s:'SHUU',t:'I found it.'},{s:'MADOKA',t:'Medicine?'},{s:'SHUU',t:'Mum uses it when things get bad.'},{s:'MADOKA',t:'...Okay. Thanks, Shuu.'}],()=>{
         state.gaveMed=true; state.hasMed=false; state.phase=2; obj('Stay with Madoka.'); eventTimer=4.2;
       });
     } else if(state.gaveMed && state.phase===2){ say([{s:'MADOKA',t:'Did you hear that?'},{s:'SHUU',t:'Hear what?'},{s:'MADOKA',t:'Someone is downstairs.'}]); }
     else if(state.familyDead){ say([{s:'MADOKA',t:'...Dad?'},{s:'MADOKA',t:'No.'},{s:'MADOKA',t:'No no no no—'}]); }
   }
 } else if(state.room==='kitchen'){
   if(dist(252,73)<30){
     if(!state.hasMed&&!state.gaveMed){
       say([{s:'',t:'The cabinet is too high.'},{s:'SHUU',t:'...Chair.'}],()=>{
         say([{s:'',t:'You drag the chair over.'},{s:'',t:'There are several bottles.'},{s:'SHUU',t:'This one.'},{s:'',t:'Mum uses this when things get bad.'}],()=>{
           if(playthrough===1){ finishTakingMedicine(); }
           else {
             askChoice('TAKE MEDICINE?', ['YES','NO'], (picked)=>{
               choice=null; lock=false;
               if(picked===0) finishTakingMedicine();
               else say([{s:'SHUU',t:"But I'm just a kid. ...So I take it anyway"}], finishTakingMedicine);
             });
           }
         });
       });
     } else say([{s:'',t:'Nothing else in here is for Madoka.'}]);
   }
 } else if(state.room==='foyer' && state.phase>=3 && !state.familyDead){
   // interactions intentionally fail during the catastrophe
   say([{s:'',t:"Madoka can't hear you."},{s:'SHUU',t:state.evidence>=3?'I know what this is. I know what it wants.':'Wait.'}]);
 } else if(state.room==='mother' && !state.motherTalk && dist(218,82)<35){
   state.motherTalk=true;
   say([
    {s:'SHUU',t:'Mum.'},{s:'IKUE',t:'What is it?'},{s:'SHUU',t:'I gave Madoka the medicine.'},
    {s:'SHUU',t:'I thought it would make her better.'},{s:'SHUU',t:'So... it was my fault.'},
    {s:'IKUE',t:'...I see.'},{s:'IKUE',t:'Do you understand now?'},{s:'SHUU',t:'What?'},
    {s:'IKUE',t:'That was the family your father chose.'},{s:'IKUE',t:'Her family.'},
    {s:'IKUE',t:'You were only trying to help. You are my son.'},{s:'IKUE',t:'Of course you were.'},
    {s:'',t:'She keeps talking.'},{s:'',t:'Shuu says nothing.'},
    {s:'SHUU',t:'Am I A Good Boy...?'}
   ],()=>{state.phase=99; startGameEnd();});
 }
}

function update(dt){
 if(!started) return;
 p.moving=false;
 if(dialog){
   dialog.tick += dt*40;
   const ni=Math.min(dialog.t.length,Math.floor(dialog.tick));
   if(ni!==dialog.i){dialog.i=ni;dialog.shown=dialog.t.slice(0,ni);}
 }
 if(state.fadeDir!==0){
   state.fade += state.fadeDir*dt*2.6;
   if(state.fadeDir>0&&state.fade>=1){ state.fade=1; if(state._to) completeTransition(); else if(state.phase===99){state.fadeDir=0;} }
   if(state.fadeDir<0&&state.fade<=0){state.fade=0;state.fadeDir=0;}
 }
 if(eventTimer>0){
   eventTimer-=dt;
   if(eventTimer<=0){
     if(state.gaveMed&&state.phase===2){
       state.phase=3; state.hallucination=true; state.glitch=1;
       say([{s:'MADOKA',t:'Shuu.'},{s:'MADOKA',t:'Someone came in.'},{s:'SHUU',t:'It\'s probably—'},{s:'MADOKA',t:'Don\'t.'}],()=>{obj('Follow Madoka.'); transition('foyer',[86,102]); setTimeout(()=>{},0);});
     } else if(state.phase===4){ doShot(); }
   }
 }
 if(state.glitch>0) state.glitch=Math.max(0,state.glitch-dt*.25);
 state.shotFlash=Math.max(0,state.shotFlash-dt*4);

 // Dialogue consumes the action key before movement is blocked.
 // Previously the early return below made open dialogue impossible to advance.
 const actionPressed=just.has('z')||just.has('Enter')||just.has(' ');

 // Choice prompts deliberately appear only on the second run. Movement keys select;
 // interact confirms. Saying NO does not grant Shuu control over the outcome.
 if(choice){
   if(just.has('ArrowLeft')||just.has('a')||just.has('ArrowUp')||just.has('w')) choice.selected=(choice.selected+choice.options.length-1)%choice.options.length;
   if(just.has('ArrowRight')||just.has('d')||just.has('ArrowDown')||just.has('s')) choice.selected=(choice.selected+1)%choice.options.length;
   if(actionPressed){ const cb=choice.cb, picked=choice.selected; cb(picked); }
   just.clear(); return;
 }

 // GAME END is a real break between loops. The first ending restarts the same
 // morning; the second opens Shuu's final internal dialogue and never restarts.
 if(state.endScreen && state.fade>=1){
   if(actionPressed){
     if(state.endScreen===1){
       playthrough=2; resetRun();
       say([
        {s:'',t:'The morning starts again.'},
        {s:'SHUU',t:state.evidence>=2?'I remember the paper. The photograph. The phone.':'I have been here before.'},
        {s:'',t:'Something in the house remembers you back.'}
       ],()=>obj('Check on Madoka.'));
     } else if(state.endScreen===2){
       state.endScreen=0; state.finalVoid=true; state.fadeDir=0; state.fade=0; lock=false;
       say([
         {s:'SHUU',t:'Am I too passive...? Am I too... stupid?'},
         {s:'SHUU',t:'Mama tells me I\'m a genius. ...I must be.'}
       ],()=>askChoice('WHAT DO YOU CALL IT?', ['MY FAULT','WHAT HAPPENED'], (picked)=>{
         state.endingChoice=picked===0?'fault':'truth';
         choice=null; lock=true; state.finalEnded=true;
       }));
     }
   }
   just.clear(); return;
 }

 let actionConsumed=false;
 if(dialog&&actionPressed){ nextDialog(); actionConsumed=true; }
 if(lock||dialog||state.fade>.8){ just.clear(); return; }

 let dx=0,dy=0;
 if(keys.has('ArrowLeft')||keys.has('a'))dx--;
 if(keys.has('ArrowRight')||keys.has('d'))dx++;
 if(keys.has('ArrowUp')||keys.has('w'))dy--;
 if(keys.has('ArrowDown')||keys.has('s'))dy++;
 if(dx||dy){
   p.moving=true;
   p.walkPhase=(p.walkPhase+dt*11)%(Math.PI*2);
   const l=Math.hypot(dx,dy);dx/=l;dy/=l;
   if(Math.abs(dx)>Math.abs(dy))p.dir=dx<0?'left':'right'; else p.dir=dy<0?'back':'front';
   const nx=p.x+dx*p.speed*dt, ny=p.y+dy*p.speed*dt;
   if(!collides(nx,p.y))p.x=nx;
   if(!collides(p.x,ny))p.y=ny;
 }
 handleDoors();
 if(actionPressed&&!actionConsumed) interact();
 just.clear();

 if(state.room==='foyer' && state.phase===3 && !state.familyDead && p.x>70){
   state.phase=4; lock=true; eventTimer=1.1; obj('');
 }
}
function doShot(){
 state.shots++; state.shotFlash=1;
 beep(70,.08,'square',.08);
 if(state.shots<3){eventTimer=1.0;} else {
   state.familyDead=true; state.hallucination=false; state.phase=5; state.glitch=1; lock=true;
   setTimeout(()=>{},0);
   say([{s:'MADOKA',t:'...?'},{s:'MADOKA',t:'Dad?'},{s:'MADOKA',t:'...Mum?'},{s:'MADOKA',t:'No.'},{s:'',t:'You say nothing.'}],()=>{
     state.epilogue=true; state.fadeDir=1; lock=true; state._to=['mother',[86,104]]; obj('');
   });
 }
}
function handleDoors(){
 const r=rooms[state.room]; const ds=r.doors||[r.door].filter(Boolean);
 const touching=d=>p.x>d.x-7&&p.x<d.x+d.w+7&&p.y>d.y-7&&p.y<d.y+d.h+7;
 // On arrival, the player must actually step away from the doorway before
 // that doorway can trigger again. This prevents room-to-room ping-pong.
 if(state.doorLatch){
   if(!ds.some(touching)) state.doorLatch=false;
   return;
 }
 for(const d of ds){
   if(touching(d)){
     if(state.room==='bedroom'&&state.phase===3) return;
     transition(d.to,d.spawn); return;
   }
 }
}

function rect(x,y,w,h,col){ctx.fillStyle=col;ctx.fillRect(x|0,y|0,w|0,h|0);}

// Tiny bitmap font. Canvas fillText is antialiased before the low-resolution
// canvas is enlarged, which made dialogue look smeared. Drawing the glyphs
// pixel-by-pixel keeps the UI as sharp as the sprites.
const FONT={
 'A':['01110','10001','10001','11111','10001','10001','10001'],
 'B':['11110','10001','10001','11110','10001','10001','11110'],
 'C':['01111','10000','10000','10000','10000','10000','01111'],
 'D':['11110','10001','10001','10001','10001','10001','11110'],
 'E':['11111','10000','10000','11110','10000','10000','11111'],
 'F':['11111','10000','10000','11110','10000','10000','10000'],
 'G':['01111','10000','10000','10111','10001','10001','01110'],
 'H':['10001','10001','10001','11111','10001','10001','10001'],
 'I':['11111','00100','00100','00100','00100','00100','11111'],
 'J':['00111','00010','00010','00010','10010','10010','01100'],
 'K':['10001','10010','10100','11000','10100','10010','10001'],
 'L':['10000','10000','10000','10000','10000','10000','11111'],
 'M':['10001','11011','10101','10101','10001','10001','10001'],
 'N':['10001','11001','10101','10011','10001','10001','10001'],
 'O':['01110','10001','10001','10001','10001','10001','01110'],
 'P':['11110','10001','10001','11110','10000','10000','10000'],
 'Q':['01110','10001','10001','10001','10101','10010','01101'],
 'R':['11110','10001','10001','11110','10100','10010','10001'],
 'S':['01111','10000','10000','01110','00001','00001','11110'],
 'T':['11111','00100','00100','00100','00100','00100','00100'],
 'U':['10001','10001','10001','10001','10001','10001','01110'],
 'V':['10001','10001','10001','10001','10001','01010','00100'],
 'W':['10001','10001','10001','10101','10101','10101','01010'],
 'X':['10001','10001','01010','00100','01010','10001','10001'],
 'Y':['10001','10001','01010','00100','00100','00100','00100'],
 'Z':['11111','00001','00010','00100','01000','10000','11111'],
 '0':['01110','10001','10011','10101','11001','10001','01110'],
 '1':['00100','01100','00100','00100','00100','00100','01110'],
 '2':['01110','10001','00001','00010','00100','01000','11111'],
 '3':['11110','00001','00001','01110','00001','00001','11110'],
 '4':['00010','00110','01010','10010','11111','00010','00010'],
 '5':['11111','10000','10000','11110','00001','00001','11110'],
 '6':['01110','10000','10000','11110','10001','10001','01110'],
 '7':['11111','00001','00010','00100','01000','01000','01000'],
 '8':['01110','10001','10001','01110','10001','10001','01110'],
 '9':['01110','10001','10001','01111','00001','00001','01110'],
 '.':['00000','00000','00000','00000','00000','00110','00110'],
 ',':['00000','00000','00000','00000','00110','00110','00100'],
 '!':['00100','00100','00100','00100','00100','00000','00100'],
 '?':['01110','10001','00001','00010','00100','00000','00100'],
 "'":['00100','00100','00000','00000','00000','00000','00000'],
 ':':['00000','00100','00100','00000','00100','00100','00000'],
 '-':['00000','00000','00000','11111','00000','00000','00000'],
 '/':['00001','00010','00010','00100','01000','01000','10000'],
 '(':['00010','00100','01000','01000','01000','00100','00010'],
 ')':['01000','00100','00010','00010','00010','00100','01000']
};
function cleanText(s){return String(s).toUpperCase().replace(/[—–]/g,'-').replace(/[“”]/g,'"').replace(/[‘’]/g,"'");}
function pixelMeasure(s,scale=1){return Math.max(0,cleanText(s).length*6*scale-scale);}
function text(s,x,y,col='#ddd',align='left',scale=1){
 s=cleanText(s); const width=pixelMeasure(s,scale);
 if(align==='center') x-=width/2; else if(align==='right') x-=width;
 x=Math.round(x); y=Math.round(y-7*scale+1); ctx.fillStyle=col;
 for(const ch of s){
   if(ch!==' '){
     const glyph=FONT[ch]||FONT['?'];
     for(let gy=0;gy<7;gy++) for(let gx=0;gx<5;gx++) if(glyph[gy][gx]==='1') ctx.fillRect(x+gx*scale,y+gy*scale,scale,scale);
   }
   x+=6*scale;
 }
}
function drawRoom(){
 const r=rooms[state.room]; rect(0,0,W,H,'#08080b'); const o=r.walls[0]; rect(o.x,o.y,o.w,o.h,r.wall); rect(o.x+7,o.y+7,o.w-14,o.h-14,r.floor);
 // grid / floor marks
 ctx.globalAlpha=.13; for(let y=o.y+12;y<o.y+o.h-8;y+=16)for(let x=o.x+12;x<o.x+o.w-8;x+=16)rect(x,y,1,1,'#aaa'); ctx.globalAlpha=1;
 if(state.room==='bedroom') drawBedroom();
 if(state.room==='hall') drawHall();
 if(state.room==='kitchen') drawKitchen();
 if(state.room==='foyer') drawFoyer();
 if(state.room==='mother') drawMother();
}
function drawDoorGap(x,y,w,h,label,side){
 rect(x,y,w,h,'#08080b');
 // pale threshold makes an opening read as a doorway without looking modern.
 if(side==='left') rect(x+w-1,y,1,h,'#6a6267');
 if(side==='right') rect(x,y,1,h,'#6a6267');
 if(side==='top') rect(x,y+h-1,w,1,'#6a6267');
 if(side==='bottom') rect(x,y,w,1,'#6a6267');
 if(label){
   if(side==='left') text(label,x+w+5,y-3,'#777078','left');
   else if(side==='right') text(label,x-5,y-3,'#777078','right');
   else if(side==='top') text(label,x+w/2,y+h+10,'#777078','center');
   else text(label,x+w/2,y-4,'#777078','center');
 }
}
function drawBedroom(){
 drawDoorGap(144,144,32,8,'HALL','bottom');
 rect(192,48,76,42,'#4a4248');rect(197,53,66,32,'#776b70');rect(198,54,27,12,'#c8beb2');
 rect(45,44,46,24,'#302d32'); rect(49,48,38,16,'#69616a');
 rect(46,104,36,26,'#322b2e');rect(50,108,28,18,'#4b3c40');
 rect(108,48,26,16,'#30282e'); rect(112,51,18,10,state.foundNote?'#b8a98f':'#6a5a63');
 if(!state.familyDead){ drawChar('madoka','right',222,72,2); }
 else drawChar('madoka','front',222,95,2);
}
function drawHall(){
 drawDoorGap(144,24,32,8,'BEDROOM','top');
 drawDoorGap(24,78,8,32,'KITCHEN','left');
 drawDoorGap(288,78,8,32,'FOYER','right');
 rect(58,50,50,5,'#29272b');rect(216,50,44,5,'#29272b');
 rect(72,42,20,18,'#4a3c45'); rect(75,45,14,12,state.sawPhoto?'#b7aa91':'#6a5965');
}
function drawKitchen(){
 drawDoorGap(288,78,8,32,'HALL','right');
 rect(45,43,95,24,'#39382e');rect(50,48,85,14,'#595645');
 rect(45,118,165,20,'#333329'); rect(235,43,34,72,'#312f28');
 for(let y=49;y<108;y+=18)rect(240,y,24,1,'#777262');
 text('CABINET',252,40,'#686353','center');
 if(!state.hasMed&&!state.gaveMed) rect(250,72,3,6,'#a9997a');
 rect(28,62,12,14,'#2a302d'); rect(30,64,8,7,state.heardPhone?'#8b766d':'#4d5149'); rect(34,76,2,5,'#171a18');
}
function drawFoyer(){
 drawDoorGap(24,78,8,32,'HALL','left');
 rect(120,42,80,20,'#312b2c'); rect(145,48,30,6,'#5a4d50');
 rect(262,66,8,56,'#2e2829');
 if(state.phase>=3&&!state.familyDead){
   if(state.hallucination){
     drawSilhouette(210,78); drawSilhouette(241,103); drawSilhouette(190,119);
     drawChar('madoka','right',158,100,2);
   }
 } else if(state.familyDead){
   drawBody(210,93); drawBody(241,124); drawBody(190,138); drawChar('madoka','front',158,103,2);
 }
}
function drawMother(){
 rect(194,58,46,28,'#37313d'); rect(199,63,36,18,'#5b5261');
 // mother as simple static silhouette
 rect(211,68,12,12,'#6b4b59');rect(207,80,20,20,'#29242c');rect(210,100,5,11,'#161419');rect(219,100,5,11,'#161419');
}
function drawSilhouette(x,y){rect(x-5,y-12,10,10,'#0a0809');rect(x-7,y-2,14,16,'#0a0809');}
function drawBody(x,y){rect(x-10,y,20,5,'#44363a');rect(x-14,y+4,28,4,'#241f21');}
function drawChar(who,dir,x,y,scale=2){ const im=imgs[who+'_'+dir]; if(!im.complete)return; const dw=im.width*scale,dh=im.height*scale; ctx.drawImage(im,Math.round(x-dw/2),Math.round(y-dh+8),dw,dh); }
function getVisibleBounds(img, sx=0, sy=0, sw=img.width, sh=img.height){
  const w=sw, h=sh;
  const c=document.createElement('canvas');
  c.width=w; c.height=h;
  const t=c.getContext('2d');
  t.drawImage(img,sx,sy,sw,sh,0,0,w,h);
  const data=t.getImageData(0,0,w,h).data;
  let minX=w, minY=h, maxX=-1, maxY=-1;
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const a=data[(y*w+x)*4+3];
      if(a>8){
        if(x<minX) minX=x;
        if(y<minY) minY=y;
        if(x>maxX) maxX=x;
        if(y>maxY) maxY=y;
      }
    }
  }
  if(maxX < 0) return {x:0,y:0,w,h};
  return {x:minX, y:minY, w:Math.max(1, maxX-minX+1), h:Math.max(1, maxY-minY+1)};
}
function drawShuuSheet(dir,x,y,scale){
  if(shuuAnimationSheet.complete && shuuAnimationSheet.width){
    const rowByDirection={front:0,back:1,left:2,right:3};
    const row=rowByDirection[dir] ?? 0;
    const cellW=shuuAnimationSheet.width/3;
    const cellH=shuuAnimationSheet.height/4;
    const moving=p.moving&&!dialog&&!lock;
    const vertical=dir==='front'||dir==='back';
    const frame=moving
      ? (vertical ? 1+Math.floor(p.walkPhase*1.35)%2 : Math.floor(p.walkPhase*1.35)%3)
      : 0;
    const dw=Math.round(cellW);
    const dh=Math.round(cellH);
    ctx.drawImage(shuuAnimationSheet,
      frame*cellW,row*cellH,cellW,cellH,
      Math.round(x-dw/2),Math.round(y-dh+8),dw,dh);
    return true;
  }
  const side=dir==='left'||dir==='right';
  const sheet=shuuSheets[side?'side':'front'];
  const img=sheet.img;
  if(!img.complete || !img.width || !img.height) return false;
  const cellW=img.width/sheet.cols, cellH=img.height/sheet.rows;
  const moving=p.moving&&!dialog&&!lock;
  const frame=sheet.frames[moving ? Math.floor(p.walkPhase*1.35)%sheet.frames.length : 0];
  const col=frame%sheet.cols, row=Math.floor(frame/sheet.cols);
  const key=frame+':'+cellW+':'+cellH;
  let bounds=sheet.bounds[key];
  if(!bounds){
    bounds=getVisibleBounds(img,col*cellW,row*cellH,cellW,cellH);
    sheet.bounds[key]=bounds;
  }
  const dh=Math.round(18*scale);
  const dw=Math.max(1,Math.round(bounds.w/bounds.h*dh));
  // The source side sheet faces right; mirror it only while moving left.
  const flip=dir==='left';
  ctx.save();
  if(flip) ctx.scale(-1,1);
  const drawX=flip?-(x+dw/2):x-dw/2;
  ctx.drawImage(img,
    col*cellW+bounds.x,row*cellH+bounds.y,bounds.w,bounds.h,
    Math.round(drawX),Math.round(y-dh+8),dw,dh);
  ctx.restore();
  return true;
}
function drawMadokaSheet(dir,x,y,scale){
  if(!madokaAnimationSheet.complete || !madokaAnimationSheet.width) return false;
  const rowByDirection={front:0,back:1,left:2,right:3};
  const row=rowByDirection[dir] ?? 0;
  const cellW=madokaAnimationSheet.width/3;
  const cellH=madokaAnimationSheet.height/4;
  const frame=0;
  const dw=Math.round(cellW);
  const dh=Math.round(cellH);
  ctx.drawImage(madokaAnimationSheet,
    frame*cellW,row*cellH,cellW,cellH,
    Math.round(x-dw/2),Math.round(y-dh+8),dw,dh);
  return true;
}
function drawChar(who,dir,x,y,scale=2){
  const im=imgs[who+'_'+dir];
  if(who==='shuu' && (dir==='front'||dir==='back'||dir==='left'||dir==='right') && drawShuuSheet(dir,x,y,scale)) return;
  if(who==='madoka' && (dir==='front'||dir==='back'||dir==='left'||dir==='right') && drawMadokaSheet(dir,x,y,scale)) return;
  if(!im || !im.complete || !im.width || !im.height) return;
  const bounds=getVisibleBounds(im);
  const dw=Math.max(1, Math.round(bounds.w*scale));
  const dh=Math.max(1, Math.round(bounds.h*scale));
  const sx=Math.round(x - dw/2);
  const sy=Math.round(y - dh + 8);
  ctx.drawImage(im, bounds.x, bounds.y, bounds.w, bounds.h, sx, sy, dw, dh);
}
function drawUI(){
 if(choice){
   rect(72,125,176,47,'#09090df2'); ctx.strokeStyle='#5d555d';ctx.lineWidth=1;ctx.strokeRect(72.5,125.5,175,46);
   text(choice.prompt,160,139,'#ddd','center');
   const leftX=126,rightX=194;
   text((choice.selected===0?'> ':'  ')+choice.options[0],leftX,158,choice.selected===0?'#ddd':'#777','center');
   text((choice.selected===1?'> ':'  ')+choice.options[1],rightX,158,choice.selected===1?'#ddd':'#777','center');
   return;
 }
 if(state.objective && !dialog && state.room!=='mother'){ rect(8,160,304,12,'#0a0a0dcc');text(state.objective,14,168,'#8f8990'); }
 if(playthrough===2 && state.evidence>0 && !dialog && !choice){
   text('O RESIDUE '+state.evidence+'/3',W-8,12,'#635b70','right');
 }
 if(dialog){
   rect(12,128,296,44,'#09090df2'); ctx.strokeStyle='#5d555d';ctx.lineWidth=1;ctx.strokeRect(12.5,128.5,295,43);
   if(dialog.s) text(dialog.s,20,139,'#a99aa6');
   wrap(dialog.shown,20,150,280,9,'#ddd');
   if(dialog.i>=dialog.t.length){rect(293,162,5,1,'#777');rect(294,163,3,1,'#777');rect(295,164,1,1,'#777');}
 }
}
function wrap(str,x,y,maxw,lh,col){ let line='';for(const word of cleanText(str).split(' ')){const t=line?line+' '+word:word;if(line&&pixelMeasure(t)>maxw){text(line,x,y,col);line=word;y+=lh;}else line=t;}if(line)text(line,x,y,col); }
function render(){
 if(state.finalVoid){
   rect(0,0,W,H,'#000');
   if(state.finalEnded){
     text('GAME END',160,84,'#aaa','center');
     text(state.endingChoice==='truth'?'YOU SAW IT.':'END.',160,105,'#5f5a60','center');
   } else {
     text('GAME END',160,56,'#777','center');
     drawUI();
   }
   return;
 }
 drawRoom();
  const usingSheet=shuuSheets.front.img.complete&&shuuSheets.front.img.width;
  const bob=!usingSheet&&p.moving&&!dialog&&!lock ? Math.round(Math.sin(p.walkPhase)*1.5) : 0;
  drawChar('shuu',p.dir,p.x,p.y+bob,2);
 if(state.glitch>0){ctx.globalAlpha=Math.min(.22,state.glitch*.2);for(let i=0;i<6;i++){const y=(Math.random()*H)|0;ctx.fillStyle=i%2?'#7f2f46':'#2d466a';ctx.fillRect((Math.random()*20-10)|0,y,W,2);}ctx.globalAlpha=1;}
 if(state.shotFlash>0){ctx.globalAlpha=state.shotFlash;rect(0,0,W,H,'#f1e3d0');ctx.globalAlpha=1;}
 drawUI();
 if(state.fade>0){ctx.globalAlpha=state.fade;rect(0,0,W,H,'#000');ctx.globalAlpha=1;}
 if(state.endScreen && state.fade>=1){
   text('GAME END',160,82,'#aaa','center');
   text(state.endScreen===1?'PRESS Z / ENTER':'PRESS Z / ENTER',160,104,'#5f5a60','center');
 }
}
function loop(ts){const dt=Math.min(.033,(ts-last)/1000||0);last=ts;update(dt);render();requestAnimationFrame(loop);}requestAnimationFrame(loop);

addEventListener('keydown',e=>{const k=e.key.length===1?e.key.toLowerCase():e.key;if(!keys.has(k))just.add(k);keys.add(k);if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Enter'].includes(e.key))e.preventDefault();});
addEventListener('keyup',e=>{const k=e.key.length===1?e.key.toLowerCase():e.key;keys.delete(k);});

document.getElementById('start').addEventListener('click',()=>{document.getElementById('start').style.display='none';started=true;beep(220,.05,'sine',.025);});

let ac=null;
function beep(freq,dur,type='square',vol=.04){try{ac??=new (AudioContext||webkitAudioContext)();const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(vol,ac.currentTime);g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+dur);o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+dur);}catch{}}
})();
