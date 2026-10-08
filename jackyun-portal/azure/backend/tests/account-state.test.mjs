import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAccountStateVerifier } from '../account-state.mjs';
import { createAuthenticator } from '../auth.mjs';
import { generateKeyPair,exportJWK,createLocalJWKSet,SignJWT } from 'jose';

const identity = { sub:randomUUID(),session_id:randomUUID(),role:'authenticated' };
const project = 'https://testproject.supabase.co';
const active = { id:identity.sub,account_status:'active',deleted_at:null };
const verifier = fetchImpl => createAccountStateVerifier({ supabaseUrl:project,publishableKey:'public-key',fetchImpl });
test('current account state uses verified identity and user token, without cross-user caching',async () => {
  const requests = [];
  const verify = verifier(async (url,options) => { requests.push({url,options}); return Response.json([active]); });
  await verify(identity,'first-token'); await verify(identity,'second-token');
  assert.equal(requests.length,2);
  assert.equal(requests[0].url.searchParams.get('id'),`eq.${identity.sub}`);
  assert.equal(requests[0].options.headers.Authorization,'Bearer first-token');
  assert.equal(requests[1].options.headers.Authorization,'Bearer second-token');
  assert.equal(requests[0].options.cache,'no-store');
  assert.equal(requests[0].options.redirect,'error');
});
test('missing, suspended, deleted or mismatched authoritative profile denies access',async () => {
  for (const rows of [[],[{...active,account_status:'suspended'}],[{...active,deleted_at:new Date().toISOString()}],[{...active,id:randomUUID()}]]) {
    await assert.rejects(verifier(async () => Response.json(rows))(identity,'token'),{status:403});
  }
});
test('unavailable or malformed authority fails closed with no private diagnostics',async () => {
  for (const response of [new Response('private diagnostic',{status:429}),new Response('not json'),Response.json({}),Response.json([active,active]),new Response('x'.repeat(4097))]) {
    await assert.rejects(verifier(async () => response)(identity,'token'),{status:503,code:'ACCOUNT_STATE_UNAVAILABLE'});
  }
  await assert.rejects(verifier(async () => {throw Error('private password');})(identity,'token'),{status:503});
  await assert.rejects(createAccountStateVerifier({supabaseUrl:project})(identity,'token'),{status:503});
});
test('signature is verified before authority; signed tokens still cannot bypass live suspension',async () => {
  const pair = await generateKeyPair('ES256');
  const key = {...await exportJWK(pair.publicKey),kid:'test',alg:'ES256'};
  let calls = 0;
  const verify = verifier(async () => {calls++;return Response.json([{...active,account_status:'suspended'}]);});
  const auth = createAuthenticator({supabaseUrl:project,keyResolver:createLocalJWKSet({keys:[key]}),verifyAccount:verify});
  await assert.rejects(auth('Bearer bad.signature'),{status:401}); assert.equal(calls,0);
  const token = await new SignJWT(identity).setProtectedHeader({alg:'ES256',kid:'test'})
    .setIssuer(`${project}/auth/v1`).setAudience('authenticated').setIssuedAt().setExpirationTime('5m').sign(pair.privateKey);
  await assert.rejects(auth(`Bearer ${token}`),{status:403}); assert.equal(calls,1);
});
