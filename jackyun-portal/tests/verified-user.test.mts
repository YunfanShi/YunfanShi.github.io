import test from 'node:test';
import assert from 'node:assert/strict';
import {getVerifiedUser} from '../src/lib/supabase/verified-user.ts';
const claims={sub:'11111111-1111-4111-8111-111111111111',role:'authenticated',exp:Date.now()/1000+3600,email:'test@example.com'};
function client(value:unknown,error:unknown=null){return {auth:{getClaims:async()=>({data:value?{claims:value}:null,error}),getUser:async()=>{throw Error('Remote auth must not run');},getSession:async()=>{throw Error('Unsigned session must not be trusted');}}} as unknown as Parameters<typeof getVerifiedUser>[0];}
test('valid signed claims supply identity without remote getUser or unsigned session fallback',async()=>{const r=await getVerifiedUser(client(claims));assert.equal(r.data.user?.id,claims.sub);assert.equal(r.error,null);});
test('expired or privileged claims cannot become an ordinary identity',async()=>{for(const c of [{...claims,exp:0},{...claims,role:'service_role'},{...claims,sub:''}]){const r=await getVerifiedUser(client(c));assert.equal(r.data.user,null);assert.equal(r.error?.status,401);}});
test('signature failures and missing sessions never fall back to unverified cached identity',async()=>{for(const c of [client(null),client(claims,{name:'AuthInvalidJwtError',status:401})])assert.equal((await getVerifiedUser(c)).data.user,null);});
