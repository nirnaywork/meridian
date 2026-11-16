import {DEFAULT_PARAMETERS,logisticPercent} from '../src/lib/matching/matchScore';
type Pair={cosine:number;relevant:boolean};
export function fitLogistic(pairs:Pair[]){
 let b=-4,k=8;
 const loss=(b:number,k:number)=>pairs.reduce((s,p)=>{const z=b+k*p.cosine;return s+Math.max(z,0)-(p.relevant?z:0)+Math.log1p(Math.exp(-Math.abs(z)));},0)+1e-6*k*k/2;
 for(let iteration=0;iteration<200;iteration++){
  let gb=0,gk=1e-6*k,hbb=1e-10,hbk=0,hkk=1e-6;
  for(const row of pairs){const x=row.cosine,p=1/(1+Math.exp(-(b+k*x))),d=p-Number(row.relevant),w=p*(1-p);gb+=d;gk+=d*x;hbb+=w;hbk+=w*x;hkk+=w*x*x;}
  const det=hbb*hkk-hbk*hbk,db=(hkk*gb-hbk*gk)/det,dk=(hbb*gk-hbk*gb)/det;
  if(!Number.isFinite(db+dk))break;let step=1;while(step>1e-8&&loss(b-step*db,k-step*dk)>loss(b,k))step/=2;
  b-=step*db;k-=step*dk;if(Math.abs(step*db)+Math.abs(step*dk)<1e-9)break;
 }
 return {c0:-b/k,k};
}
export function calibrationReport(report:{provider:'minilm'|'hashed';relevant:{median:number};irrelevant:{mean:number};records:Pair[]}){
 const fitted=fitLogistic(report.records),anchors={irrelevantMeanBelow30:logisticPercent(report.irrelevant.mean,fitted)<30,relevantMedianAbove90:logisticPercent(report.relevant.median,fitted)>90,point20Below15:logisticPercent(.2,fitted)<15,strictlyIncreasing:Number.isFinite(fitted.k)&&fitted.k>0};
 const accepted=Object.values(anchors).every(Boolean),selected=accepted?fitted:DEFAULT_PARAMETERS[report.provider];
 return {...report,fitted,anchors,accepted,selected,table:[.2,.34,.5,.57,.62,.87].map(cosine=>({cosine,matchPercent:Math.round(Math.max(1,Math.min(99,logisticPercent(cosine,selected))))}))};
}
