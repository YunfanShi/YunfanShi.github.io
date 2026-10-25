import {createRoot} from 'react-dom/client';
import SyncStatusIndicator from '../../src/components/layout/sync-status-indicator';

createRoot(document.getElementById('root')!).render(<SyncStatusIndicator signedIn/>);
window.addEventListener('jackyun-sync-retry',()=>{
  const output=document.getElementById('retry-count');
  if(output)output.textContent=String(Number(output.textContent||'0')+1);
});
