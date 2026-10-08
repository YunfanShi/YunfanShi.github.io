export function backupFailureCategory(result) {
 const detail=String(result.stderr??'');
 if(/password authentication failed|no password supplied/i.test(detail))return 'DATABASE_PASSWORD_REJECTED';
 if(/server version.*pg_dump version|server version mismatch/i.test(detail))return 'BACKUP_CLIENT_VERSION_MISMATCH';
 if(/permission denied|must be owner|row-level security/i.test(detail))return 'DATABASE_PERMISSION_DENIED';
 if(/certificate|SSL error|root certificate/i.test(detail))return 'DATABASE_TLS_FAILED';
 if(result.error?.code==='ETIMEDOUT'||/timeout|timed out|canceling statement/i.test(detail))return 'DATABASE_BACKUP_TIMEOUT';
 if(/could not connect|connection.*failed|connection.*closed|could not translate host|connection refused/i.test(detail))return 'DATABASE_CONNECTION_FAILED';
 if(result.error?.code==='ENOENT')return 'BACKUP_CLIENT_MISSING';
 return 'DATABASE_BACKUP_FAILED';
}
export function privateBackupDetail(result,passwords) {
 let detail=String(result.stderr??result.error?.message??'').slice(0,100000);
 for(const password of passwords.filter(p=>typeof p==='string'&&p.length))detail=detail.replaceAll(password,'[redacted]');
 return {exitCode:result.status??null,signal:result.signal??null,detail};
}
