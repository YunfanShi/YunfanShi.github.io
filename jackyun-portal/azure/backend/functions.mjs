import { app } from '@azure/functions';
import { createAuthenticator } from './auth.mjs';
import { createDatabase } from './database.mjs';
import { createSyncApi } from './sync-api.mjs';
import { createFunctionHandler, registerFunctions } from './functions-adapter.mjs';

const database = createDatabase({ host: process.env.PGHOST, database: process.env.PGDATABASE,
  user: process.env.PGUSER, password: process.env.PGPASSWORD, caPath: process.env.PGSSLROOTCERT });
const authenticate = createAuthenticator({ supabaseUrl: process.env.SUPABASE_URL,
  publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY });
registerFunctions(app, createFunctionHandler({ authenticate, handle: createSyncApi(database) }));
