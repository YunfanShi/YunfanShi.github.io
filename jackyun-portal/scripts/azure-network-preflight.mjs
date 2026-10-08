// PostgreSQL SSL negotiation only: no password, login or SQL is sent.
import net from 'node:net';
import tls from 'node:tls';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { atStage,safeDiagnostic } from './lib/azure-cutover-diagnostics.mjs';

export function verifyPostgresTLS(host,ca,timeoutMs=10_000) {
  return new Promise((resolve,reject)=>{
    let secure;let settled=false;
    const socket=net.createConnection({host,port:5432});
    const finish=error=>{
      if(settled)return;settled=true;clearTimeout(deadline);
      secure?.destroy();socket.destroy();
      if(error)reject(error);else resolve();
    };
    const deadline=setTimeout(()=>finish(Object.assign(Error('Connection timeout'),{code:'ETIMEDOUT'})),timeoutMs);
    socket.once('error',finish);
    socket.once('connect',()=>{
      const request=Buffer.alloc(8);request.writeInt32BE(8,0);request.writeInt32BE(80877103,4);
      socket.write(request);
    });
    socket.once('data',data=>{
      if(data.length!==1||data[0]!==83)return finish(Object.assign(Error('TLS unavailable'),{code:'DATABASE_TLS_UNAVAILABLE'}));
      secure=tls.connect({socket,servername:host,ca,rejectUnauthorized:true});
      secure.once('error',finish);
      secure.once('secureConnect',()=>finish());
    });
    socket.once('close',()=>{if(!settled)finish(Object.assign(Error('Connection closed'),{code:'ECONNRESET'}));});
  });
}

export async function main(env=process.env) {
  for(const [name,host,certificate,stage] of [
    ['Supabase','aws-1-ap-northeast-1.pooler.supabase.com',env.SOURCEPGSSLROOTCERT,'source_connect'],
    ['Azure','jackyunasia.postgres.database.azure.com',env.TARGETPGSSLROOTCERT,'target_connect'],
  ]){
    console.log(`检查 ${name} 网络和 TLS（无需密码）…`);
    await atStage(stage,()=>verifyPostgresTLS(host,readFileSync(certificate,'utf8')));
    console.log(`${name} 网络和 TLS 验证通过。`);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{console.error(JSON.stringify(safeDiagnostic(error)));process.exitCode=1;});
}
