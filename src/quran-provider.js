const TEXT_API='https://api.alquran.cloud/v1';
const MP3QURAN='https://www.mp3quran.net/api/v3';
const UMMAH='https://ummahapi.com/api/quran';
const QURAN_COM='https://api.quran.com/api/v4';
const QURAN_CDN='https://static.qurancdn.com/fonts/quran/hafs/v2/woff2';

export const BISMILLAH='بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

export function hasBismillah(id){
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

export async function fetchSurahCatalog(){
  const r=await fetch(`${TEXT_API}/surah`);if(!r.ok)throw new Error('Unable to load Surah catalog');
  const j=await r.json();return j.data.map(s=>({id:s.number,name:s.englishName,englishMeaning:s.englishNameTranslation,arabic:s.name,ayahCount:s.numberOfAyahs}));
}

export async function fetchSurahVerses(id,{signal}={}){
  const r=await fetch(`${TEXT_API}/surah/${id}`,{signal});if(!r.ok)throw new Error('Unable to load Quran text');
  const j=await r.json();return j.data.ayahs.map(a=>({number:a.numberInSurah,page:Number(a.page)||null,text:Number(a.numberInSurah)===1&&hasBismillah(id)?stripBismillah(a.text):a.text}));
}


export async function fetchQcfMushafPage(page,{signal,tajweed=false}={}){
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

export async function fetchWordByWordSurah(id,{signal}={}){
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

export async function fetchAudioEditions(){
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

export async function fetchSurahAudio(id,reciter){
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
