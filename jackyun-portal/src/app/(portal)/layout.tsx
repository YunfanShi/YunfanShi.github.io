import { Suspense } from 'react';
import SessionRecovery from '@/components/auth/session-recovery';
import PagePreferences from '@/components/layout/page-preferences';
import Sidebar from '@/components/layout/sidebar';
import Topbar from '@/components/layout/topbar';
import MobileViewport from '@/components/layout/mobile-viewport';
import LegacyBridge from '@/components/modules/legacy-bridge';
import KeyboardShortcuts from '@/components/layout/keyboard-shortcuts';
import DeferredAiChat from '@/components/modules/deferred-ai-chat';
import MiniPlayer from '@/components/modules/mini-player';
import FlyingTimer from '@/components/modules/floating-timer';
import SiteNotificationModal from '@/components/modules/site-notification-modal';
import LanguageProvider from '@/components/language-provider';
import { createClient } from '@/lib/supabase/server';
import type { SidebarPreferences } from '@/actions/settings';
import type { Language } from '@/lib/i18n';
import { coerceNavigationPreferences, DEFAULT_NAVIGATION_PREFERENCES } from '@/lib/companion';
import CloudSettingsHydrator from '@/components/layout/cloud-settings-hydrator';
import WorkspaceIdle from '@/components/layout/workspace-idle';
import LocalWorkspaceSync from '@/components/layout/local-workspace-sync';
import OfflineWorkspaceSync from '@/components/layout/offline-workspace-sync';
import AuthModeProvider from '@/components/auth/auth-mode-provider';
import BetaExperience from '@/components/modules/beta-experience';
import type { BetaEnrollmentStatus } from '@/lib/beta';
import { isAdminIdentity } from '@/lib/admin-auth';
import BrowserAiBridge from '@/components/modules/browser-ai-bridge';
import ServerFailureNotice from '@/components/layout/server-failure-notice';
import { getFeatureAccessSnapshot } from '@/actions/reader';

const DEFAULT_SIDEBAR_PREFS: SidebarPreferences = DEFAULT_NAVIGATION_PREFERENCES;
type Claims={sub:string;email?:string;user_metadata?:Record<string,unknown>};
type Profile={role?:string|null;display_name?:string|null;avatar_url?:string|null}|null;
type SettingsRow={key:string;value:unknown;updated_at:string|null};
type UsageRow={activity_date:string;nav_item_id:string;opens:number|null};
type BetaRow={status:BetaEnrollmentStatus}|null;
type FeatureSnapshot=Awaited<ReturnType<typeof getFeatureAccessSnapshot>>|null;
type ShellProps={claims:Claims|null;claimsError:boolean;children:React.ReactNode;settings?:SettingsRow[]|null;navigationUsage?:UsageRow[]|null;profile?:Profile;betaEnrollment?:BetaRow;featureSnapshot?:FeatureSnapshot};

function PortalShell({claims,claimsError,children,settings=null,navigationUsage=null,profile=null,betaEnrollment=null,featureSnapshot=null}:ShellProps){
  let sidebarPrefs={...DEFAULT_SIDEBAR_PREFS};
  let language:Language='zh';
  let appearancePreferences:Record<string,unknown>={};
  let appearanceUpdatedAt:string|null=null;
  let pagePreferences:Record<string,unknown>={};
  let learningPreferences:Record<string,unknown>={};
  let learningUpdatedAt:string|null=null;
  let interfaceCustomization:Record<string,unknown>={};
  for(const setting of settings??[]){
    if(setting.key==='sidebar_preferences')sidebarPrefs=coerceNavigationPreferences(setting.value);
    else if(setting.key==='language_preference'){const value=setting.value as {language?:string}|null;language=value?.language==='en'?'en':'zh';}
    else if(setting.key==='appearance_preferences'){appearancePreferences=setting.value as Record<string,unknown>;appearanceUpdatedAt=setting.updated_at;}
    else if(setting.key==='page_preferences')pagePreferences=setting.value as Record<string,unknown>;
    else if(setting.key==='learning_preferences'){learningPreferences=setting.value as Record<string,unknown>;learningUpdatedAt=setting.updated_at;}
    else if(setting.key==='interface_customization')interfaceCustomization=setting.value as Record<string,unknown>;
  }
  const sevenDaysAgo=new Date();sevenDaysAgo.setDate(sevenDaysAgo.getDate()-6);
  const sevenDayKey=sevenDaysAgo.toISOString().slice(0,10),adaptiveScores:Record<string,number>={};
  for(const row of navigationUsage??[]){const opens=Number(row.opens||0);adaptiveScores[row.nav_item_id]=(adaptiveScores[row.nav_item_id]??0)+opens+(row.activity_date>=sevenDayKey?opens*3:0);}
  const user=claims?{id:claims.sub,email:claims.email,user_metadata:{...(claims.user_metadata??{}),...(profile?.display_name?{full_name:profile.display_name,user_name:profile.display_name}:{}),...(profile?.avatar_url?{avatar_url:profile.avatar_url}:{})}}:null;
  const isAdmin=Boolean(user&&isAdminIdentity(user,profile?.role));
  return <AuthModeProvider signedIn={Boolean(user)} userId={user?.id??null} isAdmin={isAdmin}>
    <LanguageProvider initialLanguage={language} signedIn={Boolean(user)}>
      <MobileViewport />
      <PagePreferences initialValue={pagePreferences} signedIn={Boolean(user)} />
      <CloudSettingsHydrator learning={learningPreferences} learningUpdatedAt={learningUpdatedAt} appearance={appearancePreferences} interfaceCustomization={interfaceCustomization} updatedAt={appearanceUpdatedAt} signedIn={Boolean(user)} />
      <LocalWorkspaceSync userId={user?.id??null} />
      <OfflineWorkspaceSync userId={user?.id??null} />
      <WorkspaceIdle userId={user?.id??null} />
      <div data-portal-shell className="isolate flex h-[100dvh] min-h-0 overflow-hidden bg-[var(--background)]">
        <Sidebar initialPrefs={sidebarPrefs} adaptiveScores={adaptiveScores} initialIsAdmin={isAdmin} betaActive={betaEnrollment?.status==='accepted'} allowedFeatureKeys={featureSnapshot&&Object.keys(featureSnapshot.features).length?Object.values(featureSnapshot.features).filter(feature=>feature.allowed).map(feature=>feature.key):['reading']} />
        <div data-portal-content className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar user={user} betaActive={betaEnrollment?.status==='accepted'} isAdmin={isAdmin} />
          <ServerFailureNotice /><SiteNotificationModal />
          {claimsError&&<SessionRecovery />}
          <main data-portal-main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-6 lg:p-8">{children}</main>
        </div>
        <LegacyBridge /><KeyboardShortcuts /><DeferredAiChat /><MiniPlayer /><FlyingTimer />
        <BetaExperience status={betaEnrollment?.status??null} /><BrowserAiBridge />
      </div>
    </LanguageProvider>
  </AuthModeProvider>;
}

async function CloudPortalShell({claims,claimsError,children}:{claims:Claims|null;claimsError:boolean;children:React.ReactNode}){
  if(!claims)return <PortalShell claims={null} claimsError={claimsError} settings={[]} navigationUsage={[]} profile={null} betaEnrollment={null} featureSnapshot={null}>{children}</PortalShell>;
  const supabase=await createClient(),thirtyDaysAgo=new Date();thirtyDaysAgo.setDate(thirtyDaysAgo.getDate()-29);
  const sevenDaysAgo=new Date();sevenDaysAgo.setDate(sevenDaysAgo.getDate()-6);
  const results=await Promise.allSettled([
    supabase.from('user_settings').select('key,value,updated_at').eq('user_id',claims.sub).in('key',['sidebar_preferences','language_preference','appearance_preferences','interface_customization','learning_preferences','page_preferences']),
    supabase.from('navigation_usage_daily').select('activity_date,nav_item_id,opens').eq('user_id',claims.sub).gte('activity_date',thirtyDaysAgo.toISOString().slice(0,10)),
    supabase.from('profiles').select('role,display_name,avatar_url').eq('id',claims.sub).maybeSingle(),
    supabase.from('beta_enrollments').select('status').eq('user_id',claims.sub).maybeSingle(),
    getFeatureAccessSnapshot(),
  ]);
  if(results.some(result=>result.status==='rejected'))console.error('[portal-layout] Optional cloud shell data failed; rendered local defaults');
  const settings=results[0].status==='fulfilled'?results[0].value.data as SettingsRow[]:[];
  const navigationUsage=results[1].status==='fulfilled'?results[1].value.data as UsageRow[]:[];
  const profile=results[2].status==='fulfilled'?results[2].value.data as Profile:null;
  const betaEnrollment=results[3].status==='fulfilled'?results[3].value.data as BetaRow:null;
  const featureSnapshot=results[4].status==='fulfilled'?results[4].value:null;
  return <PortalShell claims={claims} claimsError={claimsError} settings={settings} navigationUsage={navigationUsage} profile={profile} betaEnrollment={betaEnrollment} featureSnapshot={featureSnapshot}>{children}</PortalShell>;
}

export default async function PortalLayout({children}:{children:React.ReactNode}){
  const supabase=await createClient();
  const {data:claimsData,error}=await supabase.auth.getClaims().catch(cause=>{console.error('[portal-layout] Unable to read auth claims; continuing in local mode',cause);return {data:null,error:cause};});
  const claims=(claimsData?.claims??null) as Claims|null,claimsError=Boolean(error);
  return <Suspense fallback={<PortalShell claims={claims} claimsError={claimsError} settings={[]} navigationUsage={[]} profile={null} betaEnrollment={null} featureSnapshot={null}>{children}</PortalShell>}>
    <CloudPortalShell claims={claims} claimsError={claimsError}>{children}</CloudPortalShell>
  </Suspense>;
}
