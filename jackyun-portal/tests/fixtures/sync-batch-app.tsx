import React from 'react';
import {createRoot} from 'react-dom/client';
import SyncCenterPanel from '../../src/components/settings/sync-center-panel';
declare global {interface Window{batchEvents:unknown[]}}
window.batchEvents=[];
window.addEventListener('jackyun-sync-resolve-batch',(event)=>window.batchEvents.push((event as CustomEvent).detail));
createRoot(document.getElementById('root')!).render(<SyncCenterPanel/>);
