const KEY='quran-revision-v0.1.0';
const RECOVERY_KEY='quran-revision-recovery-v1';
const SNAPSHOT_INTERVAL_MS=60*60*1000;
const SNAPSHOT_MAX_AGE_MS=36*60*60*1000;
const SNAPSHOT_MAX=30;

export function loadState(fallback){
  try{const raw=localStorage.getItem(KEY);return raw?{...fallback,...JSON.parse(raw)}:fallback}catch{return fallback}
}
export function saveState(state){localStorage.setItem(KEY,JSON.stringify(state))}
export function resetState(){localStorage.removeItem(KEY)}

function readRecoverySnapshots(){
  try{
    const raw=localStorage.getItem(RECOVERY_KEY);
    const rows=raw?JSON.parse(raw):[];
    return Array.isArray(rows)?rows.filter(x=>x&&Number(x.capturedAt)&&x.state):[];
  }catch{return []}
}
function writeRecoverySnapshots(rows){
  try{localStorage.setItem(RECOVERY_KEY,JSON.stringify(rows));return true}catch{return false}
}
export function captureRecoverySnapshot({force=false,label='auto'}={}){
  try{
    const raw=localStorage.getItem(KEY);if(!raw)return false;
    const saved=JSON.parse(raw);const now=Date.now();let rows=readRecoverySnapshots().sort((a,b)=>b.capturedAt-a.capturedAt);
    if(!force&&rows[0]&&now-Number(rows[0].capturedAt)<SNAPSHOT_INTERVAL_MS)return false;
    const serialized=JSON.stringify(saved);
    if(rows[0]&&JSON.stringify(rows[0].state)===serialized&&!force)return false;
    rows.unshift({capturedAt:now,label,state:saved});
    rows=rows.filter(x=>now-Number(x.capturedAt)<=SNAPSHOT_MAX_AGE_MS).slice(0,SNAPSHOT_MAX);
    return writeRecoverySnapshots(rows);
  }catch{return false}
}
export function listRecoverySnapshots(){return readRecoverySnapshots().sort((a,b)=>b.capturedAt-a.capturedAt)}
export function findRecoverySnapshot(hoursAgo){
  const target=Date.now()-Math.max(1,Number(hoursAgo)||24)*60*60*1000;
  return listRecoverySnapshots().find(x=>Number(x.capturedAt)<=target)||null;
}
export function restoreRecoverySnapshot(capturedAt){
  try{
    const row=listRecoverySnapshots().find(x=>Number(x.capturedAt)===Number(capturedAt));if(!row)return false;
    localStorage.setItem(KEY,JSON.stringify(row.state));return true;
  }catch{return false}
}
