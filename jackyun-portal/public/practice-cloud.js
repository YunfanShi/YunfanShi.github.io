/* Network failures keep the local clock running. Only server fencing ends ownership. */
(function(root){
  class PracticeCloud {
    constructor(options){this.options=options;this.owner=crypto.randomUUID();this.token=null;this.revision=0;this.mode='loading';this.latest=null;this.chain=Promise.resolve();this.lastMinute='';this.offline=false;this.dirty=false;this.releasePending=false;}
    async request(body,statusOnly=false){const response=await fetch('/api/practice-timer/live'+(statusOnly?'?status=1':''),{method:body?'POST':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(8000)});let data;try{data=await response.json();}catch{throw Error('云端计时响应无效。');}if(response.status===401&&!this.token){this.mode='local';this.options.status('');return null;}if(!response.ok){const error=new Error(data.error||data.message||'云端暂不可用。');error.data=data;throw error;}return data;}
    async init(){clearInterval(this.timer);try{this.latest=await this.request();if(this.mode!=='local'){this.mode='cloud';this.options.status('');this.options.available(this.latest?.payload);}}catch{this.mode='unavailable';this.options.status('');}this.timer=setInterval(()=>void this.touch(),10000);}
    async claim(id){
      // Cloud discovery is optional; local work never waits for its initial request.
      this.localSessionId=id;
      if(this.mode!=='cloud'||root.navigator?.onLine===false){this.dirty=true;return null;}
      await this.chain.catch(()=>{});
      try {
        const data=await this.request({action:'claim',owner:this.owner,sessionId:id});
        if(!data)return null;
        this.token=data.token;this.revision=data.revision;this.lastMinute='';this.latest=data;this.offline=false;this.dirty=false;this.releasePending=false;this.options.status('');return data;
      } catch(error) {
        if(error.data?.conflict==='ACTIVE_SESSION'){
          // Preserve the remote draft; new local practice must remain usable.
          this.token=null;this.releasePending=false;this.dirty=true;
          this.latest={...this.latest,...error.data};this.options.available(this.latest?.payload);
          this.options.status('');return null;
        }
        if(error.data?.conflict)throw error;
        this.mode='unavailable';this.dirty=true;this.options.status('');return null;
      }
    }
    disconnected(){this.offline=true;this.dirty=true;this.options.status('');}
    failed(error,token){if(token!==this.token)return;if(error.data?.conflict==='LOST_CONTROL')this.lose('另一设备已接管，本设备已退出计时。');else this.disconnected();}
    persist(){if(!this.token)return Promise.resolve();const token=this.token;this.dirty=true;if(this.offline)return Promise.resolve();this.chain=this.chain.catch(()=>{}).then(async()=>{if(token!==this.token||this.offline)return;const payload=this.options.capture();if(!payload?.session)return;try{
      let data;try{data=await this.request({action:'save',owner:this.owner,token,revision:this.revision,payload});}catch(error){
        if(error.data?.conflict!=='STALE_REVISION')throw error;
        const live=await this.request();if(token!==this.token)return;if(live?.ownerId!==this.owner){if(live?.ownerId)this.lose('另一设备已接管，本设备已退出计时。');else this.disconnected();return;}
        this.revision=live.revision;data=await this.request({action:'save',owner:this.owner,token,revision:this.revision,payload:this.options.capture()});
      }
      if(token!==this.token)return;this.revision=data.revision;this.latest=data;this.offline=false;this.dirty=false;this.options.status('');if(this.releasePending)void this.release();
    }catch(error){this.failed(error,token);}});return this.chain;}
    minute(){if(!this.token)return;const payload=this.options.capture(),s=payload?.session;if(!s||s.finished)return;const q=s.questions[s.index];if(q.startedAt===null)return;const bucket=q.id+':'+Math.floor(q.elapsedMs/60000);if(!this.lastMinute)this.lastMinute=bucket;else if(bucket!==this.lastMinute){this.lastMinute=bucket;void this.persist();}}
    async touch(){
      if(!this.token){
        if(!this.localSessionId||this.mode==='local'||root.navigator?.onLine===false||this.touching)return;this.touching=true;
        try {
          const live=await this.request(undefined,true);
          if(live){this.mode='cloud';
            if(live.hasSession && this.latest?.revision!==live.revision){this.latest=await this.request();this.options.available(this.latest?.payload);}
            // Reconnection must never silently take over an existing cloud session.
            if(this.localSessionId && !live.ownerId && !live.hasSession){await this.claim(this.localSessionId);if(this.token)await this.persist();}
          }
        }catch{this.mode='unavailable';}finally{this.touching=false;}
        return;
      }
      if(this.touching)return;this.touching=true;const token=this.token;try{const data=await this.request({action:'touch',owner:this.owner,token});if(token!==this.token)return;if(data.ownerId!==this.owner){if(data.ownerId)this.lose('另一设备已接管，本设备已退出计时。');else this.disconnected();return;}if(this.offline||this.dirty||this.releasePending){this.offline=false;void this.persist();}}catch(error){this.failed(error,token);}finally{this.touching=false;}}
    lose(message){if(!this.token)return;this.token=null;this.options.lost(message);this.options.status(message);}
    async release(){this.localSessionId=null;const token=this.token;await this.chain.catch(()=>{});if(!token||token!==this.token)return;if(this.offline||this.dirty){this.releasePending=true;return;}try{await this.request({action:'release',owner:this.owner,token});if(token===this.token){this.token=null;this.releasePending=false;}}catch(error){this.releasePending=true;this.failed(error,token);} }
  }
  root.PracticeCloud=PracticeCloud;
})(globalThis);
