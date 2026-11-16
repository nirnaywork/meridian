import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {signIn} from './session';
const f=JSON.parse(readFileSync('.cache/panel-qa.json','utf8'));
test('new empty-domain saves are rejected by the active server after the rollout pause is lifted',async({page})=>{
 await signIn(page,f.member);const origin=new URL(page.url()).origin;
 const response=await page.request.post('/api/data/profile',{headers:{Origin:origin},data:{display_name:'Invalid domain test',headline:'Student',domains:[],revision:0,is_member:true,is_team_lead:false,skills:[{name:'React',proficiency:'advanced'}]}});
 expect(response.status()).toBe(400);expect((await response.json()).message).toContain('domain');
});
test('null current cosine displays migration state instead of zero',async({page})=>{
 await signIn(page,f.member);
 await page.route('**/api/data/project?id='+f.pid,async route=>{const response=await route.fetch();const data=await response.json();data.roles=data.roles.map((r:any)=>({...r,match:{...r.match,matchPercent:null,state:'updating'}}));await route.fulfill({response,json:data})});
 await page.goto('/projects/'+f.pid);await expect(page.getByText('Match is being updated',{exact:true}).first()).toBeVisible();await expect(page.locator('.role-match-badge')).toHaveCount(0);
});
test('panel distinguishes stored and live models and offers an owner regeneration control',async({page})=>{
 await signIn(page,f.member);
 await page.route('**/api/embeddings/me',async route=>{const response=await route.fetch();const data=await response.json();data.embedding.model='hashed';data.embedding.version='legacy';await route.fulfill({response,json:data})});
 await page.route('**/api/health/embedding',route=>route.fulfill({json:{provider:'minilm',version:'domains-minilm-751bff37-q8-v3',selectionReason:'loaded'}}));
 await page.goto('/profile');await page.getByRole('button',{name:'Under the Hood',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Under the Hood',exact:true});
 await expect(dialog.getByText('This vector: Hashed TF-IDF (keyword fallback)',{exact:true})).toBeVisible();await expect(dialog.getByText(/This vector was made with hashed/)).toBeVisible();await expect(dialog.getByRole('button',{name:'Regenerate embedding',exact:true})).toBeVisible();await expect(dialog.getByText(/Model that produced this vector:/)).toBeVisible();
});
