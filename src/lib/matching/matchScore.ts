import calibration from './match-calibration.json';
export type MatchProvider='minilm'|'hashed';
export const MATCH_CALIBRATION=calibration;
export const DEFAULT_PARAMETERS={minilm:{c0:0.50,k:8},hashed:{c0:0.30,k:10}} as const;
export function logisticPercent(value:number,parameters:{c0:number;k:number}){return 100/(1+Math.exp(-parameters.k*(value-parameters.c0)));}
export function matchPercent(cosine:number,provider:MatchProvider):number{
 if(!Number.isFinite(cosine))throw new Error('Invalid stored match value');
 return Math.round(Math.max(1,Math.min(99,logisticPercent(cosine,calibration.providers[provider]))));
}
