import {spawn,execFile} from 'node:child_process';
import {existsSync,mkdirSync,openSync,closeSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createConnection} from 'node:net';
import {promisify} from 'node:util';

const root=fileURLToPath(new URL('../',import.meta.url)),url='http://127.0.0.1:3000/';
async function ready(){
 try{const response=await fetch(url+'api/workspace',{signal:AbortSignal.timeout(1500)});const data=await response.json();return response.ok&&('user' in data);}
 catch{return false;}
}
try{
 if(!await ready()){
  const occupied=await new Promise(resolve=>{
   const socket=createConnection({host:'127.0.0.1',port:3000});socket.setTimeout(1000);
   socket.once('connect',()=>{socket.destroy();resolve(true);});
   for(const event of ['error','timeout'])socket.once(event,()=>{socket.destroy();resolve(false);});
  });
  if(occupied)throw Error('Port 3000 is already in use and Discovery is not responding. No second app was started.');
  if(!existsSync(path.join(root,'.next','BUILD_ID')))throw Error('The app needs a build first. Run npm run build in the Discovery folder.');
  const logs=path.join(root,'data','web-logs');mkdirSync(logs,{recursive:true});
  const out=openSync(path.join(logs,'launcher-output.log'),'a'),err=openSync(path.join(logs,'launcher-errors.log'),'a');
  const child=spawn(process.execPath,[path.join(root,'node_modules','next','dist','bin','next'),'start','--hostname','127.0.0.1'],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',out,err]});
  let startError;child.on('error',error=>{startError=error;});child.unref();closeSync(out);closeSync(err);
  let running=false;
  for(let attempt=0;attempt<50;attempt++){
   if(startError)throw startError;
   if(await ready()){running=true;break;}
   await new Promise(resolve=>setTimeout(resolve,300));
  }
  if(!running)throw Error('Discovery did not start. Check data/web-logs/launcher-errors.log.');
 }
 console.log('Discovery is ready at '+url);
 if(!process.argv.includes('--no-browser')){
  await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Start-Process -FilePath '${url}' -WindowStyle Normal -ErrorAction Stop`],{windowsHide:true});
 }
}catch(error){console.error(error.message);process.exitCode=1;}
