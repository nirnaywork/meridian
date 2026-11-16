import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {signIn} from './session';
const who=JSON.parse(readFileSync('.cache/change5-qa.json','utf8')).member;
test('filters use server options, persist in the URL, reset dependent domains and clear to defaults',async({page})=>{
 await signIn(page,who);await page.goto('/projects?search=Re%3ASearch&sort=oldest&status=all');
 await expect(page.getByLabel('search',{exact:true})).toHaveValue('Re:Search');await expect(page.getByLabel('Sort',{exact:true})).toHaveValue('oldest');await expect(page.locator('.project-card')).toHaveCount(1);
 await page.reload();await expect(page.getByLabel('search',{exact:true})).toHaveValue('Re:Search');await expect(page.locator('.project-card')).toHaveCount(1);
 const options=await(await page.request.get('/api/filters/options')).json();await expect(page.getByLabel('Field',{exact:true}).locator('option')).toHaveText(options.fields.map((o:any)=>o.label));
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();await expect(page.getByLabel('Status',{exact:true})).toHaveValue('open');await expect(page.getByLabel('Sort',{exact:true})).toHaveValue('newest');await expect(page).toHaveURL(/\/projects$/);
 await page.getByLabel('Field',{exact:true}).selectOption('CS Related');await page.getByLabel('Domain',{exact:true}).selectOption('Web Development');await expect(page).toHaveURL(/domain=Web\+Development/);
 const other=options.fields.find((o:any)=>o.value&&o.value!=='CS Related').value;await page.getByLabel('Field',{exact:true}).selectOption(other);await expect(page.getByLabel('Domain',{exact:true})).toHaveValue('');await expect(page.getByLabel('Domain',{exact:true}).locator('option')).toHaveText(options.domainsByField[other].map((o:any)=>o.label));expect(new URL(page.url()).searchParams.has('domain')).toBe(false);
 await page.goBack();await expect(page.getByLabel('Field',{exact:true})).toHaveValue('CS Related');await expect(page.getByLabel('Domain',{exact:true})).toHaveValue('Web Development');
});
test('text is debounced and empty/error states preserve a usable filter bar',async({page})=>{
 await signIn(page,who);await page.goto('/projects');await expect(page.locator('.project-card').first()).toBeVisible();const requests:string[]=[];page.on('request',r=>{if(new URL(r.url()).pathname==='/api/projects')requests.push(r.url())});
 await page.getByLabel('search',{exact:true}).fill('R');await page.getByLabel('search',{exact:true}).fill('Re');await page.getByLabel('search',{exact:true}).fill('Re:Search');
 await expect.poll(()=>requests.filter(url=>new URL(url).searchParams.get('search')==='Re:Search').length).toBe(1);expect(requests.some(url=>['R','Re'].includes(new URL(url).searchParams.get('search')??''))).toBe(false);await expect(page.locator('.project-card')).toHaveCount(1);
 await page.getByLabel('search',{exact:true}).fill('no-project-has-this-unique-filter-12345');await expect(page.getByRole('heading',{name:'No projects match your filters',exact:true})).toBeVisible();
 await page.route('**/api/projects?**',route=>route.fulfill({status:500,json:{message:'Temporary project test error'}}));await page.getByLabel('search',{exact:true}).fill('error');await expect(page.getByText('Temporary project test error',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Clear filters',exact:true})).toBeEnabled();
});
test('pagination updates page URL and returns a different stable slice',async({page})=>{
 await signIn(page,who);await page.goto('/projects?status=all&limit=2');await expect(page.locator('.project-card')).toHaveCount(2);const before=await page.locator('.project-card h2').allTextContents();
 await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page).toHaveURL(/page=2/);await expect(page.locator('.project-card')).toHaveCount(2);await expect.poll(()=>page.locator('.project-card h2').allTextContents()).not.toEqual(before);
 await page.reload();await expect(page).toHaveURL(/page=2/);await expect(page.locator('.project-card')).toHaveCount(2);await page.getByRole('button',{name:'Previous',exact:true}).click();await expect.poll(()=>page.locator('.project-card h2').allTextContents()).toEqual(before);
});
