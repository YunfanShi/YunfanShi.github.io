import { forwardAzureSync } from '@/lib/sync/azure-proxy';
import { NextRequest } from 'next/server';
const forward=async(request:NextRequest)=>await forwardAzureSync(request)??Response.json({ok:true,syncProtocol:3,capabilities:{v4:false}});
export async function GET(request: NextRequest) { return forward(request); }
export async function POST(request: NextRequest) { return forward(request); }
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
