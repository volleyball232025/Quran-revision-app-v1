export function stars(n=0){return '★'.repeat(n)+'☆'.repeat(Math.max(0,5-n))}
export function todayLabel(){return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date())}
export function shortToday(){return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(new Date())}
export function strengthScore(s){
  const total=Math.max(1,s.ayahCount||s.ayahs?.length||1);const red=(s.redAyahs||[]).length;const greenRatio=(total-red)/total;const rating=(s.rating||0)/5;
  if(!s.rating && !(s.logs||[]).length)return greenRatio*30;
  return greenRatio*70+rating*30;
}
export function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
