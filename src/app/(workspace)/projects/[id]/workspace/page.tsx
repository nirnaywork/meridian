import {TeamWorkspace} from '@/components/workspace';
import {z} from 'zod';
// Like project detail, this page loads data through the guarded API. Every read
// and mutation rechecks membership; rendering a shell grants no data access.
export default async function Page({params}:{params:Promise<{id:string}>}){return <TeamWorkspace id={z.string().uuid().parse((await params).id)}/>;}
