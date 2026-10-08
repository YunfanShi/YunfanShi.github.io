import assert from 'node:assert/strict';
import test from 'node:test';
import { loginDiagnostic, LOGIN_HINTS } from '../scripts/lib/azure-login-diagnostics.mjs';
test('login diagnostics distinguish provider failures without echoing sensitive messages',()=>{
  const cases=[['invalid_credentials',400,'REAL_LOGIN_INVALID_CREDENTIALS'],['email_not_confirmed',400,'REAL_LOGIN_EMAIL_UNCONFIRMED'],
    ['over_request_rate_limit',429,'REAL_LOGIN_RATE_LIMITED'],[null,503,'REAL_LOGIN_NETWORK_FAILED'],[null,401,'REAL_LOGIN_REJECTED']];
  for(const [code,status,expected] of cases){
    const result=loginDiagnostic({code,status,message:'private@example.test password=secret token=private'});
    assert.equal(result,expected);assert.doesNotMatch(result+LOGIN_HINTS[result],/private|secret|password=/);
  }
  assert.equal(loginDiagnostic({name:'AuthRetryableFetchError'}),'REAL_LOGIN_NETWORK_FAILED');
  assert.equal(loginDiagnostic(undefined),'REAL_LOGIN_REJECTED');
});
