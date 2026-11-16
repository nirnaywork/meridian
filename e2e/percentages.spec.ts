import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {signIn} from './session';
import {getBestRoleMatch,bestRoleCopy} from '../src/lib/matching/roleMatch';
const f=JSON.parse(readFileSync('.cache/change5-qa.json','utf8'));
test('Re:Search, another demo and a future project share role percentages and best-role copy',async({page})=>{
 await signIn(page,f.member);
 for(const id of ['d0000000-0000-4000-8000-000000000015','d0000000-0000-4000-8000-000000000001',f.pid]){
  await page.goto('/projects/'+id);const data=await(await page.request.get('/api/data/project?id='+id)).json();expect(JSON.stringify(data)).not.toMatch(/cosine|similarity/i);const best=getBestRoleMatch(data.roles)!;expect(best).toBeTruthy();
  const copy=bestRoleCopy(best.matchPercent);await expect(page.locator('.best-role-match')).toHaveText(copy.before+best.title+copy.after);
  await expect(page.locator('.role-detail .role-match-badge')).toHaveCount(data.roles.length);await expect(page.locator('main')).not.toContainText(/cosine|embedding similarity|similarity score/i);
 }
});
test('Explore is neutral, role apply UI and application snapshots show percentages, panel retains raw parity',async({page})=>{
 await signIn(page,f.member);await page.goto('/projects');await page.getByLabel('search',{exact:true}).fill('Fresh percentage project '+f.run);await expect(page.locator('.best-role-match').first()).toContainText('Best fit:');await expect(page.getByLabel('Sort',{exact:true})).toHaveValue('newest');
 const listed=await(await page.request.get('/api/data/projects?sort=newest&status=all')).json();for(let i=1;i<listed.length;i++)expect(new Date(listed[i-1].created_at).getTime()).toBeGreaterThanOrEqual(new Date(listed[i].created_at).getTime());
 await page.goto('/projects/'+f.pid);await page.getByLabel('Choose your role').selectOption(f.best.roleId);const detail=await(await page.request.get('/api/data/project?id='+f.pid)).json();const value=detail.roles.find((r:any)=>r.id===f.best.roleId).match.matchPercent;await expect(page.locator('.apply-panel .role-match-badge')).toHaveText(value+'% match');
 await page.getByRole('button',{name:'Under the Hood',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Under the Hood',exact:true});await dialog.getByRole('tab',{name:'Similarity',exact:true}).click();await dialog.getByLabel('Compare against',{exact:true}).selectOption(f.best.roleId);await expect(dialog.getByRole('heading',{name:'How the percentage is calculated',exact:true})).toBeVisible();await expect(dialog.locator('.percentage-explainer')).toContainText(value+'% match');await expect(dialog.locator('.percentage-explainer')).toContainText('Raw cosine:');
 await dialog.getByText('Technical details: current role comparison table',{exact:true}).click();const row=dialog.locator(`[data-role-id="${f.best.roleId}"]`);await expect(row).toContainText(value+'% match');
 await page.goto('/applications');const app=await(await page.request.get('/api/data/applications')).json();const saved=app.find((a:any)=>a.id===f.applicationId);await expect(page.locator('.record-card').filter({hasText:'Fresh percentage project '+f.run}).locator('.role-match-badge')).toHaveText(saved.matchPercent+'% match');
});
test('owner pages show no personal percentage and owner explanation keeps applicant vectors private',async({page})=>{
 await signIn(page,f.lead);await page.goto('/projects/'+f.pid);await expect(page.locator('.best-role-match')).toHaveCount(0);await expect(page.locator('.role-detail .role-match-badge')).toHaveCount(0);await page.getByRole('combobox',{name:'Role',exact:true}).selectOption(f.best.roleId);await expect(page.locator('.lead-workspace .role-match-badge').first()).toContainText('% match');
 const response=await(await page.request.get(`/api/projects/${f.pid}/similarity?role=${f.best.roleId}`)).json();expect(response.mode).toBe('owner');expect(response).not.toHaveProperty('profile');expect(response).not.toHaveProperty('target');expect(response.applicants[0].cosine).toEqual(expect.any(Number));
});
