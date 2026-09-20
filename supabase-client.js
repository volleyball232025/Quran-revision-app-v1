(function(){
  const SUPABASE_URL='https://xdgwuwomjhfvwwusclpe.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_aCKxt0GoRvu-MXqCRng3nw_YftC2-Y6';
  const APP_URL='https://quran-revision.pages.dev';
  const api={available:false,client:null,appUrl:APP_URL};
  try{
    if(!window.supabase?.createClient)throw new Error('Supabase library unavailable');
    const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });
    api.available=true;api.client=client;
    api.getSession=()=>client.auth.getSession();
    api.onAuthStateChange=(fn)=>client.auth.onAuthStateChange(fn);
    api.signInGoogle=()=>client.auth.signInWithOAuth({provider:'google',options:{redirectTo:APP_URL}});
    api.linkGoogle=()=>client.auth.linkIdentity({provider:'google',options:{redirectTo:APP_URL}});
    api.signInEmail=(email,password)=>client.auth.signInWithPassword({email,password});
    api.signUpEmail=(email,password,name)=>client.auth.signUp({email,password,options:{emailRedirectTo:APP_URL,data:{preferred_name:String(name||'').trim().slice(0,40)}}});
    api.sendPasswordReset=(email)=>client.auth.resetPasswordForEmail(email,{redirectTo:APP_URL});
    api.updatePassword=(password)=>client.auth.updateUser({password});
    api.updateMetadata=(data)=>client.auth.updateUser({data});
    api.signOut=()=>client.auth.signOut();
    api.getIdentities=()=>client.auth.getUserIdentities();
    api.loadState=async(userId)=>{
      const {data,error}=await client.from('quran_revision_state').select('state,updated_at').eq('user_id',userId).maybeSingle();
      if(error)throw error;return data||null;
    };
    api.saveState=async(userId,state)=>{
      const {error}=await client.from('quran_revision_state').upsert({user_id:userId,state},{onConflict:'user_id'});
      if(error)throw error;return true;
    };
  }catch(err){api.error=err?.message||String(err)}
  window.QuranCloud=api;
})();
