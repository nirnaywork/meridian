import {NextResponse} from 'next/server';
import {session} from '@/lib/server/db';
import {failure} from '@/lib/server/http';
import {projectSearchPage} from '@/lib/server/project-search';
export const runtime='nodejs';
export async function GET(request:Request){try{const {db,user}=await session(false);return NextResponse.json(await projectSearchPage(db,user.id,request.url),{headers:{'Cache-Control':'private, no-store'}})}catch(error){return failure(error)}}
