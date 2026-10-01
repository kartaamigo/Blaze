const fs=require('node:fs');
const {format}=require('node:util');
function installLogging(file,{streams=[process.stdout,process.stderr],logger=console}={}){
  const append=(level,...values)=>{try{fs.appendFileSync(file,`${new Date().toISOString()} [${level}] ${format(...values)}\n`);}catch{}};
  for(const stream of streams){
    if(!stream)continue;
    stream.on('error',error=>{if(!['EPIPE','ERR_STREAM_DESTROYED'].includes(error.code))append('stream',error.message);});
    const original=stream.write;
    stream.write=function(...args){try{return original.apply(this,args);}catch(error){if(['EPIPE','ERR_STREAM_DESTROYED'].includes(error.code))return false;throw error;}};
  }
  for(const level of ['log','info','warn','error','debug'])logger[level]=(...values)=>append(level,...values);
  return append;
}
module.exports={installLogging};
