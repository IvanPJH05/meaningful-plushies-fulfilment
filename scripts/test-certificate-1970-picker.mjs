import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const code=await readFile(new URL('../theme-prototypes/certificate-1970-picker/assets/certificate-1970-picker.js',import.meta.url),'utf8');
const key='mp:certificate-choice:19701698520:v1';
function run({saved=null,search='',mode='picker',card='19701698520',blocked=false}={}){
 const memory=new Map(saved===null?[]:[[key,saved]]),redirects=[],links=['19701698520-1','19701698520-2'].map(id=>({dataset:{cardChoice:id},getAttribute:()=>'/pages/certificate/'+id,addEventListener(type,handler){this[type]=handler;}}));
 const dialog={shown:false,removeAttribute(){},showModal(){this.shown=true;},addEventListener(type,handler){this[type]=handler;}};
 const root={dataset:{mode,cardCode:card},querySelector:()=>dialog,querySelectorAll:()=>links};
 const window={localStorage:{getItem(k){if(blocked)throw Error('blocked');return memory.get(k)||null;},setItem(k,v){if(blocked)throw Error('blocked');memory.set(k,v);}},location:{origin:'https://meaningfulplushies.com',href:'https://meaningfulplushies.com/pages/certificate/'+card+search,replace(url){redirects.push(url);}}};
 vm.runInNewContext(code,{document:{querySelectorAll:()=>[root]},window,URL});
 return{memory,redirects,links,dialog};
}
let state=run();assert.equal(state.dialog.shown,true);assert.equal(state.redirects.length,0);
let prevented=false;state.links[1].click({button:0,preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(state.memory.get(key),'19701698520-2');assert.match(state.redirects[0],/19701698520-2$/);
state=run({saved:'19701698520-2'});assert.equal(state.dialog.shown,false);assert.match(state.redirects[0],/19701698520-2$/);
state=run({saved:'19701698520-2',search:'?choose=1'});assert.equal(state.dialog.shown,true);assert.equal(state.redirects.length,0);
state.links[0].click({button:0,preventDefault(){}});assert.equal(state.memory.get(key),'19701698520-1');
state=run({saved:'https://evil.example'});assert.equal(state.dialog.shown,true);assert.equal(state.redirects.length,0);
state=run({blocked:true});state.links[0].click({button:0,preventDefault(){}});assert.match(state.redirects[0],/19701698520-1$/);
state=run({mode:'certificate',card:'19701698520-1'});assert.equal(state.memory.get(key),'19701698520-1');assert.equal(state.redirects.length,0);
state=run({card:'other-certificate',saved:'19701698520-1'});assert.equal(state.dialog.shown,false);assert.equal(state.redirects.length,0);
console.log('Specific-card selection, remembered device choice, switching, blocked storage and redirect safety passed.');
