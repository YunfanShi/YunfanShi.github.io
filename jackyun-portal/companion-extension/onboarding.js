const complete = () => chrome.runtime.sendMessage({ type: 'ONBOARDING_COMPLETE' }).catch(() => {});

document.querySelector('#start').addEventListener('click', async () => {
  await complete();
  const tab = await chrome.tabs.getCurrent();
  if (tab?.id) chrome.tabs.remove(tab.id);
});

document.querySelector('#open-popup').addEventListener('click', async () => {
  await complete();
  await chrome.action.openPopup().catch(() => {});
});
