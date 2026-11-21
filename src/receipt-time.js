'use strict';
function recordedTimes(card,member){
 const segments=Array.isArray(member?.segments)?member.segments:[];
 const first=segments.find(x=>Number.isFinite(x?.start));
 const start=Number.isFinite(member?.joinedAt)?member.joinedAt:(first?.start??(card?.members?.length===1?card?.startedAt:null));
 const last=segments.filter(x=>Number.isFinite(x?.end)).at(-1);
 const end=Number.isFinite(card?.endedAt)?card.endedAt:(card?.status==='ended'?last?.end:null);
 return {start,end};
}
module.exports={recordedTimes};
