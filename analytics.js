(function(root){
  const key=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  function keys(end,period){
    const result=[],date=new Date(end+'T12:00:00+03:00');
    if(period==='year'){for(let i=0;i<12;i++){const d=new Date(date);d.setUTCDate(1);d.setUTCMonth(date.getUTCMonth()-11+i);result.push(key(d).slice(0,7));}}
    else{const count=period==='month'?new Date(date.getUTCFullYear(),date.getUTCMonth()+1,0).getDate():7;for(let i=0;i<count;i++){const d=new Date(date);d.setUTCDate(date.getUTCDate()-count+1+i);result.push(key(d));}}
    return result;
  }
  function aggregate(activity,focus,end,period,native){
    const periods=keys(end,period),totals=periods.map(()=>0),apps={};
    for(const [day,entries] of Object.entries(native?activity:focus)){
      const index=periods.indexOf(period==='year'?day.slice(0,7):day);if(index<0)continue;
      if(native)for(const [name,seconds] of Object.entries(entries)){totals[index]+=seconds;apps[name]=(apps[name]||0)+seconds;}
      else totals[index]+=Number(entries)||0;
    }
    const total=totals.reduce((a,b)=>a+b,0);
    return {keys:periods,totals,apps,total,average:total/(period==='year'?365:periods.length)};
  }
  const api={keys,aggregate};if(typeof module==='object'&&module.exports)module.exports=api;else root.BlazeAnalytics=api;
})(globalThis);

