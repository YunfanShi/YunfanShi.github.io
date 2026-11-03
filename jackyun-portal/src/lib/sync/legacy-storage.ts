/** Virtualizes legacy iframe localStorage against an IndexedDB-backed snapshot. */
export function legacyStorageBridge(snapshot:Record<string,string>):string {
  const serialized=JSON.stringify(snapshot).replace(/</g,'\\u003c');
  return `<script>
(function(){
  if(window.parent===window)return;
  var values=${serialized},get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem,clear=Storage.prototype.clear,key=Storage.prototype.key;
  var lengthDescriptor=Object.getOwnPropertyDescriptor(Storage.prototype,'length');
  function managed(key){return !/^sb-.+-auth-token(?:-code-verifier)?$/.test(String(key));}
  function notify(key,value){try{window.parent.postMessage({type:'jackyun-storage-edit',key:String(key),value:value===null?null:String(value)},window.parent.location.origin);}catch{}}
  Storage.prototype.getItem=function(key){key=String(key);if(this===localStorage&&managed(key)&&Object.prototype.hasOwnProperty.call(values,key))return values[key];return get.call(this,key);};
  Storage.prototype.setItem=function(key,value){key=String(key);value=String(value);if(this!==localStorage||!managed(key)){set.call(this,key,value);return;}var before=this.getItem(key);values[key]=value;if(before!==value)notify(key,value);};
  Storage.prototype.removeItem=function(key){key=String(key);if(this!==localStorage||!managed(key)){remove.call(this,key);return;}var before=this.getItem(key);delete values[key];if(before!==null)notify(key,null);};
  Storage.prototype.clear=function(){if(this!==localStorage){clear.call(this);return;}Object.keys(values).forEach(function(key){delete values[key];notify(key,null);});clear.call(this);};
  Storage.prototype.key=function(index){if(this!==localStorage)return key.call(this,index);var managedKeys=Object.keys(values),nativeKeys=[],length=lengthDescriptor&&lengthDescriptor.get?lengthDescriptor.get.call(localStorage):0;for(var i=0;i<length;i++){var nativeKey=key.call(localStorage,i);if(nativeKey&&!managed(nativeKey))nativeKeys.push(nativeKey);}return managedKeys.concat(nativeKeys)[index]||null;};
  if(lengthDescriptor&&lengthDescriptor.get)Object.defineProperty(Storage.prototype,'length',{...lengthDescriptor,get:function(){if(this!==localStorage)return lengthDescriptor.get.call(this);var count=Object.keys(values).length,nativeLength=lengthDescriptor.get.call(localStorage);for(var i=0;i<nativeLength;i++){var nativeKey=key.call(localStorage,i);if(nativeKey&&!managed(nativeKey))count++;}return count;}});
  window.addEventListener('storage',function(event){if(event.key&&managed(event.key)){if(event.newValue===null)delete values[event.key];else values[event.key]=event.newValue;}});
})();
</script>`;
}
