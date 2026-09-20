'use strict';

// ---- storage.js ----
const KEY='quran-revision-v0.1.0';
const RECOVERY_KEY='quran-revision-recovery-v1';
const SNAPSHOT_INTERVAL_MS=60*60*1000;
const SNAPSHOT_MAX_AGE_MS=36*60*60*1000;
const SNAPSHOT_MAX=30;

function loadState(fallback){
  try{const raw=localStorage.getItem(KEY);return raw?{...fallback,...JSON.parse(raw)}:fallback}catch{return fallback}
}
function saveState(state){localStorage.setItem(KEY,JSON.stringify(state))}
function resetState(){localStorage.removeItem(KEY)}

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
function captureRecoverySnapshot({force=false,label='auto'}={}){
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
function listRecoverySnapshots(){return readRecoverySnapshots().sort((a,b)=>b.capturedAt-a.capturedAt)}
function findRecoverySnapshot(hoursAgo){
  const target=Date.now()-Math.max(1,Number(hoursAgo)||24)*60*60*1000;
  return listRecoverySnapshots().find(x=>Number(x.capturedAt)<=target)||null;
}
function restoreRecoverySnapshot(capturedAt){
  try{
    const row=listRecoverySnapshots().find(x=>Number(x.capturedAt)===Number(capturedAt));if(!row)return false;
    localStorage.setItem(KEY,JSON.stringify(row.state));return true;
  }catch{return false}
}

// ---- utils.js ----
function stars(n=0){return '★'.repeat(n)+'☆'.repeat(Math.max(0,5-n))}
function todayLabel(){return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date())}
function shortToday(){return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(new Date())}
function strengthScore(s){
  const total=Math.max(1,s.ayahCount||s.ayahs?.length||1);const red=(s.redAyahs||[]).length;const greenRatio=(total-red)/total;const rating=(s.rating||0)/5;
  if(!s.rating && !(s.logs||[]).length)return greenRatio*30;
  return greenRatio*70+rating*30;
}
function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

// ---- quran-provider.js ----
const TEXT_API='https://api.alquran.cloud/v1';
const MP3QURAN='https://www.mp3quran.net/api/v3';
const UMMAH='https://ummahapi.com/api/quran';
const QURAN_COM='https://api.quran.com/api/v4';
const QURAN_CDN='https://static.qurancdn.com/fonts/quran/hafs/v2/woff2';

const BISMILLAH='بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

function hasBismillah(id){
  const n=Number(id);
  return n!==1&&n!==9;
}

function plainArabic(value=''){
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g,'')
    .replace(/[ٱأإآ]/g,'ا')
    .replace(/ى/g,'ي')
    .replace(/ـ/g,'')
    .replace(/[^ء-ي\s]/g,'')
    .replace(/\s+/g,' ')
    .trim();
}

function stripBismillah(text=''){
  const raw=String(text).trim();
  const tokens=raw.split(/\s+/);
  if(tokens.length<4)return raw;
  const opening=tokens.slice(0,4).map(plainArabic);
  if(opening.join(' ')==='بسم الله الرحمن الرحيم')return tokens.slice(4).join(' ').trim();
  // Some Quran-text feeds attach extra Quranic signs to the opening words.
  // Compare the normalized beginning as a second safeguard while preserving
  // the original Uthmani text after the first four words.
  if(plainArabic(tokens.slice(0,4).join(' ')).startsWith('بسم الله الرحمن الرحيم'))return tokens.slice(4).join(' ').trim();
  return raw;
}

async function fetchSurahCatalog(){
  const r=await fetch(`${TEXT_API}/surah`);if(!r.ok)throw new Error('Unable to load Surah catalog');
  const j=await r.json();return j.data.map(s=>({id:s.number,name:s.englishName,englishMeaning:s.englishNameTranslation,arabic:s.name,ayahCount:s.numberOfAyahs}));
}

async function fetchSurahVerses(id,{signal}={}){
  const r=await fetch(`${TEXT_API}/surah/${id}`,{signal});if(!r.ok)throw new Error('Unable to load Quran text');
  const j=await r.json();return j.data.ayahs.map(a=>({number:a.numberInSurah,page:Number(a.page)||null,text:Number(a.numberInSurah)===1&&hasBismillah(id)?stripBismillah(a.text):a.text}));
}


async function fetchQcfMushafPage(page,{signal,tajweed=false}={}){
  const n=Math.max(1,Math.min(604,Number(page)||1));
  const mushaf=1;
  const url=`${QURAN_COM}/verses/by_page/${n}?mushaf=${mushaf}&words=true&word_fields=code_v2,text_uthmani,text_uthmani_tajweed,page_number,line_number,char_type_name&per_page=all`;
  const r=await fetch(url,{signal});if(!r.ok)throw new Error(`Unable to load Mushaf page ${n}`);
  const j=await r.json();
  const words=[];
  for(const verse of j.verses||[]){
    for(const word of verse.words||[]){
      const line=Number(word.line_number)||null;
      if(!line)continue;
      words.push({
        line,
        page:Number(word.page_number)||n,
        code:String(word.code_v2||''),
        text:String(word.text_uthmani||''),
        tajweedText:String(word.text_uthmani_tajweed||''),
        charType:String(word.char_type_name||''),
        verseKey:String(word.verse_key||verse.verse_key||''),
        chapterId:Number(verse.chapter_id)||Number(String(verse.verse_key||'0:0').split(':')[0])||null,
        verseNumber:Number(verse.verse_number)||Number(String(verse.verse_key||'0:0').split(':')[1])||null,
        position:Number(word.position)||0
      });
    }
  }
  words.sort((a,b)=>a.line-b.line||a.chapterId-b.chapterId||a.verseNumber-b.verseNumber||a.position-b.position);
  return {page:n,words,tajweed,tajweedFallback:!!tajweed,fontUrl:`${QURAN_CDN}/p${n}.woff2`};
}

function valueText(value){
  if(value==null)return '';
  if(typeof value==='string'||typeof value==='number')return String(value);
  if(typeof value==='object')return String(value.text??value.name??value.value??value.translation??value.meaning??'');
  return '';
}
function pick(obj,keys){for(const key of keys){if(obj&&obj[key]!=null)return obj[key]}return undefined}
function looksLikeWord(obj){
  if(!obj||typeof obj!=='object'||Array.isArray(obj))return false;
  return pick(obj,['arabic','text_uthmani','uthmani','word_arabic','text','word'])!=null && pick(obj,['meaning','translation','english','gloss','translation_en'])!=null;
}
function collectWordRows(node,out=[],context={}){
  if(Array.isArray(node)){node.forEach((v,i)=>collectWordRows(v,out,{...context,arrayIndex:i}));return out}
  if(!node||typeof node!=='object')return out;
  const next={...context};
  const ayah=pick(node,['ayah','ayah_number','ayahNumber','verse','verse_number','verseNumber']);
  if(ayah!=null&&Number.isFinite(Number(ayah)))next.ayah=Number(ayah);
  if(looksLikeWord(node)){
    const arabic=valueText(pick(node,['arabic','text_uthmani','uthmani','word_arabic','text','word']));
    const meaning=valueText(pick(node,['meaning','translation','english','gloss','translation_en']));
    const transliteration=valueText(pick(node,['transliteration','transliteration_text','translit']));
    const position=Number(pick(node,['position','word_number','wordNumber','index','word_index']))||undefined;
    out.push({ayah:next.ayah,position,arabic,meaning,transliteration});
    return out;
  }
  for(const [key,val] of Object.entries(node)){
    let child={...next};
    if(/^\d+$/.test(key)&&child.ayah==null)child.ayah=Number(key);
    collectWordRows(val,out,child);
  }
  return out;
}

async function fetchWordByWordSurah(id,{signal}={}){
  const r=await fetch(`${UMMAH}/words/${id}`,{signal});if(!r.ok)throw new Error('Unable to load word meanings');
  const j=await r.json();
  const root=j?.data??j;
  const rows=collectWordRows(root,[]);
  const grouped={};
  let fallbackAyah=1;
  for(const row of rows){
    const n=Number(row.ayah)||fallbackAyah;
    if(!grouped[n])grouped[n]=[];
    grouped[n].push({position:row.position||grouped[n].length+1,arabic:row.arabic,meaning:row.meaning,transliteration:row.transliteration});
    fallbackAyah=n;
  }
  Object.values(grouped).forEach(words=>words.sort((a,b)=>(a.position||0)-(b.position||0)));
  return grouped;
}

function normFolder(v=''){return String(v).replace(/^http:/,'https:').replace(/\/+$/,'/')}
function hasAllSurahs(list=''){
  const nums=new Set(String(list).split(',').map(Number).filter(Boolean));
  return nums.size>=114&&Array.from({length:114},(_,i)=>i+1).every(n=>nums.has(n));
}

async function fetchAudioEditions(){
  const [recitersRes,timingRes]=await Promise.all([
    fetch(`${MP3QURAN}/reciters?language=eng`),
    fetch(`${MP3QURAN}/ayat_timing/reads`)
  ]);
  if(!recitersRes.ok||!timingRes.ok)throw new Error('Unable to load reciters');
  const recitersJson=await recitersRes.json();
  const timingReads=await timingRes.json();
  const timingByFolder=new Map(timingReads.map(r=>[normFolder(r.folder_url),r]));
  const out=[];
  for(const reciter of recitersJson.reciters||[]){
    for(const moshaf of reciter.moshaf||[]){
      const hafs=/hafs/i.test(moshaf.name||'');
      const complete=Number(moshaf.surah_total)===114&&hasAllSurahs(moshaf.surah_list);
      const timing=timingByFolder.get(normFolder(moshaf.server));
      if(hafs&&complete&&timing){
        out.push({
          id:`${reciter.id}:${moshaf.id}`,
          name:reciter.name,
          server:normFolder(moshaf.server),
          timingReadId:Number(timing.id),
          narration:moshaf.name,
          complete:true
        });
      }
    }
  }
  out.sort((a,b)=>a.name.localeCompare(b.name));
  return out;
}

async function fetchSurahAudio(id,reciter){
  if(!reciter?.server||!reciter?.timingReadId)throw new Error('This reciter is missing full-Surah timing data');
  const audio=`${normFolder(reciter.server)}${String(id).padStart(3,'0')}.mp3`;
  const timingRes=await fetch(`${MP3QURAN}/ayat_timing?surah=${id}&read=${reciter.timingReadId}`);
  if(!timingRes.ok)throw new Error('Unable to load ayah timings');
  const raw=await timingRes.json();
  const timings=(Array.isArray(raw)?raw:[])
    .filter(x=>Number(x.ayah)>0)
    .map(x=>({number:Number(x.ayah),startMs:Number(x.start_time)||0,endMs:Number(x.end_time)||0}))
    .sort((a,b)=>a.number-b.number);
  return {audio,timings};
}

// ---- demo-data.js ----
const fallbackCatalog=[
{id:67,name:'Al-Mulk',arabic:'سُورَةُ الْمُلْكِ',ayahCount:30},{id:68,name:'Al-Qalam',arabic:'سُورَةُ الْقَلَمِ',ayahCount:52},{id:69,name:'Al-Haaqqa',arabic:'سُورَةُ الْحَاقَّةِ',ayahCount:52},{id:70,name:"Al-Ma'aarij",arabic:'سُورَةُ الْمَعَارِجِ',ayahCount:44},{id:71,name:'Nooh',arabic:'سُورَةُ نُوحٍ',ayahCount:28},{id:72,name:'Al-Jinn',arabic:'سُورَةُ الْجِنِّ',ayahCount:28},{id:73,name:'Al-Muzzammil',arabic:'سُورَةُ الْمُزَّمِّلِ',ayahCount:20},{id:74,name:'Al-Muddaththir',arabic:'سُورَةُ الْمُدَّثِّرِ',ayahCount:56},{id:75,name:'Al-Qiyaama',arabic:'سُورَةُ الْقِيَامَةِ',ayahCount:40},{id:76,name:'Al-Insaan',arabic:'سُورَةُ الْإِنْسَانِ',ayahCount:31},{id:77,name:'Al-Mursalaat',arabic:'سُورَةُ الْمُرْسَلَاتِ',ayahCount:50},{id:78,name:'An-Naba',arabic:'سُورَةُ النَّبَإِ',ayahCount:40},{id:79,name:"An-Naazi'aat",arabic:'سُورَةُ النَّازِعَاتِ',ayahCount:46},{id:80,name:'Abasa',arabic:'سُورَةُ عَبَسَ',ayahCount:42}
];
const initialCollection=[67,68,69,70,71,72,73,74,75];
const initialRevision={
67:{rating:3,lastRecited:'Sep 13',redAyahs:[3,14],logs:[{date:'Sep 13',rating:3,note:'Middle of the Surah needed more attention.',redAyahs:[3,14]},{date:'Sep 7',rating:4,note:'Stronger overall, but one transition was still shaky.',redAyahs:[14]}]},
68:{rating:2,lastRecited:'Sep 10',redAyahs:[7,18,22,31],logs:[{date:'Sep 10',rating:2,note:'Several transitions were weak.',redAyahs:[7,18,22,31]}]},
69:{rating:4,lastRecited:'Sep 16',redAyahs:[],logs:[{date:'Sep 16',rating:4,note:'Strong overall.',redAyahs:[]}]},
70:{rating:3,lastRecited:'Sep 11',redAyahs:[9],logs:[{date:'Sep 11',rating:3,note:'One section needs repetition.',redAyahs:[9]}]},
71:{rating:5,lastRecited:'Sep 17',redAyahs:[],logs:[{date:'Sep 17',rating:5,note:'Very confident today.',redAyahs:[]}]},
72:{rating:3,lastRecited:'Sep 12',redAyahs:[4,6,8],logs:[{date:'Sep 12',rating:3,note:'Beginning is strong; middle needs work.',redAyahs:[4,6,8]},{date:'Sep 4',rating:2,note:'Needed prompting several times.',redAyahs:[4,5,6,8]}]},
73:{rating:4,lastRecited:'Sep 15',redAyahs:[11],logs:[{date:'Sep 15',rating:4,note:'Good session. One transition needs repetition.',redAyahs:[11]}]},
74:{rating:4,lastRecited:'Sep 14',redAyahs:[],logs:[{date:'Sep 14',rating:4,note:'Solid revision. No major weak spots.',redAyahs:[]}]},
75:{rating:3,lastRecited:'Sep 9',redAyahs:[5,9],logs:[{date:'Sep 9',rating:3,note:'Needs another review soon.',redAyahs:[5,9]}]}
};

// ---- app.js ----

const app=document.querySelector('#app');
const defaultState={
  mode:'practice',screen:'surahs',collection:initialCollection,revision:initialRevision,
  sort:'quran',query:'',selectedSurah:72,surahView:'whole',experimentalMushaf:false,mushafPage:null,mushafLineGuides:true,mushafTajweed:false,mushafFocus:null,catalog:fallbackCatalog,
  profile:{displayName:''},
  stats:{redView:'juz',redJuz:[]},
  meanings:{tab:'all',sort:'common',displayMode:'core',known:[],learnedOn:{},quiz:{mode:'ar-en',correct:0,total:0,streak:0,best:0},performance:{}},
  listen:{screen:'listen-surahs',selectedSurah:67,reciter:null,reciterName:'Loading reciters…',reciters:[],favoriteReciters:[],track:0,recent:[],highlights:{},speed:'1',autoScroll:true,repeatMode:'off',repeatCount:'3',repeatStart:1,repeatEnd:1,repeatAnchor:null,repeatRemaining:0,afterSurah:'stop',stopAfterSurah:null,followMode:'lineflow',matchPracticeSurah:true}
};
let state=loadState(defaultState);
state={...defaultState,...state,profile:{...defaultState.profile,...(state.profile||{})},stats:{...defaultState.stats,...(state.stats||{})},meanings:{...defaultState.meanings,...(state.meanings||{}),quiz:{...defaultState.meanings.quiz,...(state.meanings?.quiz||{})},performance:{...(state.meanings?.performance||{})}},listen:{...defaultState.listen,...(state.listen||{})}};
state.profile.displayName=String(state.profile?.displayName||'').trim().slice(0,40);
state.collection=Array.isArray(state.collection)?state.collection:initialCollection;
state.revision=state.revision||structuredClone(initialRevision);
state.experimentalMushaf=!!state.experimentalMushaf;
state.mushafPage=state.mushafPage==null?null:Math.max(1,Math.min(604,Number(state.mushafPage)||1));
state.mushafLineGuides=state.mushafLineGuides!==false;
state.mushafTajweed=!!state.mushafTajweed;
state.mushafFocus=state.mushafFocus&&Number(state.mushafFocus.surah)&&Number(state.mushafFocus.ayah)?{surah:Number(state.mushafFocus.surah),ayah:Number(state.mushafFocus.ayah)}:null;
state.catalog=Array.isArray(state.catalog)&&state.catalog.length?state.catalog:fallbackCatalog;
if(!Array.isArray(state.listen.reciters)||!state.listen.reciters.some(r=>r&&r.server&&r.timingReadId)){state.listen.reciters=[];state.listen.reciter=null;state.listen.reciterName='Loading reciters…'}
state.listen.favoriteReciters=Array.isArray(state.listen.favoriteReciters)?state.listen.favoriteReciters:[];
state.listen.highlights=state.listen.highlights&&typeof state.listen.highlights==='object'?state.listen.highlights:{};
state.listen.matchPracticeSurah=state.listen.matchPracticeSurah!==false;
state.stats.redView=['juz','surah'].includes(state.stats.redView)?state.stats.redView:'juz';
state.meanings.known=Array.isArray(state.meanings.known)?[...new Set(state.meanings.known)]:[];
state.meanings.learnedOn=state.meanings.learnedOn&&typeof state.meanings.learnedOn==='object'?state.meanings.learnedOn:{};
state.meanings.tab=['all','known','quiz'].includes(state.meanings.tab)?state.meanings.tab:'all';
state.meanings.sort=['common','quran','az'].includes(state.meanings.sort)?state.meanings.sort:'common';
state.meanings.displayMode=['core','forms'].includes(state.meanings.displayMode)?state.meanings.displayMode:'core';
state.meanings.quiz.mode=['ar-en','en-ar'].includes(state.meanings.quiz.mode)?state.meanings.quiz.mode:'ar-en';
if(state.screen==='practice')state.screen='meanings';
state.stats.redJuz=Array.isArray(state.stats.redJuz)?state.stats.redJuz.map(Number).filter(n=>n>=1&&n<=30):[];
state.listen.afterSurah=state.listen.afterSurah==='continue'?'continue':'stop';
state.listen.stopAfterSurah=state.listen.stopAfterSurah==null?null:Math.max(1,Math.min(114,Number(state.listen.stopAfterSurah)||114));
if(state.listen.screen==='reciters')state.listen.screen='now-playing';
state.listen.followMode=['smart','flow','off'].includes(state.listen.followMode)?state.listen.followMode:'lineflow';
// Migrate older prototype repeat settings without disturbing saved revision data.
if(!state.listen.repeatMode){
  state.listen.repeatMode=state.listen.repeat&&state.listen.repeat!=='Off'?'ayah':'off';
  state.listen.repeatCount=state.listen.repeat==='∞'?'infinite':state.listen.repeat==='5x'?'5':state.listen.repeat==='2x'?'2':'3';
}
state.listen.repeatStart=Math.max(1,Number(state.listen.repeatStart)||1);
state.listen.repeatEnd=Math.max(state.listen.repeatStart,Number(state.listen.repeatEnd)||state.listen.repeatStart);
state.listen.repeatAnchor=Number(state.listen.repeatAnchor)||null;
state.listen.repeatRemaining=Number.isFinite(Number(state.listen.repeatRemaining))?Number(state.listen.repeatRemaining):0;
captureRecoverySnapshot();

const verseCache=new Map();
const audioCache=new Map();
const wordCache=new Map();
const mushafPageCache=new Map();
const tajweedMushafPageCache=new Map();
let listenContentController=null;
let listenContentRefreshing=false;
const player=new Audio();
let addSearch='';
let addJuzOpen=false;
let noteFilter='All Surahs';
let strongestFirst=false;
let draftRating=0;
let draftNote='';
let toast='';

const MEANING_BANK_CACHE_KEY='quran-revision-word-bank-v1';
let meaningBank=loadMeaningBankCache();
let meaningBuildPromise=null;
let meaningsQuery='';
let meaningsVisibleLimit=120;
let coreMeaningCache={signature:'',entries:[]};
let quizQuestion=null;
let quizFeedback=null;

// Experimental direct-audio speech recognition for context-aware word following.
let smartRecognition=null;
let smartCapturedStream=null;
let smartAudioTrack=null;
let smartFollowRunning=false;
let smartFollowStatus='idle';
let smartWordIndex=-1;
let smartAyahNumber=null;
let smartRestartTimer=0;
let smartLastMatchAt=0;
let smartTranscript='';
let smartErrorDetail='';

player.addEventListener('ended',async()=>{
  // Whole-Surah repeat intentionally overrides the normal end-of-Surah
  // stop/continue behavior until the user turns this repeat mode off.
  if(state.listen.repeatMode==='surah'){
    const pack=audioCache.get(audioKey());
    state.listen.track=0;
    state.listen.repeatAnchor=null;
    state.listen.repeatRemaining=-1;
    player.currentTime=0;
    persist();
    updateCurrentListeningUI(true,0,pack?.timings?.[0]||null);
    refreshSmartFollowForAyah();
    scrollCurrentListeningAyah('auto');
    try{await player.play()}catch{announce('Tap resume to continue repeating this Surah.')}
    return;
  }
  if(await continueAfterSurahIfNeeded())return;
  player.pause();
  syncPlayerButton();
});
player.addEventListener('timeupdate',()=>{
  const progress=document.querySelector('#audio-progress');
  const time=document.querySelector('#audio-time');
  if(progress&&player.duration)progress.style.width=`${Math.min(100,(player.currentTime/player.duration)*100)}%`;
  if(time&&Number.isFinite(player.duration))time.textContent=`${formatTime(player.currentTime)} / ${formatTime(player.duration)}`;
  const pack=audioCache.get(audioKey());
  if(!pack?.timings?.length)return;
  const ms=player.currentTime*1000;
  if(handleRepeatBoundary(ms,pack))return;
  let idx=findTimingIndex(ms,pack.timings);
  idx=Math.max(0,idx);
  const timing=pack.timings[idx];
  if(idx!==state.listen.track){
    state.listen.track=idx;persist();updateRecentListenPosition();updateCurrentListeningUI(true,ms,timing);scrollCurrentListeningAyah();refreshSmartFollowForAyah();
  }else{
    updateCurrentListeningUI(false,ms,timing);
  }
});

// The native `timeupdate` event only fires a few times per second. A tiny
// animation-frame loop keeps one continuous ayah progress cue moving smoothly
// between those events. It follows the ayah timing itself rather than guessing
// which individual word the reciter is on.
let ayahFlowFrame=0;
function stopAyahFlowLoop(){if(ayahFlowFrame){cancelAnimationFrame(ayahFlowFrame);ayahFlowFrame=0}}
function startAyahFlowLoop(){
  stopAyahFlowLoop();
  const tick=()=>{
    if(player.paused||player.ended){ayahFlowFrame=0;return}
    const pack=audioCache.get(audioKey());
    const timing=pack?.timings?.[state.listen.track];
    if(timing)updateAyahFlowUI(player.currentTime*1000,timing);
    ayahFlowFrame=requestAnimationFrame(tick);
  };
  ayahFlowFrame=requestAnimationFrame(tick);
}
player.addEventListener('play',()=>{recordRecent(catalogItem(state.listen.selectedSurah));updateRecentListenPosition();syncPlayerButton();startAyahFlowLoop()});
player.addEventListener('pause',()=>{syncPlayerButton();stopAyahFlowLoop()});
player.addEventListener('ended',()=>{stopAyahFlowLoop()});

function formatTime(v){const s=Math.max(0,Math.floor(v||0));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
function persist(){captureRecoverySnapshot();saveState(state)}
function announce(t){toast=t;render();setTimeout(()=>{if(toast===t){toast='';render()}},1600)}
function catalogItem(id){return state.catalog.find(s=>Number(s.id)===Number(id))||fallbackCatalog.find(s=>s.id===Number(id))||{id:Number(id),name:`Surah ${id}`,arabic:'',ayahCount:1}}
function rev(id){
  if(!state.revision[id])state.revision[id]={rating:0,lastRecited:'Not yet',redAyahs:[],logs:[],ayahNotes:{},redHistory:[]};
  if(!state.revision[id].ayahNotes||typeof state.revision[id].ayahNotes!=='object')state.revision[id].ayahNotes={};
  if(!Array.isArray(state.revision[id].redHistory))state.revision[id].redHistory=[];
  return state.revision[id];
}
function ayahNoteRecord(surahId,ayah){
  const value=rev(Number(surahId)).ayahNotes[String(Number(ayah))];
  if(typeof value==='string')return {text:value,updatedAt:null};
  return value&&typeof value==='object'?{text:String(value.text||''),updatedAt:Number(value.updatedAt)||null}:{text:'',updatedAt:null};
}
function hasAyahNote(surahId,ayah){return !!ayahNoteRecord(surahId,ayah).text.trim()}
function saveAyahNote(surahId,ayah,textValue){
  const r=rev(Number(surahId)),key=String(Number(ayah)),text=String(textValue||'').trim();
  if(text)r.ayahNotes[key]={text,updatedAt:Date.now()};else delete r.ayahNotes[key];
  persist();
}
function recordRedHistory(surahId,ayah,action){
  const r=rev(Number(surahId));
  r.redHistory=[{ayah:Number(ayah),action:action==='green'?'green':'red',at:Date.now()},...(r.redHistory||[])];
}
function redHistoryDayKey(ts){const d=new Date(Number(ts)||0);return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`}
function redHistoryDayLabel(ts){
  const d=new Date(Number(ts)||0),now=new Date(),y=new Date(now);y.setDate(now.getDate()-1);
  if(d.toDateString()===now.toDateString())return 'Today';
  if(d.toDateString()===y.toDateString())return 'Yesterday';
  return d.toLocaleDateString([],{month:'short',day:'numeric',year:d.getFullYear()===now.getFullYear()?undefined:'numeric'});
}
function renderRedHistory(s){
  const events=[...(s.redHistory||[])].sort((a,b)=>(Number(b.at)||0)-(Number(a.at)||0));
  if(!events.length)return `<div class="red-history-empty"><div class="red-history-icon">↺</div><b>No red-ayah changes recorded yet</b><p>From this version forward, marking an ayah red or clearing it back to green will be recorded here automatically. Existing red ayahs are kept, but no past date is invented for them.</p></div>`;
  const grouped=[];const map=new Map();
  for(const item of events){const key=redHistoryDayKey(item.at);if(!map.has(key)){const group={key,at:item.at,items:[]};map.set(key,group);grouped.push(group)}map.get(key).items.push(item)}
  const last=events[0];
  return `<div class="red-history-wrap"><div class="red-history-summary"><div><span>Current red</span><strong>${s.redAyahs.length}</strong></div><div><span>Recorded changes</span><strong>${events.length}</strong></div><div><span>Last change</span><strong>Ayah ${last.ayah}</strong></div></div><div class="red-history-timeline">${grouped.map(group=>`<section class="red-history-day"><div class="red-history-day-title"><b>${escapeHtml(redHistoryDayLabel(group.at))}</b><span>${group.items.length} change${group.items.length===1?'':'s'}</span></div>${group.items.map(item=>{const red=item.action==='red';const time=new Date(Number(item.at)||0).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});return `<div class="red-history-event"><span class="red-history-dot ${red?'red':'green'}"></span><div class="red-history-copy"><b>Ayah ${item.ayah}</b><span>${red?'Marked red · needs work':'Taken off red · back to green'}</span></div><time>${escapeHtml(time)}</time></div>`}).join('')}</section>`).join('')}</div></div>`;
}

function viewModel(id){const c=catalogItem(id),r=rev(id);return {...c,...r,redAyahs:r.redAyahs||[],logs:r.logs||[]}}
function allCollection(){return state.collection.map(viewModel)}
function needAttention(s){return s.rating>0?(s.rating<=2||s.redAyahs.length>=3):true}
function notes(){
  const list=[];
  state.collection.forEach(id=>{const s=viewModel(id);(s.logs||[]).forEach((log,index)=>list.push({...log,surahId:id,surahName:s.name,_i:index}))});
  return list.sort((a,b)=>(b.createdAt||dateKey(b.date))-(a.createdAt||dateKey(a.date)));
}
function dateKey(label=''){const m=String(label).match(/([A-Za-z]{3})\s+(\d{1,2})/);if(!m)return 0;const months={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};return new Date(new Date().getFullYear(),months[m[1]]??0,+m[2]).getTime()}
const JUZ_STARTS=[[1,1],[2,142],[2,253],[3,93],[4,24],[4,148],[5,82],[6,111],[7,88],[8,41],[9,93],[11,6],[12,53],[15,1],[17,1],[18,75],[21,1],[23,1],[25,21],[27,56],[29,46],[33,31],[36,28],[39,32],[41,47],[46,1],[51,31],[58,1],[67,1],[78,1]];
function posLE(aSurah,aAyah,bSurah,bAyah){return aSurah<bSurah||(aSurah===bSurah&&aAyah<=bAyah)}
function juzForAyah(surah,ayah){surah=Number(surah);ayah=Number(ayah);let juz=1;for(let i=0;i<JUZ_STARTS.length;i++){const [s,a]=JUZ_STARTS[i];if(posLE(s,a,surah,ayah))juz=i+1;else break}return juz}
function surahsStartingInJuz(juz){return (state.catalog||[]).filter(s=>juzForAyah(s.id,1)===Number(juz)).map(s=>Number(s.id))}
function listenHighlightKey(surah,ayah){return `${Number(surah)}:${Number(ayah)}`}
function listenHighlight(surah,ayah){return state.listen.highlights[listenHighlightKey(surah,ayah)]||'none'}
function lastListenedRecord(id){return (state.listen.recent||[]).find(r=>Number(r.id)===Number(id))||null}
function formatListenedWhen(rec){if(!rec)return 'Never';if(rec.listenedAt){const d=new Date(rec.listenedAt),now=new Date();const same=d.toDateString()===now.toDateString();return same?`Today, ${d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`:d.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}return rec.when||'Previously'}
function selectedReciter(){return (state.listen.reciters||[]).find(r=>r.id===state.listen.reciter)||null}
function audioKey(){return `${state.listen.selectedSurah}:${state.listen.reciter||'none'}`}
function syncPlayerButton(){const b=document.querySelector('[data-action="toggle-play"]');if(b){b.textContent=player.paused?'▶':'Ⅱ';b.setAttribute('aria-label',player.paused?'Resume':'Pause')}}
function findTimingIndex(ms,timings=[]){
  let idx=timings.findIndex(t=>ms>=t.startMs&&ms<t.endMs);
  if(idx<0){for(let i=timings.length-1;i>=0;i--){if(ms>=timings[i].startMs){idx=i;break}}}
  return Math.max(0,idx);
}
function ayahPlaybackProgress(ms,timing){
  if(!timing)return 0;
  const duration=Math.max(1,timing.endMs-timing.startMs);
  return Math.max(0,Math.min(1,(ms-timing.startMs)/duration));
}
function updateAyahFlowUI(ms,timing){
  const progress=ayahPlaybackProgress(ms,timing);
  const showFlow=state.listen.followMode==='flow';
  const showLineFlow=state.listen.followMode==='lineflow';
  document.querySelectorAll('.ayah-flow-track').forEach(el=>el.classList.toggle('flow-hidden',!showFlow));
  document.querySelectorAll('.ayah-flow-fill').forEach(el=>{
    const row=el.closest('[data-listen-ayah-index]');
    const active=row&&Number(row.dataset.listenAyahIndex)===state.listen.track;
    el.style.setProperty('--ayah-flow',showFlow&&active?String(progress):'0');
  });
  document.querySelectorAll('.ayah-line-flow-layer').forEach(layer=>{
    const row=layer.closest('[data-listen-ayah-index]');
    const active=showLineFlow&&row&&Number(row.dataset.listenAyahIndex)===state.listen.track;
    layer.classList.toggle('line-flow-visible',!!active);
    const segments=[...layer.querySelectorAll('.ayah-line-flow-segment')];
    const total=segments.reduce((sum,seg)=>sum+(Number(seg.dataset.flowWidth)||seg.getBoundingClientRect().width||0),0)||1;
    let distance=(active?progress:0)*total;
    segments.forEach(seg=>{
      const width=Number(seg.dataset.flowWidth)||seg.getBoundingClientRect().width||1;
      const part=Math.max(0,Math.min(1,distance/Math.max(1,width)));
      const fill=seg.querySelector('.ayah-line-flow-fill');if(fill)fill.style.setProperty('--line-flow',String(part));
      distance-=width;
    });
  });
}
function updateCurrentListeningUI(updateRows=true,ms=player.currentTime*1000,timing=null){
  const pack=audioCache.get(audioKey());
  const currentTiming=timing||pack?.timings?.[state.listen.track];
  const current=document.querySelector('#current-ayah-label');
  if(current)current.textContent=`Ayah ${currentTiming?.number||state.listen.track+1}`;
  if(updateRows){
    document.querySelectorAll('[data-listen-ayah-index]').forEach(row=>{const on=Number(row.dataset.listenAyahIndex)===state.listen.track;row.classList.toggle('current',on);row.setAttribute('aria-current',on?'true':'false')});
  }
  updateAyahFlowUI(ms,currentTiming);
}
function normalizeRecognizedArabic(value=''){
  return plainWordArabic(String(value))
    .replace(/[أإآ]/g,'ا').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ى/g,'ي')
    .replace(/[^ء-ي\s]/g,' ').replace(/\s+/g,' ').trim();
}
function editDistance(a='',b=''){
  a=String(a);b=String(b);const m=a.length,n=b.length;const row=Array(n+1);for(let j=0;j<=n;j++)row[j]=j;
  for(let i=1;i<=m;i++){let prev=row[0];row[0]=i;for(let j=1;j<=n;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old}}
  return row[n];
}
function tokenSimilarity(a,b){
  a=normalizeRecognizedArabic(a);b=normalizeRecognizedArabic(b);if(!a||!b)return 0;if(a===b)return 1;
  return 1-editDistance(a,b)/Math.max(a.length,b.length,1);
}
function displayedAyahWords(surahId,ayahNumber){
  const words=(wordCache.get(Number(surahId))||{})[Number(ayahNumber)]||[];
  const start=Number(ayahNumber)===1&&hasBismillah(surahId)&&firstWordsAreBismillah(words)?4:0;
  return words.slice(start).map((w,i)=>({text:w.arabic||'',domIndex:i+start}));
}
function expectedSmartIndex(wordsLength){
  const pack=audioCache.get(audioKey());const timing=pack?.timings?.[state.listen.track];if(!timing||!wordsLength)return 0;
  return Math.min(wordsLength-1,Math.max(0,Math.floor(ayahPlaybackProgress(player.currentTime*1000,timing)*wordsLength)));
}
function scoreRecognitionAgainstAyah(transcript){
  const pack=audioCache.get(audioKey());const timing=pack?.timings?.[state.listen.track];if(!timing)return null;
  const ayah=Number(timing.number)||state.listen.track+1;const words=displayedAyahWords(state.listen.selectedSurah,ayah);if(!words.length)return null;
  const recognized=normalizeRecognizedArabic(transcript).split(' ').filter(Boolean);if(!recognized.length)return null;
  const maxContext=Math.min(5,recognized.length,words.length);const expected=expectedSmartIndex(words.length);
  let best=null;
  for(let k=1;k<=maxContext;k++){
    const rec=recognized.slice(-k);
    for(let end=k-1;end<words.length;end++){
      const start=end-k+1;let lexical=0;
      for(let i=0;i<k;i++)lexical+=tokenSimilarity(rec[i],words[start+i].text);
      lexical/=k;
      // Context/order matters more than a single repeated token. Audio position is only
      // a weak prior, while the last confirmed word discourages jumping backwards.
      const distance=Math.abs(end-expected);const timingPrior=Math.max(0,1-distance/Math.max(3,words.length*.35));
      let orderPrior=.5;
      if(smartAyahNumber===ayah&&smartWordIndex>=0){
        const lastLocal=words.findIndex(w=>w.domIndex===smartWordIndex);
        if(lastLocal>=0){if(end>=lastLocal-1)orderPrior=1;else orderPrior=Math.max(0,.4-(lastLocal-end)*.12)}
      }
      const contextBonus=k>=3?.12:k===2?.06:0;
      const score=lexical*.76+timingPrior*.12+orderPrior*.12+contextBonus;
      if(!best||score>best.score)best={score,ayah,domIndex:words[end].domIndex,localIndex:end,lexical,k,transcript};
    }
  }
  return best;
}
function clearSmartWordUI(){document.querySelectorAll('.listen-word-stack.smart-word-active,.listen-word-stack.smart-word-context').forEach(el=>el.classList.remove('smart-word-active','smart-word-context'))}
function applySmartWordMatch(match){
  if(!match||match.score<.64||match.lexical<.52)return false;
  // Do not allow an uncertain recognition to jump far backwards within the same ayah.
  if(smartAyahNumber===match.ayah&&smartWordIndex>=0&&match.domIndex<smartWordIndex-1&&match.score<.88)return false;
  smartAyahNumber=match.ayah;smartWordIndex=match.domIndex;smartLastMatchAt=Date.now();smartFollowStatus='matched';
  clearSmartWordUI();
  const row=document.querySelector(`[data-listen-ayah-index="${state.listen.track}"]`);if(!row)return true;
  const active=row.querySelector(`[data-listen-word-index="${match.domIndex}"]`);if(active){active.classList.add('smart-word-active');const prev=active.previousElementSibling;if(prev?.classList.contains('listen-word-stack'))prev.classList.add('smart-word-context')}
  updateSmartFollowStatusUI();return true;
}
function updateSmartFollowStatusUI(){
  const el=document.querySelector('#smart-follow-status');
  const transcriptEl=document.querySelector('#smart-follow-transcript');
  if(!el)return;
  const labels={
    starting:'Smart follow · connecting to the playing audio…',
    listening:'Smart follow · listening — waiting for Arabic recognition',
    hearing:'Smart follow · Arabic detected — matching context',
    matched:'Smart follow · matched Quran words',
    unsupported:'Smart follow unavailable in this browser',
    error:'Smart follow stopped with a browser recognition error',
    idle:player.paused?'Smart follow ready · press play to test':'Smart follow · experimental'
  };
  el.textContent=labels[smartFollowStatus]||labels.idle;
  el.dataset.state=smartFollowStatus;
  if(transcriptEl){
    if(state.listen.followMode!=='smart'){transcriptEl.textContent='';transcriptEl.classList.add('hidden');return}
    const detail=smartTranscript?`Heard: ${smartTranscript}`:smartErrorDetail?smartErrorDetail:(smartFollowStatus==='unsupported'?'Chrome could not pass this Surah audio track into speech recognition. No smooth-flow fallback is being shown.':'');
    transcriptEl.textContent=detail;
    transcriptEl.classList.toggle('hidden',!detail);
  }
}
function configureRecognitionPhrases(recognition){
  try{
    if(!('SpeechRecognitionPhrase' in window)||!('phrases' in recognition))return;
    const pack=audioCache.get(audioKey());const ayah=pack?.timings?.[state.listen.track]?.number||state.listen.track+1;const words=displayedAyahWords(state.listen.selectedSurah,ayah).map(w=>normalizeRecognizedArabic(w.text)).filter(Boolean);
    const phrases=[];for(const w of [...new Set(words)])phrases.push(new SpeechRecognitionPhrase(w,3));
    for(let i=0;i<words.length-1;i++)phrases.push(new SpeechRecognitionPhrase(`${words[i]} ${words[i+1]}`,5));
    recognition.phrases=phrases.slice(0,80);
  }catch{}
}
function stopSmartFollow({preserveStatus=false}={}){
  clearTimeout(smartRestartTimer);smartRestartTimer=0;smartFollowRunning=false;
  if(smartRecognition){try{smartRecognition.onend=null;smartRecognition.stop()}catch{}smartRecognition=null}
  if(smartCapturedStream){try{smartCapturedStream.getTracks().forEach(t=>t.stop())}catch{}smartCapturedStream=null;smartAudioTrack=null}
  if(!preserveStatus){smartFollowStatus='idle';smartWordIndex=-1;smartAyahNumber=null;smartTranscript='';smartErrorDetail='';clearSmartWordUI();updateSmartFollowStatusUI()}
}
function startSmartFollow(){
  if(state.listen.followMode!=='smart'||player.paused||state.mode!=='listen'||state.listen.screen!=='now-playing')return;
  stopSmartFollow({preserveStatus:true});clearSmartWordUI();smartTranscript='';smartErrorDetail='';smartFollowStatus='starting';updateSmartFollowStatusUI();
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition||typeof player.captureStream!=='function'){smartFollowStatus='unsupported';smartErrorDetail=!Recognition?'SpeechRecognition is not exposed by this browser.':'This browser does not expose HTMLMediaElement.captureStream() for the playing Surah.';updateSmartFollowStatusUI();return}
  try{
    smartCapturedStream=player.captureStream();smartAudioTrack=smartCapturedStream.getAudioTracks()[0];
    if(!smartAudioTrack||smartAudioTrack.readyState!=='live'){smartFollowStatus='unsupported';smartErrorDetail='The player did not provide a live audio track to recognize.';updateSmartFollowStatusUI();return}
    const recognition=new Recognition();smartRecognition=recognition;recognition.lang='ar-SA';recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=3;configureRecognitionPhrases(recognition);
    recognition.onstart=()=>{smartFollowRunning=true;smartFollowStatus='listening';updateSmartFollowStatusUI()};
    recognition.onresult=e=>{
      let best=null;let latest='';
      for(let r=e.resultIndex;r<e.results.length;r++){
        const result=e.results[r];
        if(result?.[0]?.transcript)latest=result[0].transcript;
        for(let a=0;a<Math.min(result.length,3);a++){
          const candidate=scoreRecognitionAgainstAyah(result[a].transcript);
          if(candidate){candidate.confidence=Number(result[a].confidence)||0;candidate.score+=Math.min(.05,candidate.confidence*.05);if(!best||candidate.score>best.score)best=candidate}
        }
      }
      if(latest){smartTranscript=latest.trim();if(smartFollowStatus!=='matched')smartFollowStatus='hearing';updateSmartFollowStatusUI()}
      if(best)applySmartWordMatch(best);
    };
    recognition.onerror=e=>{if(e.error==='aborted')return;smartFollowStatus='error';smartErrorDetail=`Recognition error: ${e.error||'unknown'}. Smart mode is not falling back to Smooth Flow.`;updateSmartFollowStatusUI()};
    recognition.onend=()=>{smartFollowRunning=false;if(state.listen.followMode==='smart'&&!player.paused&&state.mode==='listen'&&state.listen.screen==='now-playing'){smartRestartTimer=setTimeout(()=>startSmartFollow(),180)}};
    recognition.start(smartAudioTrack);
  }catch(err){smartFollowStatus='unsupported';smartErrorDetail=`Direct audio-track recognition was rejected${err?.name?` (${err.name})`:''}.`;updateSmartFollowStatusUI();}
}
function refreshSmartFollowForAyah(){
  smartWordIndex=-1;smartTranscript='';smartErrorDetail='';const pack=audioCache.get(audioKey());smartAyahNumber=pack?.timings?.[state.listen.track]?.number||null;clearSmartWordUI();
  if(state.listen.followMode==='smart'&&!player.paused){clearTimeout(smartRestartTimer);smartRestartTimer=setTimeout(()=>startSmartFollow(),80)}
}

function repeatLoopBudget(){
  if(state.listen.repeatCount==='infinite')return -1;
  return Math.max(0,(Number(state.listen.repeatCount)||1)-1);
}
function initializeRepeatPlan({seekToStart=false}={}){
  const pack=audioCache.get(audioKey());if(!pack?.timings?.length)return;
  if(state.listen.repeatMode==='off'){state.listen.repeatAnchor=null;state.listen.repeatRemaining=0;persist();return}
  if(state.listen.repeatMode==='surah'){
    state.listen.repeatAnchor=null;
    state.listen.repeatRemaining=-1;
    if(seekToStart){state.listen.track=0;player.currentTime=0;scrollCurrentListeningAyah('smooth')}
    persist();
    return;
  }
  if(state.listen.repeatMode==='ayah'){
    const t=pack.timings[state.listen.track]||pack.timings[0];
    state.listen.repeatAnchor=t.number;
    state.listen.repeatStart=t.number;
    state.listen.repeatEnd=t.number;
  }else{
    const max=pack.timings.length;
    state.listen.repeatStart=Math.max(1,Math.min(max,Number(state.listen.repeatStart)||1));
    state.listen.repeatEnd=Math.max(state.listen.repeatStart,Math.min(max,Number(state.listen.repeatEnd)||state.listen.repeatStart));
    state.listen.repeatAnchor=null;
  }
  state.listen.repeatRemaining=repeatLoopBudget();
  if(seekToStart){
    const n=state.listen.repeatMode==='ayah'?state.listen.repeatAnchor:state.listen.repeatStart;
    const idx=pack.timings.findIndex(t=>t.number===n);
    if(idx>=0){state.listen.track=idx;player.currentTime=Math.max(0,pack.timings[idx].startMs/1000);scrollCurrentListeningAyah('smooth')}
  }
  persist();
}
function handleRepeatBoundary(ms,pack){
  if(state.listen.repeatMode==='off'||state.listen.repeatMode==='surah')return false;
  let startNumber,endNumber;
  if(state.listen.repeatMode==='ayah'){
    startNumber=endNumber=Number(state.listen.repeatAnchor)||pack.timings[state.listen.track]?.number;
  }else{
    startNumber=Number(state.listen.repeatStart);endNumber=Number(state.listen.repeatEnd);
  }
  const startIdx=pack.timings.findIndex(t=>t.number===startNumber);
  const endIdx=pack.timings.findIndex(t=>t.number===endNumber);
  if(startIdx<0||endIdx<0)return false;
  const end=pack.timings[endIdx];
  if(ms<end.endMs-80)return false;
  if(state.listen.repeatRemaining===-1||state.listen.repeatRemaining>0){
    if(state.listen.repeatRemaining>0)state.listen.repeatRemaining--;
    state.listen.track=startIdx;
    player.currentTime=Math.max(0,pack.timings[startIdx].startMs/1000);
    persist();updateCurrentListeningUI(true,pack.timings[startIdx].startMs,pack.timings[startIdx]);refreshSmartFollowForAyah();scrollCurrentListeningAyah('smooth');
    return true;
  }
  state.listen.repeatMode='off';state.listen.repeatAnchor=null;state.listen.repeatRemaining=0;persist();
  return false;
}
function scrollCurrentListeningAyah(behavior='smooth'){
  if(state.mode!=='listen'||state.listen.screen!=='now-playing'||state.listen.autoScroll===false)return;
  requestAnimationFrame(()=>{
    const row=document.querySelector(`[data-listen-ayah-index="${state.listen.track}"]`);
    if(row)row.scrollIntoView({behavior,block:'center'});
  });
}


function emptyMeaningBank(){return {version:1,entries:[],totalOccurrences:0,completedSurahs:[],updatedAt:0,cacheSaved:true}}
function loadMeaningBankCache(){
  try{
    const raw=localStorage.getItem(MEANING_BANK_CACHE_KEY);if(!raw)return emptyMeaningBank();
    const parsed=JSON.parse(raw);if(parsed?.version!==1||!Array.isArray(parsed.entries))return emptyMeaningBank();
    parsed.completedSurahs=Array.isArray(parsed.completedSurahs)?parsed.completedSurahs.map(Number).filter(n=>n>=1&&n<=114):[];
    parsed.totalOccurrences=Number(parsed.totalOccurrences)||parsed.entries.reduce((sum,e)=>sum+(Number(e.count)||0),0);
    parsed.cacheSaved=true;return parsed;
  }catch{return emptyMeaningBank()}
}
function saveMeaningBankCache(){
  try{meaningBank.updatedAt=Date.now();localStorage.setItem(MEANING_BANK_CACHE_KEY,JSON.stringify(meaningBank));meaningBank.cacheSaved=true}
  catch{meaningBank.cacheSaved=false}
}
function normalizeMeaningKey(value=''){
  return plainWordArabic(String(value)).replace(/[أإآ]/g,'ا').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
}
function meaningKnownSet(){return new Set(state.meanings.known||[])}
function meaningEntry(key){return (meaningBank.entries||[]).find(e=>e.key===key)||null}
function primaryMeaning(entry){return String(entry?.meanings?.[0]||entry?.meaning||'').trim()||'Meaning unavailable'}
function mergeMeaningSurah(map,surahId,grouped){
  let added=0;
  Object.entries(grouped||{}).sort((a,b)=>Number(a[0])-Number(b[0])).forEach(([ayahRaw,rawWords])=>{
    const ayah=Number(ayahRaw)||1;let words=Array.isArray(rawWords)?rawWords:[];
    if(ayah===1&&hasBismillah(surahId)&&firstWordsAreBismillah(words))words=words.slice(4);
    words.forEach(w=>{
      const arabic=String(w.arabic||'').trim(),key=normalizeMeaningKey(arabic);if(!key)return;
      const meaning=String(w.meaning||'').trim(),transliteration=String(w.transliteration||'').trim();
      let entry=map.get(key);
      if(!entry){entry={key,arabic:arabic||key,meanings:[],transliteration, count:0,firstSurah:Number(surahId),firstAyah:ayah};map.set(key,entry)}
      entry.count=(Number(entry.count)||0)+1;added++;
      if(!entry.transliteration&&transliteration)entry.transliteration=transliteration;
      if(meaning&&!entry.meanings.includes(meaning)&&entry.meanings.length<3)entry.meanings.push(meaning);
    });
  });
  return added;
}
function meaningBankMap(){return new Map((meaningBank.entries||[]).map(e=>[e.key,{...e,meanings:Array.isArray(e.meanings)?e.meanings:[e.meaning].filter(Boolean)}]))}
async function ensureMeaningBank(){
  if(meaningBank.completedSurahs?.length>=114)return meaningBank;
  if(meaningBuildPromise)return meaningBuildPromise;
  meaningBuildPromise=(async()=>{
    const completed=new Set(meaningBank.completedSurahs||[]);const map=meaningBankMap();
    const pending=Array.from({length:114},(_,i)=>i+1).filter(id=>!completed.has(id));
    for(let i=0;i<pending.length;i+=6){
      const batch=pending.slice(i,i+6);
      const results=await Promise.allSettled(batch.map(async id=>({id,grouped:await fetchWordByWordSurah(id)})));
      results.forEach(result=>{if(result.status!=='fulfilled')return;mergeMeaningSurah(map,result.value.id,result.value.grouped);completed.add(result.value.id)});
      meaningBank={...meaningBank,entries:[...map.values()],completedSurahs:[...completed].sort((a,b)=>a-b)};
      meaningBank.totalOccurrences=meaningBank.entries.reduce((sum,e)=>sum+(Number(e.count)||0),0);
      saveMeaningBankCache();
      if(state.mode==='practice'&&state.screen==='meanings')render();
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    return meaningBank;
  })().finally(()=>{meaningBuildPromise=null;if(state.mode==='practice'&&state.screen==='meanings')render()});
  return meaningBuildPromise;
}
function meaningCoverage(){
  const known=meaningKnownSet(),entries=meaningBank.entries||[];
  const knownEntries=entries.filter(e=>known.has(e.key));
  const knownOccurrences=knownEntries.reduce((sum,e)=>sum+(Number(e.count)||0),0);
  const totalOccurrences=Math.max(0,Number(meaningBank.totalOccurrences)||0);
  return {knownEntries,knownOccurrences,totalOccurrences,uniquePct:entries.length?knownEntries.length/entries.length*100:0,coveragePct:totalOccurrences?knownOccurrences/totalOccurrences*100:0};
}
function filteredMeaningEntries({knownOnly=false}={}){
  const known=meaningKnownSet(),q=meaningsQuery.trim().toLowerCase();
  let entries=(meaningBank.entries||[]).filter(e=>!knownOnly||known.has(e.key));
  if(q)entries=entries.filter(e=>`${e.arabic} ${e.key} ${e.transliteration||''} ${(e.meanings||[]).join(' ')}`.toLowerCase().includes(q));
  if(state.meanings.sort==='quran')entries.sort((a,b)=>(a.firstSurah-b.firstSurah)||(a.firstAyah-b.firstAyah));
  else if(state.meanings.sort==='az')entries.sort((a,b)=>String(a.key).localeCompare(String(b.key),'ar'));
  else entries.sort((a,b)=>(Number(b.count)||0)-(Number(a.count)||0)||String(a.key).localeCompare(String(b.key),'ar'));
  return entries;
}
function formatLearnedOn(value){if(!value)return '';const d=new Date(value);if(Number.isNaN(d.getTime()))return '';return d.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})}
function meaningWordRow(entry){
  const known=meaningKnownSet().has(entry.key);const perf=state.meanings.performance?.[entry.key]||{};const attempts=(perf.correct||0)+(perf.wrong||0);const learned=known?formatLearnedOn(state.meanings.learnedOn?.[entry.key]):'';
  return `<article class="meaning-word-row ${known?'known':''}"><div class="meaning-word-main"><div class="meaning-arabic" dir="rtl">${escapeHtml(entry.arabic||entry.key)}</div><div class="meaning-definition"><b>${escapeHtml(primaryMeaning(entry))}</b>${entry.transliteration?`<span>${escapeHtml(entry.transliteration)}</span>`:''}<small>Appears ${Number(entry.count)||0}× · first ${entry.firstSurah}:${entry.firstAyah}${attempts?` · quiz ${perf.correct||0}/${attempts}`:''}</small>${learned?`<small class="meaning-learned-date">Learned on ${escapeHtml(learned)}</small>`:''}</div></div><button class="word-known-toggle ${known?'on':''}" data-action="toggle-known-word" data-key="${escapeHtml(entry.key)}" aria-pressed="${known?'true':'false'}"><span>${known?'Known':'Learn'}</span><i></i></button></article>`;
}
function highImpactWords(){const known=meaningKnownSet();return [...(meaningBank.entries||[])].filter(e=>!known.has(e.key)&&primaryMeaning(e)!=='Meaning unavailable').sort((a,b)=>(Number(b.count)||0)-(Number(a.count)||0)).slice(0,6)}
function shuffle(list){const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function makeMeaningQuizQuestion(){
  const known=meaningKnownSet();let pool=(meaningBank.entries||[]).filter(e=>known.has(e.key)&&primaryMeaning(e)!=='Meaning unavailable');
  if(pool.length<4){quizQuestion=null;return null}
  // Bias a little toward words previously missed, while still mixing the bank.
  const weighted=pool.flatMap(e=>{const perf=state.meanings.performance?.[e.key]||{};return Array(1+Math.min(3,Math.max(0,(perf.wrong||0)-(perf.correct||0)))).fill(e)});
  const answer=weighted[Math.floor(Math.random()*weighted.length)]||pool[0];
  const mode=state.meanings.quiz.mode;
  const valueOf=e=>mode==='ar-en'?primaryMeaning(e):(e.arabic||e.key);
  const distractors=shuffle(pool.filter(e=>e.key!==answer.key&&valueOf(e)!==valueOf(answer))).slice(0,3);
  const options=shuffle([answer,...distractors]);
  quizQuestion={answerKey:answer.key,prompt:mode==='ar-en'?(answer.arabic||answer.key):primaryMeaning(answer),options,mode};quizFeedback=null;return quizQuestion;
}
function quizView(){
  const coverage=meaningCoverage(),knownCount=coverage.knownEntries.filter(e=>primaryMeaning(e)!=='Meaning unavailable').length;
  if(knownCount<4)return `<section class="meaning-quiz-card"><div class="meaning-quiz-empty"><div class="meaning-quiz-icon">?</div><h2>Add at least 4 known words</h2><p>Mark words you know in the Word Bank, then come back here to test yourself.</p><button class="primary" data-action="meaning-tab" data-tab="all">Open Word Bank</button></div></section>`;
  if(!quizQuestion||quizQuestion.mode!==state.meanings.quiz.mode||!meaningEntry(quizQuestion.answerKey))makeMeaningQuizQuestion();
  const q=quizQuestion;if(!q)return '';
  const stats=state.meanings.quiz;
  return `<div class="quiz-mode-switch"><button data-action="quiz-mode" data-mode="ar-en" class="${stats.mode==='ar-en'?'active':''}">Arabic → Meaning</button><button data-action="quiz-mode" data-mode="en-ar" class="${stats.mode==='en-ar'?'active':''}">Meaning → Arabic</button></div><section class="meaning-quiz-card"><div class="quiz-stats"><span>${stats.correct||0} correct</span><span>Streak ${stats.streak||0}</span><span>Best ${stats.best||0}</span></div><div class="quiz-prompt ${q.mode==='ar-en'?'arabic':''}" ${q.mode==='ar-en'?'dir="rtl"':''}>${escapeHtml(q.prompt)}</div><div class="quiz-options">${q.options.map(opt=>{const label=q.mode==='ar-en'?primaryMeaning(opt):(opt.arabic||opt.key);const selected=quizFeedback?.selectedKey===opt.key;const correct=quizFeedback&&opt.key===q.answerKey;const cls=quizFeedback?(correct?'correct':selected?'wrong':''):'';return `<button class="quiz-option ${q.mode==='en-ar'?'arabic':''} ${cls}" data-action="quiz-answer" data-key="${escapeHtml(opt.key)}" ${quizFeedback?'disabled':''}>${escapeHtml(label)}</button>`}).join('')}</div>${quizFeedback?`<div class="quiz-feedback ${quizFeedback.correct?'good':'bad'}"><b>${quizFeedback.correct?'Correct':'Not quite'}</b><span>${escapeHtml(q.mode==='ar-en'?primaryMeaning(meaningEntry(q.answerKey)):(meaningEntry(q.answerKey)?.arabic||q.answerKey))}</span></div><button class="primary full" data-action="quiz-next">Next word</button>`:''}</section>`;
}
function meaningsView(){
  const complete=(meaningBank.completedSurahs||[]).length>=114;const progress=(meaningBank.completedSurahs||[]).length;const coverage=meaningCoverage();
  const sourceEntries=state.meanings.tab==='known'?filteredMeaningEntries({knownOnly:true}):filteredMeaningEntries();const shown=sourceEntries.slice(0,meaningsVisibleLimit);
  const impact=highImpactWords();
  const content=state.meanings.tab==='quiz'?quizView():`<div class="meaning-toolbar"><input id="meaning-search" class="search" value="${escapeHtml(meaningsQuery)}" placeholder="Search Arabic, transliteration, or meaning"><select id="meaning-sort" class="select compact-select"><option value="common" ${state.meanings.sort==='common'?'selected':''}>Most common</option><option value="quran" ${state.meanings.sort==='quran'?'selected':''}>Quran order</option><option value="az" ${state.meanings.sort==='az'?'selected':''}>Arabic A–Z</option></select></div>${state.meanings.tab==='all'&&impact.length?`<section class="impact-card"><div class="between"><div><b>Highest-impact words to learn</b><div class="tiny muted">Common unknown words increase your Quran coverage fastest.</div></div><span class="impact-badge">Top ${impact.length}</span></div><div class="impact-words">${impact.map(e=>`<button data-action="toggle-known-word" data-key="${escapeHtml(e.key)}"><span class="impact-arabic" dir="rtl">${escapeHtml(e.arabic||e.key)}</span><span>${escapeHtml(primaryMeaning(e))}</span><small>${e.count}×</small></button>`).join('')}</div></section>`:''}<div class="meaning-list">${shown.map(meaningWordRow).join('')||'<div class="empty">No words match this view.</div>'}</div>${sourceEntries.length>shown.length?`<button class="secondary full section" data-action="meaning-more">Show more · ${sourceEntries.length-shown.length} remaining</button>`:''}`;
  return `<button id="meanings-to-top" class="meanings-to-top" data-action="meanings-top" aria-label="Back to top" title="Back to top">↑</button><div class="between"><div><p class="tiny muted" style="margin:0">Quran vocabulary</p><h1 class="title">Meanings</h1></div><span class="meaning-build-pill ${complete?'complete':''}">${complete?'Quran indexed':`Indexing ${progress}/114`}</span></div><p class="subtitle">Build a personal bank of Quranic words you understand and test yourself.</p><div class="meaning-metrics section"><div class="meaning-metric primary"><span>${complete?'Quran coverage':'Indexed coverage'}</span><strong>${coverage.coveragePct.toFixed(1)}%</strong><small>${coverage.knownOccurrences.toLocaleString()} of ${coverage.totalOccurrences.toLocaleString()} indexed word occurrences</small></div><div class="meaning-metric"><span>Known words</span><strong>${coverage.knownEntries.length.toLocaleString()}</strong><small>${coverage.uniquePct.toFixed(1)}% of ${meaningBank.entries.length.toLocaleString()} unique forms</small></div></div>${!complete?`<div class="meaning-index-progress"><i style="width:${Math.round(progress/114*100)}%"></i><span>${progress?`You can use the bank while the remaining Surahs index in the background.`:'Building the Quran word bank…'}</span></div>`:''}${meaningBank.cacheSaved===false?'<div class="notice section">The word index works in this session, but this browser could not cache the full index locally.</div>':''}<div class="meaning-tabs section"><button data-action="meaning-tab" data-tab="all" class="${state.meanings.tab==='all'?'active':''}">Word Bank</button><button data-action="meaning-tab" data-tab="known" class="${state.meanings.tab==='known'?'active':''}">My Words · ${coverage.knownEntries.length}</button><button data-action="meaning-tab" data-tab="quiz" class="${state.meanings.tab==='quiz'?'active':''}">Test Me</button></div>${content}`;
}

function shell(content){
  const practice=state.mode==='practice';
  const nav=practice?[
    ['home','Home'],['surahs','Surahs'],['meanings','Meanings'],['stats','Stats'],['profile','Profile']
  ]:[['listen-surahs','Surahs'],['now-playing','Now Playing'],['recent','Recent']];
  const practiceParent={
    'surah-detail':'surahs',
    'log':'surahs',
    'history':'surahs',
    'all-red':'home',
    'queue':'home'
  };
  const active=practice?(practiceParent[state.screen]||state.screen):state.listen.screen;
  return `<div class="frame">
    <header class="topbar"><div class="mode-switch"><button data-action="mode" data-mode="practice" class="${practice?'active':''}">Practice</button><button data-action="mode" data-mode="listen" class="${!practice?'active':''}">Listen</button></div></header>
    <main class="content">${toast?`<div class="notice" style="margin-bottom:8px">${escapeHtml(toast)}</div>`:''}${content}</main>
    <nav class="bottom-nav ${practice?'practice':'listen'}">${nav.map(([id,label])=>`<button data-action="nav" data-screen="${id}" class="${active===id?'active':''}">${label}</button>`).join('')}</nav>
  </div>`;
}

function render(){
  const body=state.mode==='practice'?renderPractice():renderListen();
  app.innerHTML=shell(body);bind();
  if(state.mode==='listen'&&state.listen.screen==='now-playing'){sizeAyahFlowTracks();sizeAyahLineFlowTracks();}
  if(state.mode==='practice'&&state.screen==='surah-detail'&&state.experimentalMushaf)fitExactMushafLines();
}

// QCF gives the correct physical page and line membership, but the browser can
// still render a line a little shorter or longer depending on font metrics and
// viewport width. After the page font has loaded, gently fit normal Quran lines
// without moving any word to another physical line.
function fitExactMushafLines(){
  const run=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
    document.querySelectorAll('.exact-mushaf-line').forEach(line=>{
      const flow=line.querySelector('.exact-qcf-flow');
      if(!flow)return;
      flow.style.removeProperty('column-gap');
      flow.style.removeProperty('transform');
      flow.style.removeProperty('width');
      flow.classList.remove('qcf-short-line','qcf-fitted-line','qcf-compressed-line');
      const words=[...flow.querySelectorAll('.qcf-word')];
      if(!words.length)return;
      const lineBox=line.getBoundingClientRect();
      const target=Math.max(1,lineBox.width-46);
      const natural=words.reduce((sum,w)=>sum+w.getBoundingClientRect().width,0);
      const ratio=natural/target;
      if(ratio<.80){flow.classList.add('qcf-short-line');return}
      if(ratio<=1.015){
        const gaps=Math.max(1,words.length-1);
        const extra=Math.max(0,target-natural);
        const gap=Math.min(5.2,extra/gaps);
        flow.style.columnGap=`${gap.toFixed(2)}px`;
        flow.classList.add('qcf-fitted-line');
        return;
      }
      const scale=Math.max(.90,Math.min(1,target/natural));
      flow.style.transform=`scaleX(${scale})`;
      flow.style.width=`${100/scale}%`;
      flow.classList.add('qcf-compressed-line');
    });
  }));
  if(document.fonts?.ready)document.fonts.ready.then(run).catch(run);else setTimeout(run,80);
}

// Match the smooth ayah-progress line to the visible Arabic wording instead of
// always stretching it across the full content column. Short ayahs therefore
// get a shorter track; longer/wrapped ayahs naturally clamp to the available
// reader width. Meanings are ignored for sizing so English glosses never make
// the Quran progress cue look artificially long.
function sizeAyahFlowTracks(){
  requestAnimationFrame(()=>{
    document.querySelectorAll('.listen-ayah-row').forEach(row=>{
      const track=row.querySelector('.ayah-flow-track');
      const flow=row.querySelector('.listen-word-flow');
      if(!track||!flow)return;
      const arabic=[...flow.querySelectorAll('.listen-word-arabic')];
      if(!arabic.length){track.style.width='100%';return}
      const available=Math.max(0,flow.getBoundingClientRect().width);
      const gap=parseFloat(getComputedStyle(flow).columnGap)||0;
      const arabicWidth=arabic.reduce((sum,el)=>sum+el.getBoundingClientRect().width,0)+(gap*Math.max(0,arabic.length-1));
      const width=Math.min(available,Math.max(54,arabicWidth));
      track.style.width=`${Math.round(width)}px`;
    });
  });
}

// Experimental multi-line ayah flow. The tracks are derived from the actual
// rendered word rows, so a wrapped four-line ayah receives four thin tracks.
// Progress moves through those visual lines in reading order without a dot.
function sizeAyahLineFlowTracks(){
  requestAnimationFrame(()=>{
    document.querySelectorAll('.listen-ayah-row').forEach(row=>{
      const content=row.querySelector('.listen-ayah-content');
      const flow=row.querySelector('.listen-word-flow');
      if(!content||!flow)return;
      content.querySelector('.ayah-line-flow-layer')?.remove();
      const stacks=[...flow.querySelectorAll('.listen-word-stack')];
      if(!stacks.length)return;
      const flowRect=flow.getBoundingClientRect();
      const groups=[];
      stacks.forEach(stack=>{
        const rect=stack.getBoundingClientRect();
        const top=Math.round(rect.top-flowRect.top);
        let group=groups.find(g=>Math.abs(g.top-top)<=3);
        if(!group){group={top,items:[]};groups.push(group)}
        group.items.push(stack);
      });
      groups.sort((a,b)=>a.top-b.top);
      const layer=document.createElement('div');layer.className='ayah-line-flow-layer';layer.setAttribute('aria-hidden','true');
      groups.forEach((group,index)=>{
        const rects=group.items.map(x=>x.getBoundingClientRect());
        const left=Math.min(...rects.map(r=>r.left))-flowRect.left;
        const right=Math.max(...rects.map(r=>r.right))-flowRect.left;
        const bottom=Math.max(...rects.map(r=>r.bottom))-flowRect.top;
        const width=Math.max(22,right-left);
        const seg=document.createElement('span');seg.className='ayah-line-flow-segment';seg.dataset.flowWidth=String(width);seg.dataset.flowLine=String(index);
        seg.style.left=`${Math.round(left)}px`;seg.style.top=`${Math.round(bottom+2)}px`;seg.style.width=`${Math.round(width)}px`;
        seg.innerHTML='<i class="ayah-line-flow-fill"></i>';layer.appendChild(seg);
      });
      flow.appendChild(layer);
    });
    const pack=audioCache.get(audioKey());const timing=pack?.timings?.[state.listen.track];if(timing)updateAyahFlowUI(player.currentTime*1000,timing);
  });
}
window.addEventListener('resize',()=>{if(state.mode==='listen'&&state.listen.screen==='now-playing'){sizeAyahFlowTracks();sizeAyahLineFlowTracks()}});
function renderPractice(){
  if(state.screen==='home')return homeView();
  if(state.screen==='surahs')return surahsView();
  if(state.screen==='all-red')return allRedAyahsView();
  if(state.screen==='surah-detail')return surahDetailView();
  if(state.screen==='log')return logView();
  if(state.screen==='history')return historyView();
  if(state.screen==='meanings')return meaningsView();
  if(state.screen==='queue')return queueView();
  if(state.screen==='stats')return statsView();
  if(state.screen==='profile')return profileView();
  return surahsView();
}
function renderListen(){
  if(state.listen.screen==='listen-surahs')return listenSurahsView();
  if(state.listen.screen==='now-playing')return nowPlayingView();
  if(state.listen.screen==='recent')return recentView();
  return listenSurahsView();
}

function localDayKey(ts){const d=new Date(ts||Date.now());return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function todayPracticeIds(){const today=localDayKey(Date.now()),ids=new Set();for(const id of state.collection){for(const log of (rev(id).logs||[])){if(log.createdAt&&localDayKey(log.createdAt)===today){ids.add(Number(id));break}}}return ids}
function practiceStreak(){const days=new Set();for(const id of state.collection){for(const log of (rev(id).logs||[])){if(log.createdAt)days.add(localDayKey(log.createdAt))}}let streak=0;const d=new Date();for(let i=0;i<366;i++){const key=localDayKey(d);if(days.has(key)){streak++;d.setDate(d.getDate()-1);continue}if(i===0){d.setDate(d.getDate()-1);continue}break}return streak}
function latestPracticeSurah(){let best=null;for(const id of state.collection){const s=viewModel(id);const log=(s.logs||[]).slice().sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0))[0];if(log?.createdAt&&(!best||log.createdAt>best.at))best={surah:s,at:log.createdAt}}return best}
function totalCurrentRed(){return allCollection().reduce((sum,s)=>sum+(s.redAyahs?.length||0),0)}
function updateRecentListenPosition(){const id=Number(state.listen.selectedSurah);if(!id)return;const recent=state.listen.recent||[];const hit=recent.find(r=>Number(r.id)===id);if(hit){hit.lastAyah=Math.max(1,Number(state.listen.track)+1);hit.positionUpdatedAt=Date.now();persist()}}
function homeView(){
  const list=[...allCollection()].sort((a,b)=>strengthScore(a)-strengthScore(b));
  const attention=list.filter(needAttention);const todayIds=todayPracticeIds();const target=Math.min(5,Math.max(1,state.collection.length));const done=Math.min(target,todayIds.size);const pct=Math.round(done/target*100);
  const lastPractice=latestPracticeSurah();const suggested=lastPractice?.surah||attention[0]||list[0]||null;
  const listenRecent=(state.listen.recent||[])[0]||null;const listenSurah=listenRecent?catalogItem(listenRecent.id):null;const listenAyah=Math.max(1,Number(listenRecent?.lastAyah)||1);
  const coverage=meaningCoverage();const quickWord=highImpactWords()[0]||null;const redTotal=totalCurrentRed();const streak=practiceStreak();
  return `<div class="home-welcome"><div><p class="tiny muted" style="margin:0">Your Quran space</p><h1 class="title">Assalamualaikum${state.profile.displayName?`, ${escapeHtml(state.profile.displayName)}`:''}</h1><p class="subtitle">Pick up exactly where you left off.</p></div><span class="home-memory-pill">${state.collection.length}<small>memorized</small></span></div>
    <section class="home-hero section"><div class="home-progress-ring" style="--home-progress:${pct}%"><div><strong>${done}</strong><span>/ ${target}</span></div></div><div class="home-hero-copy"><span class="home-kicker">Today's momentum</span><h2>${done>=target?'Revision goal complete 🎉':`${target-done} Surah${target-done===1?'':'s'} to go`}</h2><p>${streak?`${streak}-day practice streak · `:''}${redTotal} red ayah${redTotal===1?'':'s'} currently need attention.</p><button class="primary home-hero-btn" data-action="go-queue">${done>=target?'Review again':'Open today’s queue'} →</button></div></section>
    <div class="home-section-title section"><div><h2>Continue</h2><p>Jump back in without searching.</p></div></div>
    <div class="home-continue-grid">${listenSurah?`<button class="home-continue-card listen" data-action="home-continue-listen" data-id="${listenSurah.id}" data-ayah="${listenAyah}"><span class="home-card-icon">▶</span><span class="home-card-label">Continue listening</span><b>${escapeHtml(listenSurah.name)}</b><span class="home-card-arabic">${escapeHtml(listenSurah.arabic||'')}</span><small>Ayah ${listenAyah} · ${escapeHtml(formatListenedWhen(listenRecent))}</small></button>`:`<button class="home-continue-card listen" data-action="home-listen"><span class="home-card-icon">▶</span><span class="home-card-label">Start listening</span><b>Choose a Surah</b><small>Your listening history will appear here.</small></button>`}${suggested?`<button class="home-continue-card practice-card" data-action="home-continue-practice" data-id="${suggested.id}"><span class="home-card-icon">↻</span><span class="home-card-label">${lastPractice?'Continue revision':'Suggested revision'}</span><b>${escapeHtml(suggested.name)}</b><span class="home-card-arabic">${escapeHtml(suggested.arabic||'')}</span><small>${lastPractice?`Last practiced ${escapeHtml(suggested.lastRecited||'recently')}`:`${suggested.redAyahs.length} red ayah${suggested.redAyahs.length===1?'':'s'} · weakest next`}</small></button>`:''}</div>
    <div class="home-mini-grid section"><button data-action="home-red-ayahs"><span class="home-mini-icon red">●</span><b>${redTotal}</b><small>Red ayahs</small></button><button data-action="home-meanings"><span class="home-mini-icon meaning">Aa</span><b>${coverage.coveragePct.toFixed(1)}%</b><small>Quran words known</small></button><div class="home-mini-stat"><span class="home-mini-icon streak">✦</span><b>${streak}</b><small>Day streak</small></div></div>
    ${quickWord?`<section class="home-word-card section"><div class="home-word-copy"><span class="home-kicker">Quick meaning win</span><div class="home-word-arabic" dir="rtl">${escapeHtml(quickWord.arabic||quickWord.core)}</div><b>${escapeHtml(primaryMeaning(quickWord))}</b><small>Appears ${Number(quickWord.count)||0}× in the Quran · ${quickWord.forms?.length||1} related form${(quickWord.forms?.length||1)===1?'':'s'}</small></div><button class="home-learn-btn" data-action="home-learn-word" data-key="${escapeHtml(quickWord.key)}">I know this ✓</button></section>`:''}
    <div class="between section home-attention-head"><div><h2 class="section-title">Needs attention</h2><p class="tiny muted" style="margin:2px 0 0">Your weakest Surahs right now</p></div><span class="tiny muted">${attention.length} Surahs</span></div>
    <div class="home-attention-list">${attention.slice(0,5).map(compactSurahRow).join('')||'<div class="empty">Nothing urgent right now.</div>'}</div>`;
}

function allRedAyahsSorted(){
  return allCollection()
    .filter(s=>(s.redAyahs||[]).length)
    .sort((a,b)=>Number(a.id)-Number(b.id))
    .map(s=>({...s,redAyahs:[...(s.redAyahs||[])].map(Number).sort((a,b)=>a-b)}));
}
function allRedAyahsView(){
  const groups=allRedAyahsSorted();
  const total=groups.reduce((sum,s)=>sum+s.redAyahs.length,0);
  return `<div class="backline"><button class="link-btn" data-action="back-home">‹ Home</button><span class="tiny muted">${total} red ayah${total===1?'':'s'}</span></div>
    <div class="all-red-hero"><div><p class="tiny muted" style="margin:0">Needs work</p><h1 class="title">All Red Ayahs</h1><p class="subtitle">Quran order · Surahs first, then ayahs in order.</p></div><span class="all-red-count">${total}</span></div>
    <div class="all-red-list section">${groups.length?groups.map(s=>{const verses=verseCache.get(Number(s.id))||[];return `<section class="all-red-surah"><button class="all-red-surah-head" data-action="open-red-surah" data-id="${s.id}"><span><b>${s.id} · ${escapeHtml(s.name)}</b><span class="arabic-name">${escapeHtml(s.arabic||'')}</span></span><small>${s.redAyahs.length} red</small></button><div class="all-red-ayahs">${s.redAyahs.map(n=>{const verse=verses.find(v=>Number(v.number)===Number(n));return `<button class="all-red-ayah-row" data-action="open-red-mushaf" data-surah="${s.id}" data-ayah="${n}"><span class="all-red-num">${n}</span><span class="all-red-text">${verse?escapeHtml(verse.text):'<i>Loading ayah…</i>'}</span><span class="all-red-arrow">›</span></button>`}).join('')}</div></section>`}).join(''):'<div class="all-red-empty"><span>✓</span><b>No red ayahs right now</b><p>Everything in your revision collection is currently green.</p></div>'}</div>`;
}
async function ensureAllRedAyahVerses(){
  const ids=allRedAyahsSorted().map(s=>Number(s.id)).filter(id=>!verseCache.has(id));
  if(!ids.length)return;
  await Promise.allSettled(ids.map(id=>ensureVerses(id)));
  if(state.mode==='practice'&&state.screen==='all-red')render();
}

function compactSurahRow(s){
  return `<button class="surah-row" data-action="open-surah" data-id="${s.id}"><span class="dot ${s.redAyahs.length?'red':'green'}"></span><div class="surah-main"><div class="surah-line"><div><span class="surah-name">${s.id} · ${escapeHtml(s.name)}</span><span class="arabic-name">${escapeHtml(s.arabic||'')}</span></div><span class="stars">${stars(s.rating)}</span></div><div class="surah-meta"><span>Last recited: ${escapeHtml(s.lastRecited||'Not yet')}</span><span>${s.redAyahs.length} red ayah${s.redAyahs.length===1?'':'s'}</span></div></div></button>`;
}

function surahsView(){
  let items=allCollection().filter(s=>(`${s.id} ${s.name} ${s.arabic||''}`).toLowerCase().includes(state.query.toLowerCase()));
  if(state.sort==='weak')items.sort((a,b)=>strengthScore(a)-strengthScore(b));
  if(state.sort==='strong')items.sort((a,b)=>strengthScore(b)-strengthScore(a));
  if(state.sort==='recent')items.sort((a,b)=>dateKey(a.lastRecited)-dateKey(b.lastRecited));
  if(state.sort==='quran')items.sort((a,b)=>a.id-b.id);
  return `<div class="between"><div><h1 class="title">Surahs</h1><p class="subtitle">${state.collection.length} in your revision collection</p></div><button class="icon-btn" data-action="open-add" aria-label="Add memorized Surah">+</button></div>
    <div class="section" style="margin-top:8px"><input id="surah-search" class="search" value="${escapeHtml(state.query)}" placeholder="Search Surah or number" /></div>
    <div class="chips"><button class="chip ${state.sort==='quran'?'active':''}" data-action="sort" data-sort="quran">Quran order</button><button class="chip ${state.sort==='weak'?'active':''}" data-action="sort" data-sort="weak">Weakest</button><button class="chip ${state.sort==='strong'?'active':''}" data-action="sort" data-sort="strong">Strongest</button><button class="chip ${state.sort==='recent'?'active':''}" data-action="sort" data-sort="recent">Least recent</button></div>
    <div class="surah-list">${items.map(compactSurahRow).join('')||'<div class="empty">No matching Surahs.</div>'}</div>`;
}

function surahDetailView(){
  const s=viewModel(state.selectedSurah);const verses=verseCache.get(s.id);
  const chosen=state.surahView==='history'?null:(verses?(state.surahView==='red'?verses.filter(v=>s.redAyahs.includes(v.number)):verses):null);
  return `<div class="backline"><button class="link-btn" data-action="back-surahs">‹ Surahs</button><button class="link-btn" data-action="history">Logs</button></div>
    <div class="detail-head"><div class="detail-title"><div><h1>${s.id} · ${escapeHtml(s.name)} <span class="arabic-name">${escapeHtml(s.arabic||'')}</span></h1></div><span class="stars">${stars(s.rating)}</span></div><div class="detail-meta"><span>Last recited: ${escapeHtml(s.lastRecited||'Not yet')}</span><span>${s.redAyahs.length} ayahs need work</span></div></div>
    <div class="segment surah-detail-segment"><button data-action="surah-view" data-view="whole" class="${state.surahView==='whole'?'active':''}">Whole Surah</button><button data-action="surah-view" data-view="red" class="${state.surahView==='red'?'active':''}">Needs Work · ${s.redAyahs.length}</button><button data-action="surah-view" data-view="history" class="${state.surahView==='history'?'active':''}">History</button></div>
    ${state.surahView==='history'?renderRedHistory(s):`<button class="log-btn" data-action="enter-log">Enter Log</button><div class="ayah-list">${chosen?`${state.surahView==='whole'?practiceTopRow(s.id):''}${state.surahView==='whole'&&state.experimentalMushaf?renderMushafPages(chosen,s):renderVerses(chosen,s)}`:`<div class="empty">Loading Quran text…</div>`}</div>`}`;
}
function practiceTopRow(surahId){
  const toggle=`<button class="exp-toggle ${state.experimentalMushaf?'on':''}" data-action="toggle-exp-mushaf" aria-pressed="${state.experimentalMushaf?'true':'false'}">${state.experimentalMushaf?'Exact Mushaf ON':'Exact Mushaf'}</button>`;
  if(hasBismillah(surahId)&&!state.experimentalMushaf)return `<div class="bismillah-tools-row"><div class="bismillah-row bismillah-inline" aria-label="Bismillah">${BISMILLAH}</div>${toggle}</div>`;
  return `<div class="mushaf-tools-only"><div><b class="tiny">${state.experimentalMushaf?'604-page Madinah/QCF layout':'Experimental'}</b>${state.experimentalMushaf?'<div class="tiny muted">Physical page and line placement</div>':''}</div>${toggle}</div>`;
}
function mushafPagesForVerses(verses=[]){return [...new Set(verses.map(v=>Number(v.page)).filter(n=>n>=1&&n<=604))].sort((a,b)=>a-b)}
function pageSurahStarts(pack){const starts=[];for(const w of pack?.words||[]){if(Number(w.verseNumber)===1&&Number(w.position)===1&&!starts.some(x=>x.chapterId===Number(w.chapterId)))starts.push({chapterId:Number(w.chapterId),line:Number(w.line)||1})}return starts}
function toArabicPageDigits(value){return String(value).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[Number(d)]||d)}
function activeMushafPage(verses=[]){const pages=mushafPagesForVerses(verses);const current=Number(state.mushafPage);return current>=1&&current<=604?current:(pages[0]||1)}
function isMushafWordRed(word){const id=Number(word.chapterId),ayah=Number(word.verseNumber);return state.collection.includes(id)&&((state.revision[id]?.redAyahs)||[]).includes(ayah)}
function activeMushafCache(){return state.mushafTajweed?tajweedMushafPageCache:mushafPageCache}
function activeMushafPack(page){return activeMushafCache().get(Number(page))||mushafPageCache.get(Number(page))||null}
function isMushafFocusWord(word){return !!state.mushafFocus&&Number(word.chapterId)===Number(state.mushafFocus.surah)&&Number(word.verseNumber)===Number(state.mushafFocus.ayah)}
function tajweedFallbackClass(word){const t=String(word?.tajweedText||'').toLowerCase();if(!t)return '';if(/ghunnah|ikhfa/.test(t))return 'tw-word-green';if(/madda|madd_|madd/.test(t))return 'tw-word-red';if(/qalqalah|iqlab|idghaam|idgham|laam_shamsiyah|ham_wasl/.test(t))return 'tw-word-gold';return ''}
function lineVerseKeys(pack,line){return [...new Set((pack?.words||[]).filter(w=>Number(w.line)===Number(line)).map(w=>w.verseKey).filter(Boolean))]}
function lineReferenceSheet(page,line){const pack=activeMushafPack(page);const keys=lineVerseKeys(pack,line);const labels=keys.map(key=>{const [sid,ayah]=String(key).split(':').map(Number);const c=catalogItem(sid),noted=hasAyahNote(sid,ayah);return `<div class="line-ref-ayah"><div><b>${escapeHtml(c.name)} ${sid}:${ayah}</b><span class="arabic-name">${escapeHtml(c.arabic||'')}</span></div><button class="ayah-note-inline ${noted?'has-note':''}" data-action="practice-ayah-note" data-surah="${sid}" data-ayah="${ayah}">${noted?'View note':'Add note'}</button></div>`}).join('');return `<div class="modal-backdrop"><section class="sheet compact-sheet" role="dialog" aria-modal="true" aria-label="Page ${page} line ${line}" data-sheet><div class="sheet-head"><div><h2 class="title">Page ${page} · Line ${line}</h2><p class="subtitle">Exact Madinah/QCF V2 line reference</p></div><button class="close" data-action="close-sheet">×</button></div><div class="section"><div class="tiny muted">Ayah${keys.length===1?'':'s'} on this physical line</div>${labels||'<div class="empty">Surah heading, Bismillah, or ornamental line.</div>'}</div><div class="notice section">The line number is an overlay only. It does not change the Quran text spacing or line placement.</div></section></div>`}
function renderExactMushafPage(page,s){
  const pack=activeMushafPack(page);
  if(!pack)return `<section class="exact-mushaf-page loading"><div class="empty">Loading exact Mushaf page ${page}…</div></section>`;
  if(pack.error)return `<section class="exact-mushaf-page loading"><div class="empty">Could not load exact Mushaf page ${page}. Check your internet connection.</div></section>`;
  const lineMap=new Map();for(const w of pack.words||[]){const ln=Number(w.line)||0;if(!ln)continue;if(!lineMap.has(ln))lineMap.set(ln,[]);lineMap.get(ln).push(w)}
  const specials=new Map();for(const start of pageSurahStarts(pack)){if(start.chapterId===1)continue;const headerLine=Math.max(1,start.line-(hasBismillah(start.chapterId)?2:1));specials.set(headerLine,{type:'header',chapterId:start.chapterId});if(hasBismillah(start.chapterId))specials.set(Math.max(1,start.line-1),{type:'bismillah',chapterId:start.chapterId})}
  const family=state.mushafTajweed?`QCF2T-p${page}`:`QCF2-p${page}`;
  const firstWord=(pack.words||[])[0]||{};const pageJuz=juzForAyah(Number(firstWord.chapterId)||1,Number(firstWord.verseNumber)||1);
  const chapterIds=[...new Set((pack.words||[]).map(w=>Number(w.chapterId)).filter(Boolean))];const pageChapters=chapterIds.map(id=>catalogItem(id));
  const pageTitle=pageChapters.length===1?String(pageChapters[0].arabic||pageChapters[0].name||''):pageChapters.map(c=>String(c.arabic||c.name||'')).slice(0,2).join(' · ');
  const guide=(ln)=>state.mushafLineGuides?`<button class="mushaf-line-number" data-action="inspect-mushaf-line" data-page="${page}" data-line="${ln}" aria-label="Page ${page}, line ${ln}">${ln}</button>`:'';
  const lines=Array.from({length:15},(_,i)=>{const ln=i+1,words=lineMap.get(ln)||[],special=specials.get(ln);if(words.length)return `<div class="exact-mushaf-line" data-line="${ln}">${guide(ln)}<div class="exact-qcf-flow ${state.mushafTajweed?'tajweed-qcf-flow':''}" style="font-family:'${family}'">${words.map(w=>`<span class="qcf-word ${isMushafWordRed(w)?'qcf-red-word':''} ${isMushafFocusWord(w)?'qcf-focus-word':''} ${pack.tajweedFallback?tajweedFallbackClass(w):''}" title="${escapeHtml(w.verseKey)}">${escapeHtml(w.code)}</span>`).join('')}</div></div>`;if(special?.type==='header'){const c=catalogItem(special.chapterId);return `<div class="exact-mushaf-line exact-surah-header" data-line="${ln}">${guide(ln)}<span class="surah-cartouche-wing" aria-hidden="true">❖</span><span class="surah-cartouche-title">سورة ${escapeHtml(String(c.arabic||c.name||'').replace(/^سُورَةُ\s*/, '').replace(/^سورة\s*/,''))}</span><span class="surah-cartouche-wing" aria-hidden="true">❖</span></div>`}if(special?.type==='bismillah')return `<div class="exact-mushaf-line exact-bismillah" data-line="${ln}">${guide(ln)}${BISMILLAH}</div>`;return `<div class="exact-mushaf-line exact-empty-line" data-line="${ln}">${guide(ln)}</div>`}).join('');
  return `<section class="exact-mushaf-page"><style>@font-face{font-family:'${family}';src:url('${pack.fontUrl}') format('woff2');font-display:swap}</style><div class="mushaf-ornate-shell"><div class="mushaf-top-band"><div class="mushaf-top-cell"><span>الجزء</span><b>${toArabicPageDigits(pageJuz)}</b></div><div class="mushaf-top-center"><i aria-hidden="true">✦</i><strong>${escapeHtml(pageTitle||'القرآن الكريم')}</strong><i aria-hidden="true">✦</i></div><div class="mushaf-top-cell"><span>الصفحة</span><b>${toArabicPageDigits(page)}</b></div></div><div class="mushaf-side-ornament mushaf-side-left" aria-hidden="true"></div><div class="mushaf-side-ornament mushaf-side-right" aria-hidden="true"></div><div class="exact-mushaf-paper">${lines}<div class="mushaf-bottom-flourish" aria-hidden="true"><span>◆</span><i></i><span>✦</span><i></i><span>◆</span></div><div class="exact-page-number">${toArabicPageDigits(page)}</div></div></div></section>`;
}
function renderMushafPages(verses,s){if(!verses.length)return '<div class="empty">No ayahs need work. Everything is currently green.</div>';const pages=mushafPagesForVerses(verses);if(!pages.length)return '<div class="empty">Exact Mushaf page mapping is loading…</div>';const page=activeMushafPage(verses);const first=pages[0],last=pages[pages.length-1],focus=state.mushafFocus&&Number(state.mushafFocus.surah)===Number(s.id)?state.mushafFocus:null;return `<div class="exact-mushaf-mode"><div class="exact-mushaf-note">${state.mushafTajweed?'Madinah Mushaf · Simple Tajweed colors · exact page layout':'Madinah Mushaf · QCF V2 · exact 604-page / 15-line layout'}</div>${focus?`<div class="mushaf-focus-banner">Opened from Red Ayahs · ${escapeHtml(s.name)} ${focus.ayah}</div>`:''}<div class="mushaf-page-nav"><button class="mushaf-nav-btn" data-action="mushaf-page-prev" ${page<=1?'disabled':''}>‹</button><label class="mushaf-page-jump"><span>Page</span><input id="mushaf-page-input" type="number" min="1" max="604" value="${page}" inputmode="numeric"><button data-action="mushaf-page-go">Go</button></label><button class="mushaf-nav-btn" data-action="mushaf-page-next" ${page>=604?'disabled':''}>›</button></div><div class="mushaf-page-tools"><span class="tiny muted">${first===last?`This Surah is on page ${first}`:`This Surah spans pages ${first}–${last}`}</span><div class="mushaf-page-tool-buttons"><button class="line-guide-toggle ${state.mushafTajweed?'on tajweed-on':''}" data-action="toggle-mushaf-tajweed">${state.mushafTajweed?'Tajweed colors ON':'Tajweed colors'}</button><button class="line-guide-toggle" data-action="mushaf-page-notes" data-page="${page}">Ayah notes</button><button class="line-guide-toggle ${state.mushafLineGuides?'on':''}" data-action="toggle-mushaf-lines">${state.mushafLineGuides?'Line refs ON':'Line refs OFF'}</button></div></div>${state.mushafTajweed?`<div class="tajweed-legend"><span class="tw-red">Madd</span><span class="tw-green">Ghunnah / Ikhfa</span><span class="tw-gold">Qalqalah / other</span></div>`:''}${renderExactMushafPage(page,s)}</div>`}
async function ensureExactMushafPage(page){page=Math.max(1,Math.min(604,Number(page)||1));const cache=activeMushafCache();if(cache.has(page)){if(state.mode==='practice'&&state.screen==='surah-detail'&&state.experimentalMushaf)render();return cache.get(page)}try{const pack=await fetchQcfMushafPage(page,{tajweed:state.mushafTajweed});cache.set(page,pack)}catch{if(state.mushafTajweed){try{const fallback=await fetchQcfMushafPage(page,{tajweed:false});fallback.tajweedFallback=true;tajweedMushafPageCache.set(page,fallback)}catch{tajweedMushafPageCache.set(page,{page,words:[],fontUrl:`https://static.qurancdn.com/fonts/quran/hafs/v2/woff2/p${page}.woff2`,error:true,tajweedFallback:true})}}else{mushafPageCache.set(page,{page,words:[],fontUrl:`https://static.qurancdn.com/fonts/quran/hafs/v2/woff2/p${page}.woff2`,error:true})}}if(state.mode==='practice'&&state.screen==='surah-detail'&&state.experimentalMushaf)render();return activeMushafPack(page)}
async function ensureExactMushafPages(surahId){const verses=verseCache.get(Number(surahId))||await ensureVerses(Number(surahId));if(!verses)return;const pages=mushafPagesForVerses(verses);if(!pages.length)return;if(!(Number(state.mushafPage)>=1&&Number(state.mushafPage)<=604)){state.mushafPage=pages[0];persist()}await ensureExactMushafPage(state.mushafPage)}
function mushafPageNotesSheet(page){
  const p=Number(page),pack=activeMushafPack(p),keys=[...new Set((pack?.words||[]).map(w=>w.verseKey).filter(Boolean))];
  const rows=keys.map(key=>{const [sid,ayah]=String(key).split(':').map(Number),c=catalogItem(sid),record=ayahNoteRecord(sid,ayah),preview=record.text?escapeHtml(record.text.slice(0,72)):'';return `<button class="mushaf-note-row ${record.text?'has-note':''}" data-action="practice-ayah-note" data-surah="${sid}" data-ayah="${ayah}"><span><b>${escapeHtml(c.name)} ${sid}:${ayah}</b><span class="tiny muted note-preview">${preview}${record.text.length>72?'…':''}</span></span><span class="ayah-note-row-mark ${record.text?'has-note':''}">${record.text?'●':'✎'}</span></button>`}).join('');
  return `<div class="modal-backdrop"><section class="sheet compact-sheet" role="dialog" aria-modal="true" aria-label="Ayah notes for page ${p}" data-sheet><div class="sheet-head"><div><h2 class="title">Page ${p} · Ayah Notes</h2><p class="subtitle">Notes for ayahs visible on this exact Mushaf page</p></div><button class="close" data-action="close-sheet">×</button></div><div class="mushaf-page-note-list section">${rows||'<div class="empty">Page data is still loading.</div>'}</div></section></div>`
}
function renderVerses(verses,s){
  if(!verses.length)return '<div class="empty">No ayahs need work. Everything is currently green.</div>';
  return verses.map(v=>{const red=s.redAyahs.includes(v.number),noted=hasAyahNote(s.id,v.number);return `<div class="ayah-row ${red?'ayah-row-red':''}"><div class="ayah-practice-side"><button class="ayah-toggle" data-action="toggle-ayah" data-ayah="${v.number}" aria-label="Toggle ayah ${v.number}"><span class="dot ${red?'red':'green'}"></span><span class="ayah-num">${v.number}</span></button><button class="ayah-note-btn ${noted?'has-note':''}" data-action="practice-ayah-note" data-surah="${s.id}" data-ayah="${v.number}" aria-label="${noted?'Edit':'Add'} note for ayah ${v.number}">✎</button></div><p class="ayah-text ${red?'ayah-text-red':''}">${escapeHtml(v.text)}</p></div>`}).join('');
}
function practiceAyahNoteSheet(surahId,ayah){
  const sid=Number(surahId),n=Number(ayah),s=catalogItem(sid),record=ayahNoteRecord(sid,n),updated=record.updatedAt?new Date(record.updatedAt).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
  return `<div class="modal-backdrop"><section class="sheet compact-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(s.name)} ayah ${n} note" data-sheet><div class="sheet-head"><div><h2 class="title">${escapeHtml(s.name)} · Ayah ${n}</h2><p class="subtitle">Personal ayah note${updated?` · Updated ${escapeHtml(updated)}`:''}</p></div><button class="close" data-action="close-sheet">×</button></div><label class="section small"><b>Note for this ayah</b><textarea id="practice-ayah-note-text" class="textarea ayah-note-textarea" placeholder="Write a reminder, mistake to watch for, teacher note, connection, or anything useful for this ayah.">${escapeHtml(record.text)}</textarea></label><div class="ayah-note-actions"><button class="primary" data-action="save-practice-ayah-note" data-surah="${sid}" data-ayah="${n}">Save note</button>${record.text?`<button class="secondary danger-text" data-action="delete-practice-ayah-note" data-surah="${sid}" data-ayah="${n}">Delete</button>`:''}</div><div class="notice section">This note stays attached to this specific ayah and is separate from your daily revision logs.</div></section></div>`
}

function logView(){
  const s=viewModel(state.selectedSurah);
  return `<div class="backline"><button class="link-btn" data-action="back-detail">‹ ${escapeHtml(s.name)}</button><span class="tiny muted">${shortToday()}</span></div><div class="detail-head"><div class="between"><div><h1 class="title">Enter Log</h1><p class="subtitle">Record today's revision.</p></div><span class="tiny muted">${s.redAyahs.length} red ayahs</span></div></div>
    <div class="section"><div class="small"><b>How strong did it feel?</b></div><div class="rating">${[1,2,3,4,5].map(n=>`<button data-action="rate" data-rating="${n}" aria-label="${n} stars">${n<=draftRating?'★':'☆'}</button>`).join('')}</div></div>
    <label class="section small"><b>Notes from today</b><textarea id="log-note" class="textarea" placeholder="What went well? What still needs work?">${escapeHtml(draftNote)}</textarea></label>
    <div class="notice section"><div class="between"><span>Weak ayahs saved with this log</span><b>${s.redAyahs.length}</b></div></div>
    <button class="primary full section" data-action="save-log" ${draftRating?'':'disabled'}>${draftRating?'Save Log':'Choose a rating first'}</button>`;
}

function historyView(){
  const s=viewModel(state.selectedSurah);const logs=s.logs||[];
  return `<div class="backline"><button class="link-btn" data-action="back-detail">‹ ${escapeHtml(s.name)}</button><span class="tiny muted">${logs.length} logs</span></div><h1 class="title">Revision History</h1><p class="subtitle">Past ratings, notes, and weak ayahs</p>
    <section class="card pad-sm section"><div class="between"><b class="small">Strength over time</b><span class="tiny muted">Latest ${s.rating||0}/5</span></div><div style="height:110px;display:flex;align-items:end;gap:7px;margin-top:8px">${[...logs].reverse().slice(-12).map(l=>`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="height:${Math.max(5,(l.rating||0)*17)}px;width:100%;background:var(--accent);border-radius:5px 5px 0 0"></div><span class="tiny muted">${escapeHtml(l.date||'')}</span></div>`).join('')}</div></section>
    <section class="section">${logs.map(l=>`<article class="card pad-sm" style="margin-bottom:8px"><div class="between"><b class="small">${escapeHtml(l.date||'')}</b><span class="stars">${stars(l.rating||0)}</span></div><p class="small" style="line-height:1.5;margin:8px 0">${escapeHtml(l.note||'No note saved.')}</p><div class="tiny muted">Red ayahs: ${(l.redAyahs||[]).length?(l.redAyahs||[]).join(', '):'None'}</div></article>`).join('')||'<div class="empty">No logs yet.</div>'}</section>`;
}

function queueView(){
  const q=[...allCollection()].sort((a,b)=>strengthScore(a)-strengthScore(b)); const first=q[0];
  if(!first)return '<div class="empty">Add a memorized Surah to begin.</div>';
  return `<p class="tiny muted" style="margin:0">Revision queue</p><h1 class="title">Practice</h1><section class="soft-card pad section"><div class="between"><div><div class="tiny muted">Recommended next</div><b>${escapeHtml(first.name)}</b><div class="arabic-name" style="margin:2px 0 0">${escapeHtml(first.arabic||'')}</div></div><span class="stars">${stars(first.rating)}</span></div><div class="grid2 section" style="margin-top:9px"><div class="card pad-sm"><span class="tiny muted">Last recited</span><div class="small"><b>${escapeHtml(first.lastRecited||'Not yet')}</b></div></div><div class="card pad-sm"><span class="tiny muted">Needs work</span><div class="small"><b>${first.redAyahs.length} ayahs</b></div></div></div><button class="primary full section" data-action="open-surah" data-id="${first.id}">Open ${escapeHtml(first.name)}</button></section><div class="between section"><h2 class="section-title">Up next</h2></div><div>${q.slice(1).map(s=>`<button class="queue-row" data-action="open-surah" data-id="${s.id}"><div><b class="small">${escapeHtml(s.name)}</b><div class="tiny muted">Last recited: ${escapeHtml(s.lastRecited||'Not yet')} · ${s.redAyahs.length} red</div></div><span class="stars">${stars(s.rating)}</span></button>`).join('')}</div>`;
}

function redAyahEntries(){
  return allCollection().flatMap(s=>(s.redAyahs||[]).map(ayah=>({surahId:s.id,surahName:s.name,ayah:Number(ayah),juz:juzForAyah(s.id,ayah)})));
}
function redAyahExplorer(){
  const all=redAyahEntries();const selected=state.stats.redJuz||[];const filtered=selected.length?all.filter(x=>selected.includes(x.juz)):all;
  const juzWithRed=[...new Set(all.map(x=>x.juz))].sort((a,b)=>a-b);
  let body='';
  if(state.stats.redView==='juz'){
    const groups=new Map();filtered.forEach(x=>{if(!groups.has(x.juz))groups.set(x.juz,[]);groups.get(x.juz).push(x)});
    body=[...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([juz,items])=>`<div class="red-group"><div class="between"><b class="small">Juz ${juz}</b><span class="tiny muted">${items.length} red ayah${items.length===1?'':'s'}</span></div><div class="red-ayah-grid">${items.map(x=>`<button class="red-ayah-pill" data-action="open-red-ayah" data-surah="${x.surahId}" data-ayah="${x.ayah}">${escapeHtml(x.surahName)} · ${x.ayah}</button>`).join('')}</div></div>`).join('');
  }else{
    const groups=new Map();filtered.forEach(x=>{if(!groups.has(x.surahId))groups.set(x.surahId,{name:x.surahName,items:[]});groups.get(x.surahId).items.push(x)});
    body=[...groups.entries()].map(([id,g])=>`<div class="red-group"><div class="between"><b class="small">${escapeHtml(g.name)}</b><span class="tiny muted">${g.items.length} red</span></div><div class="red-ayah-grid">${g.items.map(x=>`<button class="red-ayah-pill" data-action="open-red-ayah" data-surah="${id}" data-ayah="${x.ayah}">Ayah ${x.ayah} · Juz ${x.juz}</button>`).join('')}</div></div>`).join('');
  }
  return `<section class="card pad-sm section"><div class="between"><div><h2 class="section-title">Red Ayahs</h2><div class="tiny muted">Browse by Juz, combine multiple Juz, or switch back to Surah view.</div></div><span class="tiny muted">${filtered.length} shown</span></div>
    <div class="segment mini-segment section"><button data-action="red-view" data-view="juz" class="${state.stats.redView==='juz'?'active':''}">By Juz</button><button data-action="red-view" data-view="surah" class="${state.stats.redView==='surah'?'active':''}">By Surah</button></div>
    <div class="between" style="margin-top:10px"><b class="tiny">Filter Juz</b><button class="link-btn tiny" data-action="clear-red-juz">${selected.length?'Clear selection':'All Juz'}</button></div>
    <div class="juz-chip-scroll"><button class="juz-chip ${selected.length===0?'active':''}" data-action="clear-red-juz">All</button>${Array.from({length:30},(_,i)=>i+1).map(j=>`<button class="juz-chip ${selected.includes(j)?'active':''} ${juzWithRed.includes(j)?'has-red':''}" data-action="toggle-red-juz" data-juz="${j}">${j}</button>`).join('')}</div>
    <div class="red-ayah-box">${body||'<div class="empty">No red ayahs match this selection.</div>'}</div></section>`;
}
function statsView(){
  const coll=allCollection();const ranked=[...coll].sort((a,b)=>strongestFirst?strengthScore(b)-strengthScore(a):strengthScore(a)-strengthScore(b));const allNotes=notes();const filtered=noteFilter==='All Surahs'?allNotes:allNotes.filter(n=>n.surahName===noteFilter);const totalRed=coll.reduce((n,s)=>n+s.redAyahs.length,0);const strong=coll.filter(s=>s.rating>=4&&s.redAyahs.length<=1).length;
  return `<h1 class="title">Stats</h1><p class="subtitle">Revision health of your ${coll.length} memorized Surahs</p><div class="grid2 section"><div class="card metric"><span>Strong</span><strong>${strong}</strong><span>of ${coll.length} memorized</span></div><div class="card metric"><span>Red ayahs</span><strong>${totalRed}</strong><span>across your Surahs</span></div></div>
    ${redAyahExplorer()}
    <section class="card pad-sm section"><div class="between"><div><h2 class="section-title">Surah strength</h2><div class="tiny muted">${strongestFirst?'Strongest first':'Weakest first'}</div></div><button class="secondary" data-action="reverse-ranking">${strongestFirst?'Show weakest':'Show strongest'}</button></div><p class="tiny muted">Ranking considers confidence plus how many ayahs are green vs red.</p><div class="ranking-box">${ranked.map((s,i)=>rankRow(s,i)).join('')}</div></section>
    <section class="card pad-sm section"><div class="between"><div><h2 class="section-title">Access Notes</h2><div class="tiny muted">Recent and previous revision notes</div></div><span class="tiny muted">${filtered.length} notes</span></div><label class="tiny muted" style="display:block;margin-top:8px">Filter by Surah<select id="note-filter" class="select" style="margin-top:4px"><option>All Surahs</option>${[...new Set(allNotes.map(n=>n.surahName))].sort().map(n=>`<option ${noteFilter===n?'selected':''}>${escapeHtml(n)}</option>`).join('')}</select></label><div class="notes-box">${filtered.map(noteRow).join('')||'<div class="empty">No notes found.</div>'}</div></section>`;
}
function rankRow(s,i){const total=Math.max(1,s.ayahCount||1),red=s.redAyahs.length,green=Math.max(0,total-red),pct=Math.round(green/total*100);return `<div class="rank-row"><div class="rank-top"><div><span class="tiny muted">${i+1}</span> <b class="small">${escapeHtml(s.name)}</b></div><b class="tiny">${pct}% green</b></div><div class="rank-meta"><span>★ ${s.rating||0}/5</span><span><i class="dot green"></i> ${green} green</span><span><i class="dot red"></i> ${red} red</span></div><div class="bar"><span style="width:${pct}%"></span></div></div>`}
function noteRow(n){return `<article class="note-row"><div class="between"><div><b class="small">${escapeHtml(n.surahName)}</b> <span class="tiny muted">${escapeHtml(n.date||'')}</span></div><span class="stars">${stars(n.rating||0)}</span></div><p>${escapeHtml(n.note||'No note saved.')}</p></article>`}

function recoverySnapshotLabel(row){if(!row)return 'Not available yet';const d=new Date(Number(row.capturedAt)||0);return d.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
function recoveryBackupCard(hours,label){const row=findRecoverySnapshot(hours);return `<div class="recovery-backup-row ${row?'available':'unavailable'}"><div><b class="small">${label}</b><div class="tiny muted">${row?`Snapshot from ${escapeHtml(recoverySnapshotLabel(row))}`:'Not available yet · automatic snapshots start from this version'}</div></div><button class="secondary" data-action="restore-recovery" data-hours="${hours}" ${row?'':'disabled'}>Restore</button></div>`}
function restoreRecovery(hours){const row=findRecoverySnapshot(hours);if(!row){announce('That recovery backup is not available yet.');return}const when=recoverySnapshotLabel(row);if(!confirm(`Restore your Quran Revision data to the snapshot from ${when}?\n\nYour current data will be saved as an emergency recovery snapshot first.`))return;captureRecoverySnapshot({force:true,label:'before-restore'});if(restoreRecoverySnapshot(row.capturedAt)){location.reload()}else announce('Could not restore that backup.')}

function profileView(){
  return `<div class="row" style="gap:10px"><div style="width:42px;height:42px;border-radius:50%;background:var(--accent-soft);display:grid;place-items:center;font-weight:800">A</div><div><h1 class="title">Revision Profile</h1><p class="subtitle">Profile & settings</p></div></div><section class="card pad-sm section"><div class="between"><div><h2 class="section-title">Revision collection</h2><div class="small"><b>${state.collection.length} memorized Surahs</b></div><div class="tiny muted">Only these count toward revision stats</div></div><button class="secondary" data-action="open-add">Manage</button></div></section><section class="card pad-sm section"><div class="between"><div><h2 class="section-title">Account & Security</h2><p class="small muted" style="line-height:1.5;margin:5px 0 0">Google sign-in, password recovery, cloud sync, and account transfers will activate when Supabase is connected.</p></div><span class="account-status-pill">Local</span></div><button class="secondary full section" data-action="account-settings">Open account settings</button></section><section class="card pad-sm section recovery-backups"><div class="between"><div><h2 class="section-title">Recovery backups</h2><div class="tiny muted">Automatic local snapshots for accidental deletes or changes.</div></div><span class="recovery-shield">↶</span></div>${recoveryBackupCard(1,'About 1 hour ago')}${recoveryBackupCard(24,'About 24 hours ago')}<div class="tiny muted recovery-note">Restoring replaces the current local state. The app saves an emergency snapshot of your current data first.</div></section><section class="section" style="border-top:1px solid var(--border)"><button class="profile-row" data-action="account-settings"><span><b>Account & Security</b><small>Google, password, transfer</small></span><span>›</span></button><button class="profile-row" data-action="open-add"><span>Memorized Surahs</span><span>›</span></button><button class="profile-row" data-action="go-stats"><span>Revision history & notes</span><span>›</span></button><button class="profile-row" data-action="download-backup"><span><b>Download backup</b><small>Save a copy of your local app data now</small></span><span>↓</span></button><button class="profile-row" data-action="reset-demo"><span>Reset local prototype data</span><span>›</span></button></section>`;
}

function accountSecuritySheet(){
  return `<div class="modal-backdrop"><section class="sheet account-sheet" role="dialog" aria-modal="true" aria-label="Account and security settings" data-sheet><div class="sheet-head"><div><h2 class="title">Account & Security</h2><p class="subtitle">Ready for cloud accounts</p></div><button class="close" data-action="close-sheet">×</button></div>
    <div class="account-setting-card preferred-name-card"><div class="account-setting-icon">☺</div><div class="preferred-name-copy"><b class="small">What should we call you?</b><div class="tiny muted">This is the friendly name used on Home. During signup, we’ll ask for this after Google or email sign-in.</div><input id="preferred-name" class="search preferred-name-input" maxlength="40" value="${escapeHtml(state.profile.displayName||'')}" placeholder="e.g. Ahmed"></div><button class="secondary" data-action="save-preferred-name">Save</button></div>
    <div class="account-setting-card"><div class="account-setting-icon google-g">G</div><div><b class="small">Google account</b><div class="tiny muted">Offer “Continue with Google” on sign up/sign in. If you originally use email + password, you can link Google here later.</div></div><button class="secondary" data-action="account-feature-info" data-feature="google">Link</button></div>
    <div class="account-setting-card"><div class="account-setting-icon">⌁</div><div><b class="small">Reset password</b><div class="tiny muted">Send a secure password-recovery email, then choose a new password after returning to the app.</div></div><button class="secondary" data-action="account-feature-info" data-feature="password">Reset</button></div>
    <div class="account-setting-card"><div class="account-setting-icon">⇄</div><div><b class="small">Transfer account data</b><div class="tiny muted">Move or copy your revision data, notes, meanings progress, and settings to another verified account.</div></div><button class="secondary" data-action="account-feature-info" data-feature="transfer">Transfer</button></div>
    <div id="account-feature-detail" class="notice section account-feature-detail"><b>Current status:</b> this build still stores data locally. These account actions will become live when Supabase is connected.</div>
    <div class="account-transfer-safety section"><b class="small">How transfer will work</b><div class="tiny muted">For safety, the source account will re-authenticate, the destination account will confirm the transfer, and you’ll choose Copy or Move before anything changes. We won’t silently overwrite the destination account.</div></div>
    <div class="account-transfer-safety section"><b class="small">Recovery backups</b><div class="tiny muted">Automatic local snapshots let you return to an older state if something is deleted accidentally.</div><div class="recovery-sheet-list">${recoveryBackupCard(1,'About 1 hour ago')}${recoveryBackupCard(24,'About 24 hours ago')}</div></div>
    <button class="secondary full section" data-action="download-backup">Download local backup now</button>
  </section></div>`;
}

function downloadLocalBackup(){
  try{
    const payload={app:'Quran Revision',version:'0.1.45',exportedAt:new Date().toISOString(),state};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`quran-revision-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('Backup downloaded.');
  }catch{announce('Could not create backup.')}
}

function bindAccountSecuritySheet(){
  const overlay=document.querySelector('.modal-backdrop');if(!overlay)return;
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove()});
  overlay.querySelectorAll('[data-action="close-sheet"]').forEach(b=>b.addEventListener('click',()=>overlay.remove()));
  const saveName=overlay.querySelector('[data-action="save-preferred-name"]');
  if(saveName)saveName.addEventListener('click',()=>{const input=overlay.querySelector('#preferred-name');state.profile.displayName=String(input?.value||'').trim().slice(0,40);persist();render();overlay.outerHTML=accountSecuritySheet();bindAccountSecuritySheet();announce(state.profile.displayName?`We’ll call you ${state.profile.displayName}.`:'Preferred name cleared.');});
  const nameInput=overlay.querySelector('#preferred-name');if(nameInput)nameInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveName?.click()}});
  overlay.querySelectorAll('[data-action="account-feature-info"]').forEach(btn=>btn.addEventListener('click',()=>{
    const box=overlay.querySelector('#account-feature-detail');if(!box)return;const feature=btn.dataset.feature;
    if(feature==='google')box.innerHTML='<b>Google linking:</b> once Supabase Auth is connected, this will start Google OAuth and attach the Google identity to your existing Quran Revision account. “Continue with Google” will also appear on the main sign-in screen.';
    if(feature==='password')box.innerHTML='<b>Password reset:</b> once email auth is connected, this will send a secure recovery link to the email on your account. The link returns you to the app to set a new password.';
    if(feature==='transfer')box.innerHTML='<b>Account transfer:</b> this will require verification on both accounts. You’ll choose whether to copy or move your data, review what will transfer, and confirm before the destination account is changed.';
  }));
  overlay.querySelectorAll('[data-action="restore-recovery"]').forEach(btn=>btn.addEventListener('click',()=>restoreRecovery(Number(btn.dataset.hours))));
  overlay.querySelectorAll('[data-action="download-backup"]').forEach(btn=>btn.addEventListener('click',downloadLocalBackup));
}

function listenSurahsView(){
  return `<h1 class="title">Listen</h1><p class="subtitle">Passive listening · never changes revision data</p><div class="surah-list section">${state.catalog.map(s=>{const last=lastListenedRecord(s.id);return `<button class="surah-row" data-action="listen-surah" data-id="${s.id}"><div class="surah-main"><div class="surah-line"><div><span class="surah-name">${s.id} · ${escapeHtml(s.name)}</span><span class="arabic-name">${escapeHtml(s.arabic||'')}</span></div><span>▶</span></div><div class="surah-meta"><span>${s.ayahCount||''} ayahs</span><span>Last listened: ${escapeHtml(formatListenedWhen(last))}</span></div></div></button>`}).join('')}</div>`;
}
function plainWordArabic(value=''){
  return String(value).normalize('NFD').replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g,'').replace(/ٱ/g,'ا').replace(/ـ/g,'').trim();
}
function firstWordsAreBismillah(words=[]){
  if(words.length<4)return false;
  return words.slice(0,4).map(w=>plainWordArabic(w.arabic)).join(' ')==='بسم الله الرحمن الرحيم';
}
function renderWordStack(w,i){return `<span class="listen-word-stack" data-listen-word-index="${i}"><span class="listen-word-arabic">${escapeHtml(w.arabic||'')}</span><span class="listen-word-meaning" dir="ltr">${escapeHtml(w.meaning||'')}</span></span>`}
function renderWordFlow(surahId,ayah){
  const words=(wordCache.get(Number(surahId))||{})[ayah.number]||[];
  if(!words.length)return `<p class="listen-ayah-text">${escapeHtml(ayah.text||'')}</p><div class="word-meaning-pending">Word meanings loading…</div>`;
  const start=ayah.number===1&&hasBismillah(surahId)&&firstWordsAreBismillah(words)?4:0;
  return `<div class="listen-word-flow" dir="rtl">${words.slice(start).map((w,j)=>renderWordStack(w,j+start)).join('')}</div>`;
}
function listenBismillahRow(surahId){
  if(!hasBismillah(surahId))return '';
  const words=(wordCache.get(Number(surahId))||{})[1]||[];
  if(firstWordsAreBismillah(words))return `<div class="bismillah-row listen-bismillah" aria-label="Bismillah opening, not an ayah"><div class="bismillah-caption">Opening · not counted as an ayah</div><div class="listen-word-flow bismillah-words" dir="rtl">${words.slice(0,4).map((w,i)=>renderWordStack(w,i)).join('')}</div></div>`;
  return `<div class="bismillah-row listen-bismillah" aria-label="Bismillah opening, not an ayah"><div class="bismillah-caption">Opening · not counted as an ayah</div>${BISMILLAH}</div>`;
}
function repeatSummary(){
  if(state.listen.repeatMode==='off')return '';
  if(state.listen.repeatMode==='surah')return 'Whole Surah · ∞';
  const count=state.listen.repeatCount==='infinite'?'∞':`${state.listen.repeatCount}×`;
  if(state.listen.repeatMode==='ayah')return `Ayah ${state.listen.repeatAnchor||state.listen.track+1} · ${count}`;
  return `Ayahs ${state.listen.repeatStart}–${state.listen.repeatEnd} · ${count}`;
}
function nowPlayingView(){
  const s=catalogItem(state.listen.selectedSurah);const pack=audioCache.get(audioKey());const verses=verseCache.get(s.id)||[];const revision=state.collection.includes(Number(s.id))?rev(s.id):null;
  const currentNumber=pack?.timings?.[state.listen.track]?.number||state.listen.track+1;
  const repeatLabel=repeatSummary();
  return `<div class="listen-reader">
    <div class="listen-head"><div><p class="tiny muted" style="margin:0">Now Playing</p><div class="listen-title-line"><h1 class="title">${escapeHtml(s.name)}</h1><span class="arabic-name">${escapeHtml(s.arabic||'')}</span></div><p class="subtitle">${escapeHtml(state.listen.reciterName||'Choose a reciter')} · <span id="current-ayah-label">Ayah ${currentNumber}</span></p></div></div>
    <section class="listen-player card pad-sm section">
      <div class="bar"><span id="audio-progress" style="width:${player.duration?Math.min(100,(player.currentTime/player.duration)*100):0}%"></span></div><div class="between" style="margin-top:5px"><span id="audio-time" class="tiny muted">${formatTime(player.currentTime)} / ${Number.isFinite(player.duration)?formatTime(player.duration):'0:00'}</span><span class="tiny muted">One continuous Surah track</span></div>
      <div class="player-controls compact"><button class="circle compact-circle" data-action="prev-track" aria-label="Previous ayah">⏮</button><button class="circle play compact-play" data-action="toggle-play" aria-label="${player.paused?'Resume':'Pause'}">${player.paused?'▶':'Ⅱ'}</button><button class="circle compact-circle" data-action="next-track" aria-label="Next ayah">⏭</button></div>
    </section>
    <div class="between section listen-ayah-heading"><div><h2 class="section-title">Ayahs</h2><p class="tiny muted" style="margin:2px 0 0">Word meanings appear underneath. Choose the original smooth flow or the experimental line-by-line flow in Audio Settings.</p></div><button class="listen-refresh-btn ${listenContentRefreshing?'is-refreshing':''}" data-action="refresh-listen-content" aria-label="Refresh this Surah's ayahs and word meanings" title="Refresh ayahs & meanings">↻</button></div>
    <div class="listen-ayah-list">${listenBismillahRow(s.id)}${verses.length?verses.map((a,i)=>{const inRevision=!!revision;const isRed=inRevision&&revision.redAyahs.includes(a.number);const statusClass=inRevision?(isRed?'red':'green'):'neutral';const highlight=listenHighlight(s.id,a.number);return `<article class="listen-ayah-row ${i===state.listen.track?'current':''} ${highlight!=='none'?`listen-highlight-${highlight}`:''}" data-listen-ayah-index="${i}" aria-current="${i===state.listen.track?'true':'false'}"><div class="listen-ayah-side"><span class="dot ${statusClass}" title="${inRevision?(isRed?'Needs work':'Well memorized'):'Not in revision collection'}"></span><span class="listen-ayah-number">${a.number}</span></div><div class="listen-ayah-content">${renderWordFlow(s.id,a)}<div class="ayah-flow-track" aria-hidden="true"><span class="ayah-flow-fill" style="--ayah-flow:${i===state.listen.track?ayahPlaybackProgress(player.currentTime*1000,pack?.timings?.[i]||null):0}"><i></i></span></div></div><div class="ayah-listen-actions"><button class="ayah-more-btn" data-action="ayah-more" data-ayah="${a.number}" aria-label="More options for ayah ${a.number}">•••</button><button class="ayah-inline-play" data-action="play-ayah" data-ayah="${a.number}" aria-label="Play from ayah ${a.number}">▶</button></div></article>`}).join(''):'<div class="empty">Loading Quran text and timing…</div>'}</div>
    <div class="sync-note tiny muted section">The original Smooth Ayah Flow stays available. Experimental Line-by-Line Flow uses thin tracks directly under each wrapped Arabic line and advances through those lines as the ayah plays.</div>
    <div class="listen-bottom-settings section"><div><b class="small">Audio settings</b><div class="tiny muted">${escapeHtml(state.listen.reciterName||'Choose a reciter')}${repeatLabel?` · ↻ ${escapeHtml(repeatLabel)}`:''}</div></div><button class="more-audio-btn bottom-more" data-action="audio-more" aria-label="Open audio settings">•••</button></div>
    <div class="notice section"><b>Listen mode stays passive:</b> it never changes Last recited, ratings, notes, or ayah status automatically.</div>
  </div>`;
}
function recentView(){
  const recent=state.listen.recent||[];return `<h1 class="title">Recently Played</h1><p class="subtitle">Listening history only</p><div class="section">${recent.length?recent.map(r=>`<button class="queue-row" data-action="listen-surah" data-id="${r.id}"><div><b class="small">${escapeHtml(r.name)}</b><div class="tiny muted">Last listened: ${escapeHtml(formatListenedWhen(r))}</div></div><span>▶</span></button>`).join(''):'<div class="empty">Nothing played yet.</div>'}</div>`;
}

function audioSettingsSheet(){
  const s=catalogItem(state.listen.selectedSurah);const max=Math.max(1,Number(s.ayahCount)||1);
  const options=Array.from({length:max},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
  const reciters=[...(state.listen.reciters||[])].sort((a,b)=>{
    const af=state.listen.favoriteReciters.includes(a.id)?1:0,bf=state.listen.favoriteReciters.includes(b.id)?1:0;
    return bf-af||a.name.localeCompare(b.name);
  });
  const continuationOptions=(state.catalog||[]).filter(x=>Number(x.id)>=Number(s.id)).map(x=>`<option value="${x.id}" ${Number(state.listen.stopAfterSurah)===Number(x.id)?'selected':''}>${x.id} · ${escapeHtml(x.name)}</option>`).join('');
  return `<div class="modal-backdrop"><section class="sheet compact-sheet" role="dialog" aria-modal="true" aria-label="Audio settings" data-sheet><div class="sheet-head"><div><h2 class="title">Audio Settings</h2><p class="subtitle">Reciter, repeats, speed, and continuous playback</p></div><button class="close" data-action="close-sheet">×</button></div>
    <div class="settings-section"><div class="between"><div><b class="small">Reciter</b><div class="tiny muted">Star favorites so they stay at the top.</div></div><span class="tiny muted">★ favorites</span></div><div class="reciter-settings-list">${reciters.length?reciters.map(r=>`<div class="reciter-setting-row ${state.listen.reciter===r.id?'selected':''}"><button class="favorite-qari ${state.listen.favoriteReciters.includes(r.id)?'is-favorite':''}" data-action="favorite-reciter" data-id="${escapeHtml(r.id)}" aria-label="${state.listen.favoriteReciters.includes(r.id)?'Remove':'Add'} ${escapeHtml(r.name)} ${state.listen.favoriteReciters.includes(r.id)?'from':'to'} favorites">${state.listen.favoriteReciters.includes(r.id)?'★':'☆'}</button><button class="choose-qari" data-action="choose-reciter" data-id="${escapeHtml(r.id)}" data-name="${escapeHtml(r.name)}"><span><b class="small">${escapeHtml(r.name)}</b><span class="tiny muted">Hafs · full Surah audio</span></span><span>${state.listen.reciter===r.id?'✓':'›'}</span></button></div>`).join(''):'<div class="empty">Loading compatible reciters…</div>'}</div></div>
    <label class="setting-block"><span><b class="small">Repeat</b><span class="tiny muted">Choose what should loop inside the same Surah track.</span></span><select id="repeat-mode" class="select compact-select"><option value="off" ${state.listen.repeatMode==='off'?'selected':''}>Off</option><option value="ayah" ${state.listen.repeatMode==='ayah'?'selected':''}>Current ayah</option><option value="range" ${state.listen.repeatMode==='range'?'selected':''}>Ayah range</option><option value="surah" ${state.listen.repeatMode==='surah'?'selected':''}>Whole Surah continuously</option></select></label>
    <div class="setting-block"><span><b class="small">Number of times</b><span class="tiny muted">Choose any amount, or loop forever.</span></span><div class="repeat-count-control"><input id="repeat-count" class="select compact-select" type="number" inputmode="numeric" min="1" max="99" value="${state.listen.repeatCount==='infinite'?'3':Math.max(1,Number(state.listen.repeatCount)||3)}" ${state.listen.repeatMode==='off'||state.listen.repeatCount==='infinite'?'disabled':''}><label class="infinite-check"><input id="repeat-infinite" type="checkbox" ${state.listen.repeatCount==='infinite'?'checked':''} ${state.listen.repeatMode==='off'?'disabled':''}>∞ Infinite</label></div></div>
    <div id="repeat-range-fields" class="repeat-range-fields ${state.listen.repeatMode==='range'?'':'hidden'}"><label><span class="tiny muted">From ayah</span><select id="repeat-from" class="select compact-select">${options}</select></label><span class="range-arrow">→</span><label><span class="tiny muted">To ayah</span><select id="repeat-to" class="select compact-select">${options}</select></label></div>
    <label class="setting-block"><span><b class="small">Playback speed</b><span class="tiny muted">Normal is 1×.</span></span><select id="more-speed" class="select compact-select"><option value="0.75" ${state.listen.speed==='0.75'?'selected':''}>0.75×</option><option value="1" ${!state.listen.speed||state.listen.speed==='1'?'selected':''}>1×</option><option value="1.25" ${state.listen.speed==='1.25'?'selected':''}>1.25×</option><option value="1.5" ${state.listen.speed==='1.5'?'selected':''}>1.5×</option></select></label>
    <label class="setting-block"><span><b class="small">Auto-scroll</b><span class="tiny muted">Follow the active ayah while listening.</span></span><select id="settings-auto-scroll" class="select compact-select"><option value="on" ${state.listen.autoScroll!==false?'selected':''}>On</option><option value="off" ${state.listen.autoScroll===false?'selected':''}>Off</option></select></label>
    <label class="setting-block"><span><b class="small">Match Practice Surah</b><span class="tiny muted">When you switch from an open Practice Surah to Listen, open that same Surah automatically.</span></span><select id="match-practice-surah" class="select compact-select"><option value="on" ${state.listen.matchPracticeSurah!==false?'selected':''}>On</option><option value="off" ${state.listen.matchPracticeSurah===false?'selected':''}>Off</option></select></label>
    <label class="setting-block"><span><b class="small">Follow along</b><span class="tiny muted">Original flow uses one line for the ayah. Experimental flow places a thinner progress line under each wrapped Arabic line.</span></span><select id="follow-mode" class="select compact-select"><option value="lineflow" ${state.listen.followMode==='lineflow'?'selected':''}>Line-by-line ayah flow · experimental</option><option value="flow" ${state.listen.followMode==='flow'?'selected':''}>Smooth ayah flow · original</option><option value="off" ${state.listen.followMode==='off'?'selected':''}>Off</option></select></label>
    <label class="setting-block"><span><b class="small">After this Surah</b><span class="tiny muted">Stop or continue automatically into the next Surah.</span></span><select id="after-surah" class="select compact-select"><option value="stop" ${state.listen.afterSurah!=='continue'?'selected':''}>Stop</option><option value="continue" ${state.listen.afterSurah==='continue'?'selected':''}>Keep going</option></select></label>
    <label id="stop-after-block" class="setting-block ${state.listen.afterSurah==='continue'?'':'hidden'}"><span><b class="small">Where to stop</b><span class="tiny muted">Choose a final Surah or keep going until you stop playback.</span></span><select id="stop-after-surah" class="select compact-select"><option value="none" ${state.listen.stopAfterSurah==null?'selected':''}>No limit</option>${continuationOptions}</select></label>
    <button id="apply-repeat" class="primary full section">Apply Settings</button>
    <p class="tiny muted" style="line-height:1.45">Repeating and previous/next seek within the same continuous Surah MP3. Whole Surah continuously restarts this same track and overrides the After this Surah setting until repeat is turned off. Continuing after a Surah loads the next full-Surah track.</p>
  </section></div>`;
}
function ayahNotesSheet(ayah){
  const s=viewModel(state.listen.selectedSurah);const inRevision=state.collection.includes(Number(s.id));const isRed=inRevision&&s.redAyahs.includes(ayah);const related=(s.logs||[]).filter(l=>(l.redAyahs||[]).includes(ayah));const logs=related.length?related:(s.logs||[]);const highlight=listenHighlight(s.id,ayah);
  return `<div class="modal-backdrop"><section class="sheet" role="dialog" aria-modal="true" aria-label="Ayah ${ayah} revision details" data-sheet><div class="sheet-head"><div><h2 class="title">${escapeHtml(s.name)} · Ayah ${ayah}</h2><p class="subtitle">Revision details and Listen highlight</p></div><button class="close" data-action="close-sheet">×</button></div>${inRevision?`<div class="status-card"><span class="dot ${isRed?'red':'green'}"></span><div><b class="small">${isRed?'Needs work':'Well memorized'}</b><div class="tiny muted">Green/red still comes from Practice mode.</div></div></div>`:`<div class="notice">This Surah is not currently in your revision collection.</div>`}
    <div class="section"><div class="between"><div><h3 class="section-title">Listen highlight</h3><div class="tiny muted">Independent from red/green revision status.</div></div><span class="tiny muted">${highlight==='none'?'None':highlight}</span></div><div class="highlight-palette"><button class="highlight-choice none ${highlight==='none'?'active':''}" data-action="ayah-highlight" data-color="none" data-ayah="${ayah}">None</button><button class="highlight-choice pink ${highlight==='pink'?'active':''}" data-action="ayah-highlight" data-color="pink" data-ayah="${ayah}">Pink</button><button class="highlight-choice yellow ${highlight==='yellow'?'active':''}" data-action="ayah-highlight" data-color="yellow" data-ayah="${ayah}">Yellow</button><button class="highlight-choice blue ${highlight==='blue'?'active':''}" data-action="ayah-highlight" data-color="blue" data-ayah="${ayah}">Light blue</button></div></div>
    <div class="between section"><h3 class="section-title">Revision notes</h3><span class="tiny muted">${logs.length}</span></div><div class="notes-box">${logs.length?logs.map(l=>`<article class="note-row"><div class="between"><b class="small">${escapeHtml(l.date||'')}</b><span class="stars">${stars(l.rating||0)}</span></div><p>${escapeHtml(l.note||'No note saved.')}</p>${related.length?`<div class="tiny muted">Ayah ${ayah} was red in this log.</div>`:''}</article>`).join(''):'<div class="empty">No revision notes yet.</div>'}</div>${inRevision?`<button class="secondary full section" data-action="open-ayah-practice" data-ayah="${ayah}">Open this Surah in Practice</button>`:''}</section></div>`;
}
function bindGenericSheet(){
  const overlay=document.querySelector('.modal-backdrop');if(!overlay)return;
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove()});
  overlay.querySelectorAll('[data-action="close-sheet"]').forEach(b=>b.addEventListener('click',()=>overlay.remove()));
  overlay.querySelectorAll('[data-action="practice-ayah-note"]').forEach(btn=>btn.addEventListener('click',()=>{const sid=Number(btn.dataset.surah),ayah=Number(btn.dataset.ayah);overlay.outerHTML=practiceAyahNoteSheet(sid,ayah);bindGenericSheet()}));
  const savePracticeNote=overlay.querySelector('[data-action="save-practice-ayah-note"]');if(savePracticeNote)savePracticeNote.addEventListener('click',()=>{const sid=Number(savePracticeNote.dataset.surah),ayah=Number(savePracticeNote.dataset.ayah),field=overlay.querySelector('#practice-ayah-note-text');saveAyahNote(sid,ayah,field?.value||'');overlay.remove();render();announce('Ayah note saved.');});
  const deletePracticeNote=overlay.querySelector('[data-action="delete-practice-ayah-note"]');if(deletePracticeNote)deletePracticeNote.addEventListener('click',()=>{const sid=Number(deletePracticeNote.dataset.surah),ayah=Number(deletePracticeNote.dataset.ayah),c=catalogItem(sid);if(!confirm(`Delete your note for ${c.name} ayah ${ayah}?\n\nThis can be recovered later from a recovery backup if one is available.`))return;saveAyahNote(sid,ayah,'');overlay.remove();render();announce('Ayah note deleted.');});
  const repeatMode=overlay.querySelector('#repeat-mode');
  const count=overlay.querySelector('#repeat-count');
  const infinite=overlay.querySelector('#repeat-infinite');
  const range=overlay.querySelector('#repeat-range-fields');
  const from=overlay.querySelector('#repeat-from');const to=overlay.querySelector('#repeat-to');
  if(from)from.value=String(state.listen.repeatStart||1);if(to)to.value=String(state.listen.repeatEnd||state.listen.repeatStart||1);
  if(repeatMode)repeatMode.addEventListener('change',e=>{
    const mode=e.target.value;const wholeSurah=mode==='surah';if(count)count.disabled=mode==='off'||wholeSurah||!!infinite?.checked;if(infinite){infinite.disabled=mode==='off'||wholeSurah;if(wholeSurah)infinite.checked=true}if(range)range.classList.toggle('hidden',mode!=='range');
  });
  if(from)from.addEventListener('change',()=>{if(to&&Number(to.value)<Number(from.value))to.value=from.value});
  if(infinite)infinite.addEventListener('change',()=>{if(count)count.disabled=repeatMode?.value==='off'||repeatMode?.value==='surah'||infinite.checked});
  const speed=overlay.querySelector('#more-speed');if(speed)speed.addEventListener('change',e=>{state.listen.speed=e.target.value;player.playbackRate=Number(e.target.value);persist()});
  const afterSurah=overlay.querySelector('#after-surah');const stopAfterBlock=overlay.querySelector('#stop-after-block');
  if(afterSurah)afterSurah.addEventListener('change',e=>{if(stopAfterBlock)stopAfterBlock.classList.toggle('hidden',e.target.value!=='continue')});
  overlay.querySelectorAll('[data-action="favorite-reciter"]').forEach(btn=>btn.addEventListener('click',()=>{
    const id=btn.dataset.id;state.listen.favoriteReciters=state.listen.favoriteReciters.includes(id)?state.listen.favoriteReciters.filter(x=>x!==id):[...state.listen.favoriteReciters,id];persist();overlay.outerHTML=audioSettingsSheet();bindGenericSheet();
  }));
  overlay.querySelectorAll('[data-action="choose-reciter"]').forEach(btn=>btn.addEventListener('click',async()=>{
    const wasPlaying=!player.paused;state.listen.reciter=btn.dataset.id;state.listen.reciterName=btn.dataset.name;state.listen.track=0;state.listen.repeatMode='off';state.listen.repeatAnchor=null;state.listen.repeatRemaining=0;stopSmartFollow();player.pause();player.removeAttribute('src');player.load();persist();overlay.remove();render();await loadCurrentSurahAudio({autoplay:wasPlaying,fromStart:true});
  }));
  const apply=overlay.querySelector('#apply-repeat');if(apply)apply.addEventListener('click',()=>{
    const mode=repeatMode?.value||'off';state.listen.repeatMode=mode;state.listen.repeatCount=mode==='surah'?'infinite':(infinite?.checked?'infinite':String(Math.max(1,Math.min(99,Number(count?.value)||3))));
    if(mode==='range'){
      state.listen.repeatStart=Math.max(1,Number(from?.value)||1);state.listen.repeatEnd=Math.max(state.listen.repeatStart,Number(to?.value)||state.listen.repeatStart);
    }
    const auto=overlay.querySelector('#settings-auto-scroll');state.listen.autoScroll=auto?.value!=='off';
    const matchPractice=overlay.querySelector('#match-practice-surah');state.listen.matchPracticeSurah=matchPractice?.value!=='off';
    const follow=overlay.querySelector('#follow-mode');state.listen.followMode=['lineflow','flow','off'].includes(follow?.value)?follow.value:'lineflow';
    stopSmartFollow();
    state.listen.afterSurah=afterSurah?.value==='continue'?'continue':'stop';
    const stop=overlay.querySelector('#stop-after-surah');state.listen.stopAfterSurah=state.listen.afterSurah==='continue'&&stop?.value!=='none'?Number(stop?.value):null;
    initializeRepeatPlan({seekToStart:mode==='range'});overlay.remove();render();updateCurrentListeningUI();if(state.listen.autoScroll)scrollCurrentListeningAyah();
  });
  overlay.querySelectorAll('[data-action="ayah-highlight"]').forEach(btn=>btn.addEventListener('click',()=>{const ayah=Number(btn.dataset.ayah),color=btn.dataset.color||'none',key=listenHighlightKey(state.listen.selectedSurah,ayah);if(color==='none')delete state.listen.highlights[key];else state.listen.highlights[key]=color;persist();overlay.outerHTML=ayahNotesSheet(ayah);bindGenericSheet();render()}));
  const open=overlay.querySelector('[data-action="open-ayah-practice"]');if(open)open.addEventListener('click',()=>{overlay.remove();state.mode='practice';state.selectedSurah=state.listen.selectedSurah;state.screen='surah-detail';state.surahView='whole';persist();render();ensureVerses(state.selectedSurah)});
}

function addSheet(){
  const q=addSearch.trim().toLowerCase();
  const matches=s=>(`${s.id} ${s.name} ${s.arabic||''}`).toLowerCase().includes(q);
  const shown=state.catalog.filter(matches).length;
  return `<div class="modal-backdrop" data-action="close-add"><section class="sheet" role="dialog" aria-modal="true" aria-label="Manage memorized Surahs" data-sheet><div class="sheet-head"><div><h2 class="title">Memorized Surahs</h2><p class="subtitle">Search Surahs individually, or open Bulk by Juz when you need it.</p></div><button class="close" data-action="close-add">×</button></div>
    <details id="add-juz-details" class="juz-manager juz-collapsible" ${addJuzOpen?'open':''}><summary><div><b class="small">Bulk by Juz</b><div class="tiny muted">Quickly toggle Surahs whose first ayah begins in a Juz.</div></div><span class="juz-summary-side"><span class="tiny muted">1–30</span><span class="juz-chevron">⌄</span></span></summary><div class="juz-toggle-grid">${Array.from({length:30},(_,i)=>i+1).map(j=>{const ids=surahsStartingInJuz(j);const on=ids.length>0&&ids.every(id=>state.collection.includes(id));return `<label class="juz-toggle ${on?'on':''}"><span>Juz ${j}</span><input type="checkbox" data-action="toggle-juz-collection" data-juz="${j}" ${on?'checked':''}><span class="mini-switch"></span></label>`}).join('')}</div></details>
    <form id="add-search-form" class="add-search-form section" role="search"><input id="add-search" class="search" value="${escapeHtml(addSearch)}" placeholder="Search all Surahs" autocomplete="off" /><button type="submit" class="add-search-button" aria-label="Search Surahs">Search</button></form>
    <div id="add-surah-results" style="margin-top:6px">${state.catalog.map(s=>{const on=state.collection.includes(Number(s.id));const visible=matches(s);return `<div class="add-row" data-add-surah-row ${visible?'':'hidden'}><div><b class="small">${s.id} · ${escapeHtml(s.name)}</b><span class="arabic-name">${escapeHtml(s.arabic||'')}</span><div class="tiny muted">${s.ayahCount||''} ayahs · begins in Juz ${juzForAyah(s.id,1)}</div></div><label class="collection-switch"><input type="checkbox" data-action="toggle-surah-collection" data-id="${s.id}" ${on?'checked':''}><span class="switch-ui"></span></label></div>`}).join('')}<div id="add-search-empty" class="empty" ${shown?'hidden':''}>No Surahs match.</div></div><div class="notice section"><b>Safe to toggle:</b> turning a Surah off removes it from the active revision collection but keeps its saved stars, red ayahs, notes, and history.</div></section></div>`;
}

async function ensureVerses(id,{signal}={}){
  id=Number(id);if(verseCache.has(id))return verseCache.get(id);
  try{
    const verses=await fetchSurahVerses(id,{signal});
    verseCache.set(id,verses);
    if((state.mode==='listen'&&state.listen.screen==='now-playing'&&Number(state.listen.selectedSurah)===id)||(state.mode==='practice'&&Number(state.selectedSurah)===id))render();
    return verses;
  }catch(e){
    if(e?.name==='AbortError')return null;
    verseCache.set(id,[]);announce('Could not load Quran text. Check your connection.');return [];
  }
}
async function ensureWords(id,{signal}={}){
  id=Number(id);if(wordCache.has(id))return wordCache.get(id);
  try{
    const grouped=await fetchWordByWordSurah(id,{signal});
    wordCache.set(id,grouped||{});
    if(state.mode==='listen'&&state.listen.screen==='now-playing'&&Number(state.listen.selectedSurah)===id){render();updateCurrentListeningUI();}
    return grouped||{};
  }catch(e){
    if(e?.name==='AbortError')return null;
    wordCache.set(id,{});
    if(state.mode==='listen'&&state.listen.screen==='now-playing'&&Number(state.listen.selectedSurah)===id)render();
    return {};
  }
}
function loadSelectedListenContent(id){
  id=Number(id);
  if(listenContentController)listenContentController.abort();
  const controller=new AbortController();
  listenContentController=controller;
  // Only the Surah the user opened is loaded. Text and word meanings run in
  // parallel and never block the full-Surah audio from starting.
  const verses=ensureVerses(id,{signal:controller.signal});
  const words=ensureWords(id,{signal:controller.signal});
  return Promise.allSettled([verses,words]).finally(()=>{if(listenContentController===controller)listenContentController=null});
}
async function refreshSelectedListenContent(){
  const id=Number(state.listen.selectedSurah);
  if(!id||listenContentRefreshing)return;
  listenContentRefreshing=true;
  if(listenContentController)listenContentController.abort();
  verseCache.delete(id);
  wordCache.delete(id);
  render();
  try{
    await loadSelectedListenContent(id);
    announce('Ayahs and meanings refreshed.');
  }finally{
    listenContentRefreshing=false;
    if(state.mode==='listen'&&state.listen.screen==='now-playing'&&Number(state.listen.selectedSurah)===id){render();updateCurrentListeningUI();}
  }
}
async function ensureCatalog(){
  try{const c=await fetchSurahCatalog();state.catalog=c;persist();render()}catch{ /* fallback stays available */ }
}
async function ensureReciters(){
  const existing=(state.listen.reciters||[]).filter(r=>r&&r.server&&r.timingReadId);
  const hasNufais=existing.some(r=>/Nufais/i.test(r.name||''));
  const hasDosari=existing.some(r=>/(Yass?er|Yasir).*(Dosari|Dawsari)/i.test(r.name||''));
  if(existing.length&&hasNufais&&hasDosari){if(!selectedReciter()){const first=existing[0];state.listen.reciter=first?.id||null;state.listen.reciterName=first?.name||'Choose a reciter'}return}
  try{
    const all=await fetchAudioEditions();
    const targets=[
      r=>/Mishary.*Alaf/i.test(r.name||'')||/Alafasy/i.test(r.name||''),
      r=>/Ahm[ae]d.*Nufais/i.test(r.name||'')||/Nufais/i.test(r.name||''),
      r=>/Yass?er.*(Dosari|Dawsari)/i.test(r.name||'')||/Yasir.*(Dosari|Dawsari)/i.test(r.name||'')
    ];
    const priority=targets.map(test=>all.find(test)).filter(Boolean);
    const unique=[];priority.forEach(r=>{if(!unique.some(x=>x.id===r.id))unique.push(r)});
    all.forEach(r=>{if(!unique.some(x=>x.id===r.id)&&unique.length<12)unique.push(r)});
    state.listen.reciters=unique;
    const chosen=unique.find(r=>r.id===state.listen.reciter)||priority[0]||unique[0];state.listen.reciter=chosen?.id||null;state.listen.reciterName=chosen?.name||'Choose a reciter';persist();render();
  }catch{state.listen.reciters=[];state.listen.reciter=null;state.listen.reciterName='Reciters unavailable';persist();render()}
}
async function ensureAudio(){
  const reciter=selectedReciter();if(!reciter)return null;const key=audioKey();if(audioCache.has(key))return audioCache.get(key);
  try{const pack=await fetchSurahAudio(state.listen.selectedSurah,reciter);audioCache.set(key,pack);return pack}catch{announce('Could not load this full-Surah recitation.');return null}
}
async function loadCurrentSurahAudio({autoplay=false,fromStart=false}={}){
  const pack=await ensureAudio();if(!pack?.audio)return;
  const changed=player.src!==pack.audio;
  if(changed){stopSmartFollow({preserveStatus:true});player.src=pack.audio;player.playbackRate=Number(state.listen.speed||1)}
  if(fromStart){state.listen.track=0;if(state.listen.repeatMode==='ayah'){state.listen.repeatAnchor=null;state.listen.repeatRemaining=0}}
  const seek=()=>{if(fromStart)player.currentTime=0;else{const t=pack.timings?.[state.listen.track];if(t)player.currentTime=Math.max(0,t.startMs/1000)}};
  if(player.readyState>=1)seek();else player.addEventListener('loadedmetadata',seek,{once:true});
  if(fromStart){smartWordIndex=-1;smartAyahNumber=pack.timings?.[0]?.number||1;clearSmartWordUI()}
  if(autoplay){try{await player.play()}catch{announce('Tap resume to start audio.')}}
  updateCurrentListeningUI();
}
async function seekAyah(delta){
  const pack=await ensureAudio();if(!pack?.timings?.length)return;const wasPlaying=!player.paused;state.listen.track=Math.max(0,Math.min(pack.timings.length-1,state.listen.track+delta));
  if(state.listen.repeatMode==='ayah')initializeRepeatPlan();else persist();
  await loadCurrentSurahAudio({autoplay:wasPlaying});scrollCurrentListeningAyah();refreshSmartFollowForAyah();
}
async function playFromAyah(number){
  const pack=await ensureAudio();if(!pack?.timings?.length)return;
  let idx=pack.timings.findIndex(t=>Number(t.number)===Number(number));
  if(idx<0)idx=Math.max(0,Math.min(pack.timings.length-1,Number(number)-1));
  state.listen.track=idx;
  if(state.listen.repeatMode==='ayah')initializeRepeatPlan();else persist();
  await loadCurrentSurahAudio({autoplay:true});
  updateCurrentListeningUI(true,pack.timings[idx]?.startMs||0,pack.timings[idx]);
  scrollCurrentListeningAyah('smooth');
}

async function continueAfterSurahIfNeeded(){
  if(state.listen.afterSurah!=='continue')return false;
  const current=Number(state.listen.selectedSurah)||1;
  if(state.listen.stopAfterSurah!=null&&current>=Number(state.listen.stopAfterSurah))return false;
  const next=current+1;if(next>114)return false;
  stopSmartFollow();state.listen.selectedSurah=next;state.listen.track=0;state.listen.repeatMode='off';state.listen.repeatAnchor=null;state.listen.repeatRemaining=0;
  persist();
  render();loadSelectedListenContent(next);await ensureReciters();await loadCurrentSurahAudio({autoplay:true,fromStart:true});scrollCurrentListeningAyah('auto');
  return true;
}
function recordRecent(s){const previous=(state.listen.recent||[]).find(x=>Number(x.id)===Number(s.id));const rest=(state.listen.recent||[]).filter(x=>Number(x.id)!==Number(s.id));state.listen.recent=[{id:s.id,name:s.name,when:shortToday(),listenedAt:Date.now(),lastAyah:Math.max(1,Number(previous?.lastAyah)||Number(state.listen.track)+1),positionUpdatedAt:Number(previous?.positionUpdatedAt)||Date.now()},...rest].slice(0,50);persist()}

function bind(){
  document.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',async e=>{
    const a=el.dataset.action;
    if(a==='mode'){
      const nextMode=el.dataset.mode;
      const matchFromPractice=nextMode==='listen'&&state.mode==='practice'&&state.screen==='surah-detail'&&state.listen.matchPracticeSurah!==false;
      state.mode=nextMode;
      if(matchFromPractice){
        const target=Number(state.selectedSurah);
        const changed=Number(state.listen.selectedSurah)!==target;
        state.listen.selectedSurah=target;state.listen.track=0;state.listen.screen='now-playing';state.listen.repeatAnchor=null;state.listen.repeatRemaining=0;
        if(changed){player.pause();player.removeAttribute('src');player.load();}
        persist();render();loadSelectedListenContent(target);await ensureReciters();render();await loadCurrentSurahAudio({autoplay:false,fromStart:true});scrollCurrentListeningAyah('auto');return;
      }
      if(state.mode==='listen')ensureReciters();else stopSmartFollow();persist();render();return
    }
    if(a==='nav'){if(state.mode==='practice'){state.screen=el.dataset.screen;persist();render();if(state.screen==='meanings')ensureMeaningBank();return}else{state.listen.screen=el.dataset.screen;if(state.listen.screen!=='now-playing')stopSmartFollow();persist();render();if(state.listen.screen==='now-playing'){render();loadSelectedListenContent(state.listen.selectedSurah);await ensureReciters();render();await loadCurrentSurahAudio({autoplay:false})}return}}
    if(a==='go-queue'){state.screen='queue';render();return}
    if(a==='home-continue-practice'){state.selectedSurah=Number(el.dataset.id);state.screen='surah-detail';state.surahView='whole';state.mushafFocus=null;persist();render();ensureVerses(state.selectedSurah).then(()=>{if(state.experimentalMushaf)ensureExactMushafPages(state.selectedSurah)});return}
    if(a==='home-listen'){state.mode='listen';state.listen.screen='listen-surahs';persist();render();ensureReciters();return}
    if(a==='home-continue-listen'){const id=Number(el.dataset.id),ayah=Math.max(1,Number(el.dataset.ayah)||1);state.mode='listen';state.listen.selectedSurah=id;state.listen.track=Math.max(0,ayah-1);state.listen.screen='now-playing';persist();render();loadSelectedListenContent(id);await ensureReciters();render();await loadCurrentSurahAudio({autoplay:false});scrollCurrentListeningAyah('auto');return}
    if(a==='home-meanings'){state.screen='meanings';persist();render();ensureMeaningBank();return}
    if(a==='home-learn-word'){toggleKnownMeaningFamily(el.dataset.key);persist();render();return}
    if(a==='home-red-ayahs'){state.screen='all-red';persist();render();ensureAllRedAyahVerses();return}
    if(a==='back-home'){state.screen='home';persist();render();return}
    if(a==='open-red-surah'){state.selectedSurah=Number(el.dataset.id);state.screen='surah-detail';state.surahView='red';state.mushafFocus=null;persist();render();ensureVerses(state.selectedSurah);return}
    if(a==='sort'){state.sort=el.dataset.sort;persist();render();return}
    if(a==='meaning-tab'){state.meanings.tab=el.dataset.tab||'all';meaningsVisibleLimit=120;quizFeedback=null;if(state.meanings.tab==='quiz')makeMeaningQuizQuestion();persist();render();ensureMeaningBank();return}
    if(a==='toggle-known-word'){const key=el.dataset.key;if(!key)return;const known=new Set(state.meanings.known||[]);if(known.has(key))known.delete(key);else{known.add(key);if(!state.meanings.learnedOn[key])state.meanings.learnedOn[key]=Date.now()}state.meanings.known=[...known];quizQuestion=null;quizFeedback=null;persist();render();return}
    if(a==='meanings-top'){fastMeaningsScrollTop();return}
    if(a==='meanings-mode'){state.meanings.displayMode=el.dataset.mode==='forms'?'forms':'core';meaningsVisibleLimit=120;quizQuestion=null;quizFeedback=null;persist();render();return}
    if(a==='toggle-known-family'){toggleKnownMeaningFamily(el.dataset.key);quizQuestion=null;quizFeedback=null;persist();render();return}
    if(a==='meaning-more'){meaningsVisibleLimit+=120;render();return}
    if(a==='quiz-mode'){state.meanings.quiz.mode=el.dataset.mode==='en-ar'?'en-ar':'ar-en';quizQuestion=null;quizFeedback=null;persist();render();return}
    if(a==='quiz-answer'){if(quizFeedback||!quizQuestion)return;const selectedKey=el.dataset.key,correct=selectedKey===quizQuestion.answerKey;const stats=state.meanings.quiz;stats.total=(stats.total||0)+1;if(correct){stats.correct=(stats.correct||0)+1;stats.streak=(stats.streak||0)+1;stats.best=Math.max(stats.best||0,stats.streak)}else stats.streak=0;const perf=state.meanings.performance[quizQuestion.answerKey]||{correct:0,wrong:0};if(correct)perf.correct++;else perf.wrong++;state.meanings.performance[quizQuestion.answerKey]=perf;quizFeedback={selectedKey,correct};persist();render();return}
    if(a==='quiz-next'){makeMeaningQuizQuestion();render();return}
    if(a==='open-surah'){state.selectedSurah=Number(el.dataset.id);state.screen='surah-detail';state.surahView='whole';state.mushafPage=null;state.mushafFocus=null;persist();render();ensureVerses(state.selectedSurah).then(()=>{if(state.experimentalMushaf)ensureExactMushafPages(state.selectedSurah)});return}
    if(a==='back-surahs'){state.screen='surahs';render();return}
    if(a==='surah-view'){state.surahView=el.dataset.view;persist();render();if(state.surahView==='whole'&&state.experimentalMushaf)ensureExactMushafPages(state.selectedSurah);return}
    if(a==='toggle-exp-mushaf'){state.experimentalMushaf=!state.experimentalMushaf;if(state.experimentalMushaf)state.mushafPage=null;persist();render();if(state.experimentalMushaf)ensureExactMushafPages(state.selectedSurah);return}
    if(a==='mushaf-page-prev'){state.mushafPage=Math.max(1,(Number(state.mushafPage)||1)-1);persist();render();ensureExactMushafPage(state.mushafPage);return}
    if(a==='mushaf-page-next'){state.mushafPage=Math.min(604,(Number(state.mushafPage)||1)+1);persist();render();ensureExactMushafPage(state.mushafPage);return}
    if(a==='mushaf-page-go'){const input=document.querySelector('#mushaf-page-input');state.mushafPage=Math.max(1,Math.min(604,Number(input?.value)||Number(state.mushafPage)||1));persist();render();ensureExactMushafPage(state.mushafPage);return}
    if(a==='toggle-mushaf-lines'){state.mushafLineGuides=!state.mushafLineGuides;persist();render();return}
    if(a==='inspect-mushaf-line'){document.body.insertAdjacentHTML('beforeend',lineReferenceSheet(Number(el.dataset.page),Number(el.dataset.line)));bindGenericSheet();return}
    if(a==='mushaf-page-notes'){document.body.insertAdjacentHTML('beforeend',mushafPageNotesSheet(Number(el.dataset.page||state.mushafPage)));bindGenericSheet();return}
    if(a==='toggle-ayah'){const r=rev(state.selectedSurah),n=Number(el.dataset.ayah),wasRed=r.redAyahs.includes(n);r.redAyahs=wasRed?r.redAyahs.filter(x=>x!==n):[...r.redAyahs,n].sort((x,y)=>x-y);recordRedHistory(state.selectedSurah,n,wasRed?'green':'red');persist();render();return}
    if(a==='practice-ayah-note'){document.body.insertAdjacentHTML('beforeend',practiceAyahNoteSheet(Number(el.dataset.surah||state.selectedSurah),Number(el.dataset.ayah)));bindGenericSheet();return}
    if(a==='enter-log'){draftRating=0;draftNote='';state.screen='log';render();return}
    if(a==='rate'){const ta=document.querySelector('#log-note');if(ta)draftNote=ta.value;draftRating=Number(el.dataset.rating);render();return}
    if(a==='save-log'){if(!draftRating)return;const r=rev(state.selectedSurah);r.rating=draftRating;r.lastRecited=shortToday();r.logs=[{date:shortToday(),createdAt:Date.now(),rating:draftRating,note:draftNote.trim(),redAyahs:[...r.redAyahs]},...(r.logs||[])];persist();state.screen='history';draftRating=0;draftNote='';render();return}
    if(a==='back-detail'){state.screen='surah-detail';render();ensureVerses(state.selectedSurah).then(()=>{if(state.experimentalMushaf)ensureExactMushafPages(state.selectedSurah)});return}
    if(a==='history'){state.screen='history';render();return}
    if(a==='reverse-ranking'){strongestFirst=!strongestFirst;render();return}
    if(a==='red-view'){state.stats.redView=el.dataset.view;persist();render();return}
    if(a==='toggle-red-juz'){const j=Number(el.dataset.juz);state.stats.redJuz=state.stats.redJuz.includes(j)?state.stats.redJuz.filter(x=>x!==j):[...state.stats.redJuz,j].sort((x,y)=>x-y);persist();render();return}
    if(a==='clear-red-juz'){state.stats.redJuz=[];persist();render();return}
    if(a==='open-red-mushaf'){const sid=Number(el.dataset.surah),ayah=Number(el.dataset.ayah);state.selectedSurah=sid;state.screen='surah-detail';state.surahView='whole';state.experimentalMushaf=true;state.mushafFocus={surah:sid,ayah};const verses=verseCache.get(sid)||await ensureVerses(sid)||[];const target=verses.find(v=>Number(v.number)===ayah);state.mushafPage=Number(target?.page)||mushafPagesForVerses(verses)[0]||1;persist();render();await ensureExactMushafPage(state.mushafPage);fitExactMushafLines();return}
    if(a==='toggle-mushaf-tajweed'){state.mushafTajweed=!state.mushafTajweed;persist();render();await ensureExactMushafPage(state.mushafPage||1);fitExactMushafLines();return}
    if(a==='open-red-ayah'){state.selectedSurah=Number(el.dataset.surah);state.screen='surah-detail';state.surahView='red';persist();render();ensureVerses(state.selectedSurah);return}
    if(a==='account-settings'){document.body.insertAdjacentHTML('beforeend',accountSecuritySheet());bindAccountSecuritySheet();return}
    if(a==='download-backup'){downloadLocalBackup();return}
    if(a==='restore-recovery'){restoreRecovery(Number(el.dataset.hours));return}
    if(a==='open-add'){addSearch='';addJuzOpen=false;document.body.insertAdjacentHTML('beforeend',addSheet());bindSheet();return}
    if(a==='go-stats'){state.screen='stats';render();return}
    if(a==='reset-demo'){if(confirm('Reset all local prototype revision data?')){resetState();location.reload()}return}
    if(a==='listen-surah'){const id=Number(el.dataset.id);const s=catalogItem(id);state.listen.selectedSurah=id;state.listen.track=0;state.listen.screen='now-playing';persist();render();loadSelectedListenContent(id);await ensureReciters();render();await loadCurrentSurahAudio({autoplay:true,fromStart:true});scrollCurrentListeningAyah('auto');return}
    if(a==='favorite-reciter'){const id=el.dataset.id;state.listen.favoriteReciters=state.listen.favoriteReciters.includes(id)?state.listen.favoriteReciters.filter(x=>x!==id):[...state.listen.favoriteReciters,id];persist();const overlay=el.closest('.modal-backdrop');if(overlay){overlay.outerHTML=audioSettingsSheet();bindGenericSheet()}return}
    if(a==='choose-reciter'){const wasPlaying=!player.paused;state.listen.reciter=el.dataset.id;state.listen.reciterName=el.dataset.name;state.listen.track=0;state.listen.repeatMode='off';state.listen.repeatAnchor=null;state.listen.repeatRemaining=0;stopSmartFollow();player.pause();player.removeAttribute('src');player.load();persist();const overlay=el.closest('.modal-backdrop');if(overlay)overlay.remove();render();if(state.listen.screen==='now-playing')await loadCurrentSurahAudio({autoplay:wasPlaying,fromStart:true});return}
    if(a==='toggle-play'){if(player.paused){if(!player.src)await loadCurrentSurahAudio({autoplay:true});else try{await player.play()}catch{announce('Tap resume again to start audio.')}}else player.pause();syncPlayerButton();return}
    if(a==='prev-track'){await seekAyah(-1);return}
    if(a==='next-track'){await seekAyah(1);return}
    if(a==='audio-more'){document.body.insertAdjacentHTML('beforeend',audioSettingsSheet());bindGenericSheet();return}
    if(a==='ayah-more'){document.body.insertAdjacentHTML('beforeend',ayahNotesSheet(Number(el.dataset.ayah)));bindGenericSheet();return}
    if(a==='refresh-listen-content'){await refreshSelectedListenContent();return}
    if(a==='play-ayah'){await playFromAyah(Number(el.dataset.ayah));return}
  }));
  const mushafPageInput=document.querySelector('#mushaf-page-input');if(mushafPageInput)mushafPageInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();state.mushafPage=Math.max(1,Math.min(604,Number(mushafPageInput.value)||Number(state.mushafPage)||1));persist();render();ensureExactMushafPage(state.mushafPage)}});
  const search=document.querySelector('#surah-search');if(search)search.addEventListener('input',e=>{const value=e.target.value;const start=e.target.selectionStart??value.length;const end=e.target.selectionEnd??start;state.query=value;persist();render();const next=document.querySelector('#surah-search');if(next){next.focus({preventScroll:true});try{next.setSelectionRange(start,end)}catch{}}});
  const meaningSearch=document.querySelector('#meaning-search');if(meaningSearch)meaningSearch.addEventListener('input',e=>{const pos=e.target.selectionStart??e.target.value.length;meaningsQuery=e.target.value;meaningsVisibleLimit=120;render();requestAnimationFrame(()=>{const next=document.querySelector('#meaning-search');if(next){next.focus({preventScroll:true});try{next.setSelectionRange(pos,pos)}catch{}}})});
  const meaningSort=document.querySelector('#meaning-sort');if(meaningSort)meaningSort.addEventListener('change',e=>{state.meanings.sort=e.target.value;meaningsVisibleLimit=120;persist();render()});
  const note=document.querySelector('#log-note');if(note)note.addEventListener('input',e=>{draftNote=e.target.value});
  const filter=document.querySelector('#note-filter');if(filter)filter.addEventListener('change',e=>{noteFilter=e.target.value;render()});
  updateMeaningsTopButton();
}
function fastMeaningsScrollTop(){const start=window.scrollY||document.documentElement.scrollTop||0;if(start<=0)return;const duration=320,startTime=performance.now();const ease=t=>1-Math.pow(1-t,3);const step=now=>{const p=Math.min(1,(now-startTime)/duration);window.scrollTo(0,Math.round(start*(1-ease(p))));if(p<1)requestAnimationFrame(step)};requestAnimationFrame(step)}
function updateMeaningsTopButton(){const b=document.querySelector('#meanings-to-top');if(!b)return;b.classList.toggle('show',(window.scrollY||document.documentElement.scrollTop||0)>220)}
window.addEventListener('scroll',updateMeaningsTopButton,{passive:true});


// v0.1.30 — concise Quran vocabulary families.
// Keep the full surface-form index underneath, but default the UI to a
// lemma-style "Core Words" view so attached particles, pronouns and common
// inflections do not force the learner to memorize the same idea repeatedly.
function generateMeaningCoreCandidates(value=''){
  const original=normalizeMeaningKey(value).replace(/\s+/g,'');
  const out=new Set([original]);
  const add=v=>{v=String(v||'').trim();if(v.length>=2)out.add(v)};
  const prefixPass=[original];
  if(original.length>3&&/^[وف]/.test(original)){add(original.slice(1));prefixPass.push(original.slice(1))}
  for(const form of [...prefixPass]){
    if(form.length>4&&form.startsWith('ال'))add(form.slice(2));
    if(form.length>4&&/^[بك]ال/.test(form))add(form.slice(1));
    if(form.length>3&&form.startsWith('لل'))add(`ال${form.slice(2)}`);
  }
  const suffixes=['كما','هما','كم','كن','هم','هن','نا','ها','وا','ون','ين','ان','ات','ه','ك','ي'];
  for(const form of [...out]){
    for(const suffix of suffixes){
      if(form.endsWith(suffix)&&form.length-suffix.length>=2)add(form.slice(0,-suffix.length));
    }
  }
  return [...out];
}
function buildCoreMeaningFamilies(){
  const raw=meaningBank.entries||[];
  const signature=`${meaningBank.updatedAt||0}:${raw.length}:${meaningBank.totalOccurrences||0}`;
  if(coreMeaningCache.signature===signature)return coreMeaningCache.entries;
  const exact=new Set(raw.map(e=>normalizeMeaningKey(e.key)));
  const candidateFrequency=new Map();
  const candidateLists=new Map();
  for(const entry of raw){
    const list=generateMeaningCoreCandidates(entry.key);candidateLists.set(entry.key,list);
    for(const candidate of list){if(candidate!==normalizeMeaningKey(entry.key))candidateFrequency.set(candidate,(candidateFrequency.get(candidate)||0)+1)}
  }
  const groups=new Map();
  for(const entry of raw){
    const original=normalizeMeaningKey(entry.key);const candidates=candidateLists.get(entry.key)||[original];
    const viable=candidates.filter(c=>c!==original&&(exact.has(c)||(c.length>=3&&(candidateFrequency.get(c)||0)>=2)));
    viable.sort((a,b)=>(exact.has(b)?1:0)-(exact.has(a)?1:0)||a.length-b.length||(candidateFrequency.get(b)||0)-(candidateFrequency.get(a)||0));
    const core=viable[0]||original;const familyKey=`core:${core}`;
    let family=groups.get(familyKey);
    if(!family){family={key:familyKey,core,arabic:'',transliteration:'',meanings:[],count:0,firstSurah:Number(entry.firstSurah)||114,firstAyah:Number(entry.firstAyah)||999,forms:[]};groups.set(familyKey,family)}
    family.forms.push(entry);family.count+=(Number(entry.count)||0);
    if((Number(entry.firstSurah)||114)<family.firstSurah||((Number(entry.firstSurah)||114)===family.firstSurah&&(Number(entry.firstAyah)||999)<family.firstAyah)){family.firstSurah=Number(entry.firstSurah)||114;family.firstAyah=Number(entry.firstAyah)||999}
  }
  for(const family of groups.values()){
    family.forms.sort((a,b)=>(Number(b.count)||0)-(Number(a.count)||0));
    const exactRepresentative=family.forms.find(f=>normalizeMeaningKey(f.key)===family.core);
    const representative=exactRepresentative||family.forms[0];
    family.arabic=representative?.arabic||representative?.key||family.core;
    family.transliteration=representative?.transliteration||'';
    const meaningCounts=new Map();
    family.forms.forEach(form=>(form.meanings||[form.meaning]).filter(Boolean).forEach(m=>meaningCounts.set(m,(meaningCounts.get(m)||0)+(Number(form.count)||1))));
    family.meanings=[...meaningCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([m])=>m);
  }
  const entries=[...groups.values()];coreMeaningCache={signature,entries};return entries;
}
function coreMeaningEntry(key){return buildCoreMeaningFamilies().find(e=>e.key===key)||null}
function familyKnown(entry){const known=meaningKnownSet();return !!entry?.forms?.some(form=>known.has(form.key))}
function familyLearnedOn(entry){
  const dates=(entry?.forms||[]).map(form=>Number(state.meanings.learnedOn?.[form.key])||0).filter(Boolean).sort((a,b)=>a-b);return dates[0]||0;
}
function toggleKnownMeaningFamily(key){
  const family=coreMeaningEntry(key);if(!family)return;
  const known=new Set(state.meanings.known||[]);const formKeys=family.forms.map(f=>f.key);const currentlyKnown=formKeys.some(k=>known.has(k));
  if(currentlyKnown){formKeys.forEach(k=>known.delete(k))}
  else{
    const representative=(family.forms.find(f=>normalizeMeaningKey(f.key)===family.core)||family.forms[0]);if(!representative)return;
    known.add(representative.key);
    if(!state.meanings.learnedOn[representative.key]){
      const historical=familyLearnedOn(family);state.meanings.learnedOn[representative.key]=historical||Date.now();
    }
  }
  state.meanings.known=[...known];
}
function meaningCoverage(){
  const known=meaningKnownSet(),raw=meaningBank.entries||[],families=buildCoreMeaningFamilies();
  const knownEntries=raw.filter(e=>known.has(e.key));
  const knownFamilies=families.filter(f=>familyKnown(f));
  const knownOccurrences=knownFamilies.reduce((sum,e)=>sum+(Number(e.count)||0),0);
  const totalOccurrences=Math.max(0,Number(meaningBank.totalOccurrences)||0);
  return {knownEntries,knownFamilies,knownOccurrences,totalOccurrences,uniquePct:families.length?knownFamilies.length/families.length*100:0,coveragePct:totalOccurrences?knownOccurrences/totalOccurrences*100:0,coreTotal:families.length};
}
function coreFilteredMeaningEntries({knownOnly=false}={}){
  const q=meaningsQuery.trim().toLowerCase();let entries=buildCoreMeaningFamilies().filter(e=>!knownOnly||familyKnown(e));
  if(q)entries=entries.filter(e=>`${e.arabic} ${e.core} ${e.transliteration||''} ${(e.meanings||[]).join(' ')} ${(e.forms||[]).map(f=>`${f.arabic} ${f.transliteration||''} ${(f.meanings||[]).join(' ')}`).join(' ')}`.toLowerCase().includes(q));
  if(state.meanings.sort==='quran')entries.sort((a,b)=>(a.firstSurah-b.firstSurah)||(a.firstAyah-b.firstAyah));
  else if(state.meanings.sort==='az')entries.sort((a,b)=>String(a.core).localeCompare(String(b.core),'ar'));
  else entries.sort((a,b)=>(Number(b.count)||0)-(Number(a.count)||0)||String(a.core).localeCompare(String(b.core),'ar'));
  return entries;
}
function rawFilteredMeaningEntries({knownOnly=false}={}){
  const q=meaningsQuery.trim().toLowerCase();let entries=[...(meaningBank.entries||[])];
  if(knownOnly)entries=entries.filter(e=>{const family=buildCoreMeaningFamilies().find(f=>f.forms.some(form=>form.key===e.key));return familyKnown(family)});
  if(q)entries=entries.filter(e=>`${e.arabic} ${e.key} ${e.transliteration||''} ${(e.meanings||[]).join(' ')}`.toLowerCase().includes(q));
  if(state.meanings.sort==='quran')entries.sort((a,b)=>(a.firstSurah-b.firstSurah)||(a.firstAyah-b.firstAyah));
  else if(state.meanings.sort==='az')entries.sort((a,b)=>String(a.key).localeCompare(String(b.key),'ar'));
  else entries.sort((a,b)=>(Number(b.count)||0)-(Number(a.count)||0)||String(a.key).localeCompare(String(b.key),'ar'));
  return entries;
}
function familyForRawEntry(entry){return buildCoreMeaningFamilies().find(f=>f.forms.some(form=>form.key===entry.key))||null}
function coreMeaningWordRow(entry){
  const known=familyKnown(entry),learned=known?formatLearnedOn(familyLearnedOn(entry)):'';const formCount=entry.forms?.length||1;
  const variants=(entry.forms||[]).slice(0,10).map(f=>`<span dir="rtl">${escapeHtml(f.arabic||f.key)}</span>`).join('');
  return `<article class="meaning-word-row meaning-family-row ${known?'known':''}"><div class="meaning-word-main"><div class="meaning-arabic" dir="rtl">${escapeHtml(entry.arabic||entry.core)}</div><div class="meaning-definition"><b>${escapeHtml(primaryMeaning(entry))}</b>${entry.transliteration?`<span>${escapeHtml(entry.transliteration)}</span>`:''}<small>Core family · ${formCount} form${formCount===1?'':'s'} · appears ${Number(entry.count)||0}×</small>${learned?`<small class="meaning-learned-date">Learned on ${escapeHtml(learned)}</small>`:''}${formCount>1?`<details class="meaning-variants"><summary>Related forms</summary><div>${variants}${formCount>10?`<em>+${formCount-10} more</em>`:''}</div></details>`:''}</div></div><button class="word-known-toggle ${known?'on':''}" data-action="toggle-known-family" data-key="${escapeHtml(entry.key)}" aria-pressed="${known?'true':'false'}"><span>${known?'Known':'Learn'}</span><i></i></button></article>`;
}
function rawMeaningWordRow(entry){
  const family=familyForRawEntry(entry),known=familyKnown(family),learned=known?formatLearnedOn(familyLearnedOn(family)):'';
  return `<article class="meaning-word-row ${known?'known':''}"><div class="meaning-word-main"><div class="meaning-arabic" dir="rtl">${escapeHtml(entry.arabic||entry.key)}</div><div class="meaning-definition"><b>${escapeHtml(primaryMeaning(entry))}</b>${entry.transliteration?`<span>${escapeHtml(entry.transliteration)}</span>`:''}<small>Surface form · appears ${Number(entry.count)||0}× · family ${family?.forms?.length||1} form${(family?.forms?.length||1)===1?'':'s'}</small>${learned?`<small class="meaning-learned-date">Learned on ${escapeHtml(learned)}</small>`:''}</div></div><button class="word-known-toggle ${known?'on':''}" data-action="toggle-known-family" data-key="${escapeHtml(family?.key||`core:${normalizeMeaningKey(entry.key)}`)}" aria-pressed="${known?'true':'false'}"><span>${known?'Known':'Learn'}</span><i></i></button></article>`;
}
function highImpactWords(){return [...buildCoreMeaningFamilies()].filter(e=>!familyKnown(e)&&primaryMeaning(e)!=='Meaning unavailable').sort((a,b)=>(Number(b.count)||0)-(Number(a.count)||0)).slice(0,6)}
function makeMeaningQuizQuestion(){
  let pool=buildCoreMeaningFamilies().filter(e=>familyKnown(e)&&primaryMeaning(e)!=='Meaning unavailable');
  if(pool.length<4){quizQuestion=null;return null}
  const weighted=pool.flatMap(e=>{const perf=state.meanings.performance?.[e.key]||{};return Array(1+Math.min(3,Math.max(0,(perf.wrong||0)-(perf.correct||0)))).fill(e)});
  const answer=weighted[Math.floor(Math.random()*weighted.length)]||pool[0];const mode=state.meanings.quiz.mode;
  const valueOf=e=>mode==='ar-en'?primaryMeaning(e):(e.arabic||e.core);const distractors=shuffle(pool.filter(e=>e.key!==answer.key&&valueOf(e)!==valueOf(answer))).slice(0,3);const options=shuffle([answer,...distractors]);
  quizQuestion={answerKey:answer.key,prompt:mode==='ar-en'?(answer.arabic||answer.core):primaryMeaning(answer),options,mode};quizFeedback=null;return quizQuestion;
}
function quizView(){
  const knownCount=buildCoreMeaningFamilies().filter(e=>familyKnown(e)&&primaryMeaning(e)!=='Meaning unavailable').length;
  if(knownCount<4)return `<section class="meaning-quiz-card"><div class="meaning-quiz-empty"><div class="meaning-quiz-icon">?</div><h2>Add at least 4 core words</h2><p>Mark core word families you know, then come back here to test yourself.</p><button class="primary" data-action="meaning-tab" data-tab="all">Open Word Bank</button></div></section>`;
  if(!quizQuestion||quizQuestion.mode!==state.meanings.quiz.mode||!coreMeaningEntry(quizQuestion.answerKey))makeMeaningQuizQuestion();const q=quizQuestion;if(!q)return '';const stats=state.meanings.quiz;
  return `<div class="quiz-mode-switch"><button data-action="quiz-mode" data-mode="ar-en" class="${stats.mode==='ar-en'?'active':''}">Arabic → Meaning</button><button data-action="quiz-mode" data-mode="en-ar" class="${stats.mode==='en-ar'?'active':''}">Meaning → Arabic</button></div><section class="meaning-quiz-card"><div class="quiz-stats"><span>${stats.correct||0} correct</span><span>Streak ${stats.streak||0}</span><span>Best ${stats.best||0}</span></div><div class="quiz-prompt ${q.mode==='ar-en'?'arabic':''}" ${q.mode==='ar-en'?'dir="rtl"':''}>${escapeHtml(q.prompt)}</div><div class="quiz-options">${q.options.map(opt=>{const label=q.mode==='ar-en'?primaryMeaning(opt):(opt.arabic||opt.core);const selected=quizFeedback?.selectedKey===opt.key;const correct=quizFeedback&&opt.key===q.answerKey;const cls=quizFeedback?(correct?'correct':selected?'wrong':''):'';return `<button class="quiz-option ${q.mode==='en-ar'?'arabic':''} ${cls}" data-action="quiz-answer" data-key="${escapeHtml(opt.key)}" ${quizFeedback?'disabled':''}>${escapeHtml(label)}</button>`}).join('')}</div>${quizFeedback?`<div class="quiz-feedback ${quizFeedback.correct?'good':'bad'}"><b>${quizFeedback.correct?'Correct':'Not quite'}</b><span>${escapeHtml(q.mode==='ar-en'?primaryMeaning(coreMeaningEntry(q.answerKey)):(coreMeaningEntry(q.answerKey)?.arabic||q.answerKey))}</span></div><button class="primary full" data-action="quiz-next">Next word</button>`:''}</section>`;
}
function meaningsView(){
  const complete=(meaningBank.completedSurahs||[]).length>=114,progress=(meaningBank.completedSurahs||[]).length,coverage=meaningCoverage(),coreMode=state.meanings.displayMode!=='forms';
  const sourceEntries=coreMode?coreFilteredMeaningEntries({knownOnly:state.meanings.tab==='known'}):rawFilteredMeaningEntries({knownOnly:state.meanings.tab==='known'});const shown=sourceEntries.slice(0,meaningsVisibleLimit);const impact=highImpactWords();
  const rowRenderer=coreMode?coreMeaningWordRow:rawMeaningWordRow;
  const content=state.meanings.tab==='quiz'?quizView():`<div class="meaning-view-mode"><button data-action="meanings-mode" data-mode="core" class="${coreMode?'active':''}"><b>Core Words</b><span>Concise families</span></button><button data-action="meanings-mode" data-mode="forms" class="${!coreMode?'active':''}"><b>All Forms</b><span>Every variation</span></button></div><div class="meaning-core-note">Core Words groups attached and inflected Quranic forms under one practical base family. Related forms stay available underneath, so the full data is never lost.</div><div class="meaning-toolbar"><input id="meaning-search" class="search" value="${escapeHtml(meaningsQuery)}" placeholder="Search Arabic, transliteration, or meaning"><select id="meaning-sort" class="select compact-select"><option value="common" ${state.meanings.sort==='common'?'selected':''}>Most common</option><option value="quran" ${state.meanings.sort==='quran'?'selected':''}>Quran order</option><option value="az" ${state.meanings.sort==='az'?'selected':''}>Arabic A–Z</option></select></div>${state.meanings.tab==='all'&&impact.length?`<section class="impact-card"><div class="between"><div><b>Highest-impact core words</b><div class="tiny muted">Learn one family and recognize its repeated Quranic forms.</div></div><span class="impact-badge">Top ${impact.length}</span></div><div class="impact-words">${impact.map(e=>`<button data-action="toggle-known-family" data-key="${escapeHtml(e.key)}"><span class="impact-arabic" dir="rtl">${escapeHtml(e.arabic||e.core)}</span><span>${escapeHtml(primaryMeaning(e))}</span><small>${e.count}× · ${e.forms.length} forms</small></button>`).join('')}</div></section>`:''}<div class="meaning-list">${shown.map(rowRenderer).join('')||'<div class="empty">No words match this view.</div>'}</div>${sourceEntries.length>shown.length?`<button class="secondary full section" data-action="meaning-more">Show more · ${sourceEntries.length-shown.length} remaining</button>`:''}`;
  return `<button id="meanings-to-top" class="meanings-to-top" data-action="meanings-top" aria-label="Back to top" title="Back to top">↑</button><div class="between"><div><p class="tiny muted" style="margin:0">Quran vocabulary</p><h1 class="title">Meanings</h1></div><span class="meaning-build-pill ${complete?'complete':''}">${complete?'Quran indexed':`Indexing ${progress}/114`}</span></div><p class="subtitle">Learn the main Quranic word families instead of memorizing every small variation separately.</p><div class="meaning-metrics section"><div class="meaning-metric primary"><span>${complete?'Quran coverage':'Indexed coverage'}</span><strong>${coverage.coveragePct.toFixed(1)}%</strong><small>${coverage.knownOccurrences.toLocaleString()} of ${coverage.totalOccurrences.toLocaleString()} occurrences covered by known families</small></div><div class="meaning-metric"><span>Core words known</span><strong>${coverage.knownFamilies.length.toLocaleString()}</strong><small>${coverage.uniquePct.toFixed(1)}% of ${coverage.coreTotal.toLocaleString()} core families</small></div></div>${!complete?`<div class="meaning-index-progress"><i style="width:${Math.round(progress/114*100)}%"></i><span>${progress?'You can use the bank while the remaining Surahs index in the background.':'Building the Quran word bank…'}</span></div>`:''}${meaningBank.cacheSaved===false?'<div class="notice section">The word index works in this session, but this browser could not cache the full index locally.</div>':''}<div class="meaning-tabs section"><button data-action="meaning-tab" data-tab="all" class="${state.meanings.tab==='all'?'active':''}">Word Bank</button><button data-action="meaning-tab" data-tab="known" class="${state.meanings.tab==='known'?'active':''}">My Words · ${coverage.knownFamilies.length}</button><button data-action="meaning-tab" data-tab="quiz" class="${state.meanings.tab==='quiz'?'active':''}">Test Me</button></div>${content}`;
}

function bindSheet(){
  const sheet=document.querySelector('.modal-backdrop');if(!sheet)return;
  sheet.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(action==='close-add'&&!e.target.closest('[data-sheet]'))sheet.remove()});
  sheet.querySelectorAll('[data-action="close-add"]').forEach(b=>b.addEventListener('click',()=>sheet.remove()));
  const juzDetails=sheet.querySelector('#add-juz-details');if(juzDetails)juzDetails.addEventListener('toggle',()=>{addJuzOpen=juzDetails.open});
  const input=sheet.querySelector('#add-search');
  const applyAddSearch=({scroll=false}={})=>{
    addSearch=input?.value||'';
    const q=addSearch.trim().toLowerCase();
    let shown=0,firstMatch=null;
    sheet.querySelectorAll('[data-add-surah-row]').forEach(row=>{
      const visible=row.textContent.toLowerCase().includes(q);
      row.hidden=!visible;
      if(visible){shown++;if(!firstMatch)firstMatch=row}
    });
    const empty=sheet.querySelector('#add-search-empty');if(empty)empty.hidden=shown>0;
    if(scroll){const target=firstMatch||empty||sheet.querySelector('#add-surah-results');target?.scrollIntoView({behavior:'smooth',block:'nearest'});input?.focus()}
  };
  input?.addEventListener('input',()=>applyAddSearch());
  const searchForm=sheet.querySelector('#add-search-form');searchForm?.addEventListener('submit',e=>{e.preventDefault();applyAddSearch({scroll:true})});
  sheet.querySelectorAll('[data-action="toggle-surah-collection"]').forEach(input=>input.addEventListener('change',()=>{const id=Number(input.dataset.id);if(input.checked){if(!state.collection.includes(id))state.collection.push(id);rev(id)}else{state.collection=state.collection.filter(x=>Number(x)!==id)}state.collection.sort((a,b)=>a-b);persist();sheet.outerHTML=addSheet();bindSheet();render()}));
  sheet.querySelectorAll('[data-action="toggle-juz-collection"]').forEach(input=>input.addEventListener('change',()=>{const juz=Number(input.dataset.juz),ids=surahsStartingInJuz(juz);if(!input.checked){const removing=ids.filter(id=>state.collection.includes(Number(id))).length;if(removing&&!confirm(`Remove the ${removing} active Surah${removing===1?'':'s'} grouped under Juz ${juz} from your revision collection?\n\nSaved ratings, notes, red ayahs, and history will be kept.`)){input.checked=true;return}}if(input.checked){ids.forEach(id=>{if(!state.collection.includes(id))state.collection.push(id);rev(id)})}else{state.collection=state.collection.filter(id=>!ids.includes(Number(id)))}state.collection=[...new Set(state.collection)].sort((a,b)=>a-b);persist();sheet.outerHTML=addSheet();bindSheet();render()}));
}


ensureCatalog();render();if(state.mode==='listen')ensureReciters();if(state.mode==='practice'&&state.screen==='meanings')ensureMeaningBank();
