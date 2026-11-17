import {PublicProfile} from '@/components/public-profile';
export default async function Page({params}:{params:Promise<{id:string}>}){return <PublicProfile id={(await params).id}/>;}
