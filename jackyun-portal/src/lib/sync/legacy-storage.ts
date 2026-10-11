/** Report local edits only. No tokens, network calls, retry loop or cloud writes. */
export const legacyStorageBridge = `<script>
(function(){
  if(window.parent===window)return;
  var set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
  function notify(key){try{window.parent.postMessage({type:'jackyun-storage-edit',key:String(key)},window.parent.location.origin);}catch{}}
  Storage.prototype.setItem=function(key,value){var before=this.getItem(key);set.call(this,key,value);if(this===localStorage&&before!==String(value))notify(key);};
  Storage.prototype.removeItem=function(key){var before=this.getItem(key);remove.call(this,key);if(this===localStorage&&before!==null)notify(key);};
})();
</script>`;
