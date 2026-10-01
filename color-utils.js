(function(root){
  'use strict';
  function normalize(value){
    if(typeof value!=='string')return null;
    const hex=value.trim().replace(/^#/,'');
    if(/^[a-f0-9]{3}$/i.test(hex))return '#'+[...hex].map(c=>c+c).join('').toLowerCase();
    return /^[a-f0-9]{6}$/i.test(hex)?'#'+hex.toLowerCase():null;
  }
  function theme(value){
    const background=normalize(value)||'#b5ff24';
    const rgb=background.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
    const dark=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722<.179;
    return {background,dark,text:dark?'#ffffff':'#000000',muted:dark?'#ffffffb3':'#000000b3',border:dark?'#ffffff70':'#00000060'};
  }
  const api={normalize,theme};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BlazeColors=api;
})(typeof globalThis==='object'?globalThis:this);
