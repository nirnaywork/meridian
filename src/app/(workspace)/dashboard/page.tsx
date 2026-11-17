import {PersonalDashboard} from '@/components/personal-dashboard';
import {session} from '@/lib/server/db';
import {redirect} from 'next/navigation';
export default async function DashboardPage(){
 const {profile}=await session(false);
 if(!profile?.onboarding_complete)redirect('/onboarding');
 return <PersonalDashboard name={profile.display_name}/>;
}
