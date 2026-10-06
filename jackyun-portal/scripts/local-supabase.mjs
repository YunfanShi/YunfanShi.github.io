import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const project = 'jackyun-portal-test';
const apiUrl = 'http://127.0.0.1:54321';
const cli = join(root, 'node_modules/supabase/dist/supabase.js');
const docker = process.platform === 'win32' && existsSync('C:/Program Files/Docker/Docker/resources/bin/docker.exe')
  ? 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' : 'docker';

function run(file, args, options = {}) {
  const result = spawnSync(file, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${file} exited with ${result.status}.`);
  return result.stdout;
}

function supabase(args, options) {
  return run(process.execPath, [cli, ...args, '--workdir', root], options);
}

function assertConfig() {
  const config = readFileSync(join(root, 'supabase/config.toml'), 'utf8');
  if (!config.includes(`project_id = "${project}"`) || !config.includes('port = 54321')) {
    throw new Error('Local project ID or API port changed. Review the local environment configuration first.');
  }
}

function assertExistingEnv() {
  const envPath = join(root, '.env.local');
  const content = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const match = content.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"'#]+)/m);
  if (match && ![apiUrl, 'http://localhost:54321'].includes(match[1])) {
    throw new Error('Existing .env.local points to another database. Save/rename it before using the local test environment.');
  }
  const inheritedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (inheritedUrl && ![apiUrl, 'http://localhost:54321'].includes(inheritedUrl)) {
    throw new Error('The shell environment points to another database. Clear NEXT_PUBLIC_SUPABASE_URL before starting locally.');
  }
  return content;
}

function writeEnv() {
  let content = assertExistingEnv();
  const status = JSON.parse(supabase(['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  const url = status.API_URL ?? status.api?.url;
  const anon = status.ANON_KEY ?? status.auth?.anon_key ?? status.auth?.anonKey;
  const service = status.SERVICE_ROLE_KEY ?? status.auth?.service_role_key ?? status.auth?.serviceRoleKey;
  if (url !== apiUrl || !anon || !service) {
    throw new Error('CLI did not return the expected local URL and keys. No environment file was written.');
  }
  const values = {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: service,
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
  };
  const defaults = {
    AI_CONFIG_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    AUTHORIZED_EMAILS: 'developer@example.test',
    ADMIN_EMAILS: 'developer@example.test',
    COMPANION_V1_ENABLED: 'false',
  };
  for (const [key, value] of Object.entries({ ...values, ...defaults })) {
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    if (pattern.test(content)) {
      if (key in values) content = content.replace(pattern, `${key}=${value}`);
    } else {
      content = `${content.trimEnd()}\n${key}=${value}\n`;
    }
  }
  writeFileSync(join(root, '.env.local'), content.trimStart(), { mode: 0o600 });
  console.log('Local .env.local configured; credentials remain in the ignored file.');
  return values;
}

try {
  assertConfig();
  const action = process.argv[2];
  if (action === 'start' || action === 'dev') {
    assertExistingEnv();
    run(docker, ['info', '--format', '{{.ServerVersion}}']);
    supabase(['start']);
    const localValues = writeEnv();
    if (action === 'dev') run(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'dev'], { env: { ...process.env, ...localValues } });
  } else if (action === 'stop' || action === 'status') {
    supabase(action === 'stop' ? [action, '--project-id', project] : [action]);
  } else if (action === 'check' || action === 'test') {
    const sql = action === 'check'
      ? "SELECT current_database(), current_setting('server_version'); SELECT count(*) AS applied_migrations FROM supabase_migrations.schema_migrations; SELECT count(*) AS profiles FROM public.profiles;"
      : readFileSync(join(root, 'tests/backup-center.sql'), 'utf8');
    run(docker, ['exec', '-i', `supabase_db_${project}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: sql, stdio: ['pipe', 'inherit', 'inherit'] });
  } else {
    throw new Error('Usage: node scripts/local-supabase.mjs start|stop|status|check|test|dev');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
