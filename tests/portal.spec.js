import {test,expect} from '@playwright/test';

test('home, responsive navigation and direct Avinash route',async({page})=>{
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toContainText('achievement');
  await page.getByRole('link',{name:'Avinash',exact:true}).click();
  await expect(page).toHaveURL(/\/Avinash$/);
  await expect(page.getByRole('heading',{name:'Avinash',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button',{name:'Sign in to admin'})).toBeVisible();
  await page.getByLabel('Admin email / username').fill('admin@example.test');
  await page.getByLabel('Password',{exact:true}).fill('NotARealPassword123');
  await page.getByRole('button',{name:'Sign in to admin'}).click();
  await expect(page.getByRole('alert')).toContainText('Live login is not connected');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Toggle menu'}).click();
  await page.locator('#main-navigation').getByRole('button',{name:'Home',exact:true}).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('student signup is explicit about verification and database setup',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Student Login'}).click();
  await page.getByRole('button',{name:'Create an account'}).click();
  await page.getByLabel('Full name').fill('Example Student');
  await page.getByLabel('Roll number / username').fill('S60001');
  await page.getByLabel('Password',{exact:true}).fill('NotARealPassword123');
  await expect(page.getByText('Your account requires admin verification.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Create student account'}).click();
  await expect(page.getByRole('alert')).toContainText('Live login is not connected');
});

test('demo MCQs submit manually with correct and wrong counts',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Try a Free Test'}).click();
  await page.getByRole('button',{name:'Start test'}).click();
  await page.locator('.answer-options button').nth(2).click();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.locator('.answer-options button').nth(1).click();
  await page.getByRole('button',{name:'Submit test',exact:true}).click();
  await page.getByRole('button',{name:'Submit my test'}).click();
  const stats=page.locator('.result-stats');
  await expect(stats).toContainText('1Correct');
  await expect(stats).toContainText('1Incorrect');
  await expect(stats).toContainText('3Unanswered');
});

test('timer auto-submits saved demo answers',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>sessionStorage.setItem('sure60-demo-demo-test',JSON.stringify({deadline:Date.now()+1800,answers:{'1':2}})));
  await page.getByRole('button',{name:'Try a Free Test'}).click();
  await page.getByRole('button',{name:'Start test'}).click();
  await expect(page.getByRole('dialog',{name:'Your effort. Your progress.'})).toBeVisible({timeout:10000});
  await expect(page.locator('.result-stats')).toContainText('1Correct');
  await expect(page.locator('.result-stats')).toContainText('4Unanswered');
});
