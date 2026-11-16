import {NextResponse} from 'next/server';
import {session} from '@/lib/server/db';
import {failure} from '@/lib/server/http';
import {projectFilterOptions} from '@/lib/server/project-search';
export const runtime='nodejs';
export async function GET(){try{const {db}=await session(false);return NextResponse.json(await projectFilterOptions(db),{headers:{'Cache-Control':'private, no-store'}})}catch(error){return failure(error)}}
