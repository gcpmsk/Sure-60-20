import {test,expect} from '@playwright/test';

test('home, responsive navigation and direct Avinash route',async({page})=>{
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toContainText('In focus.');
  await expect(page.locator('body')).not.toContainText('Avinash');
  await expect(page.locator('a[href*="Avinash"]')).toHaveCount(0);
  await page.goto('/Avinash');
  await expect(page).toHaveURL(/\/Avinash$/);
  await expect(page.getByRole('heading',{name:'Administrator login',exact:true})).toBeVisible();
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

test('other routes and nested suffixes cannot open the admin screen',async({page})=>{
  for(const path of ['/admin','/avinash','/anything/Avinash']){
    await page.goto(path);
    await expect(page.getByRole('button',{name:'Sign in to admin'})).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Avinash');
  }
});


// Browser integration fixtures: exercise the real Supabase client against intercepted HTTP.
// These do not claim to test a deployed Auth/Storage service; SQL RLS is tested separately.
function textPdf(lines) {
  const stream='BT /F1 12 Tf 50 780 Td '+lines.map((line,i)=>(i?'0 -20 Td ':'')+`(${line.replace(/[\\()]/g,'\\$&')}) Tj`).join('\n')+' ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let pdf='%PDF-1.4\n';const offsets=[0];
  objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`});
  const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return {name:'questions.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdf)};
}
async function mockPortal(page,{role='admin',verified=true,session=true}={}) {
  const id='00000000-0000-4000-8000-000000000001',batchId='00000000-0000-4000-8000-000000000002';
  const user={id,email:'fixture@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
  const token=`e30.${Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.fixture`;
  const auth={access_token:token,refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};
  const state={profiles:[{id,username:'fixture',full_name:'Test User',role,verified}],batches:[{id:batchId,title:'SSC Foundation',category:'SSC'}],subjects:[],lessons:[],tests:[],enrollments:[],uploads:[],publishedTests:[],failUpload:false,failSave:false};
  await page.route('**/src/lib.js*',async route=>{
    const response=await route.fetch();
    const body=(await response.text()).replaceAll('import.meta.env.VITE_SUPABASE_URL','"https://fixture.supabase.co"').replaceAll('import.meta.env.VITE_SUPABASE_ANON_KEY','"fixture-public-key"');
    await route.fulfill({response,body});
  });
  if(session)await page.addInitScript(auth=>localStorage.setItem('sb-fixture-auth-token',JSON.stringify(auth)),auth);
  await page.route('https://fixture.supabase.co/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname;
    const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(req.method()==='OPTIONS')return reply({});
    if(path.includes('/auth/v1/token'))return reply(auth);
    if(path.includes('/auth/v1/logout'))return reply({});
    if(path.includes('/auth/v1/user'))return reply(user);
    if(path.includes('/storage/v1/object/')&&req.method()==='POST'){
      if(state.failUpload)return reply({message:'Storage denied',statusCode:403,error:'Forbidden'},403);
      state.uploads.push(path);return reply({Key:path,Id:'fixture-file'});
    }
    if(path.includes('/rpc/admin_create_subject')){
      const data=req.postDataJSON(),sid=crypto.randomUUID();
      state.subjects.push({id:sid,batch_id:data.p_batch,name:data.p_name,minimum_classes:data.p_classes,position:1});
      for(let n=1;n<=data.p_classes;n++)state.lessons.push({id:crypto.randomUUID(),batch_id:data.p_batch,subject_id:sid,subject:data.p_name,title:`Class ${n}`,position:n,video_url:'',pdf_path:'',pdf_url:'',duration:'',topic:'',published:false});
      return reply(sid);
    }
    if(path.includes('/rpc/admin_create_test')){state.publishedTests.push(req.postDataJSON());return reply('new-test')}
    const table=path.split('/').pop();
    if(table==='site_settings')return reply([{id:1,data:{admin_enabled:true}}]); // Legacy setting cannot restore footer access.
    if(!Array.isArray(state[table]))return reply({message:'Unexpected fixture request: '+path},400);
    if(req.method()==='GET'){
      let rows=state[table];
      for(const [key,value] of url.searchParams)if(value.startsWith('eq.'))rows=rows.filter(r=>String(r[key])===value.slice(3));
      return reply(rows);
    }
    if(req.method()==='POST'){
      if(table==='lessons'&&state.failSave)return reply({message:'Save denied'},403);
      const row=req.postDataJSON(),i=state[table].findIndex(r=>r.id===row.id);
      if(i>=0)state[table][i]=row;else state[table].push(row);return reply([row]);
    }
    return reply([]);
  });
  return state;
}

test('admin creates five classes, uploads notes and parses real question PDFs',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const state=await mockPortal(page);
  await page.goto('/Avinash');
  await expect(page.getByRole('heading',{name:'Make great learning happen.'})).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Avinash');
  await page.locator('.admin-nav').getByRole('button',{name:'Classes & notes',exact:true}).click();
  await page.getByRole('button',{name:'Add subject',exact:true}).click();
  await page.getByLabel('Subject name').fill('Maths');
  await page.getByRole('button',{name:'Save subject',exact:true}).click();
  await expect(page.getByRole('button',{name:'Edit class',exact:true})).toHaveCount(5);
  await page.getByRole('button',{name:'Edit class',exact:true}).first().click();
  await page.getByLabel('Class name',{exact:true}).fill('Introduction to Algebra');
  await page.getByLabel('YouTube video URL',{exact:true}).fill('https://youtu.be/abcdefghijk');
  const pdf=textPdf(['1. What is 2 + 2?','A) 2','B) 3','C) 4','D) 5']);
  await page.getByLabel('Upload class notes PDF (max 15 MB)',{exact:true}).setInputFiles(pdf);
  await page.getByLabel('Publish this class for enrolled students').check();
  state.failUpload=true;
  await page.getByRole('button',{name:'Save class',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('PDF upload failed');
  expect(state.lessons[0].published).toBe(false);
  state.failUpload=false;
  await page.getByRole('button',{name:'Save class',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.uploads).toHaveLength(1);expect(state.lessons[0].pdf_path).toContain(state.batches[0].id);expect(state.lessons[0].published).toBe(true);
  await page.getByRole('button',{name:'Tests & answers',exact:true}).click();
  await page.getByRole('button',{name:'Create test',exact:true}).click();
  await page.getByLabel('Test title',{exact:true}).fill('Algebra test');
  await page.getByLabel('Question PDF',{exact:true}).setInputFiles(pdf);
  await expect(page.getByLabel('Question text (editable)')).toContainText('What is 2 + 2?');
  await page.getByLabel('Answer key PDF',{exact:true}).setInputFiles(textPdf(['1. C']));
  await expect(page.getByLabel('Answer key text (editable)')).toContainText('1. C');
  await page.getByRole('button',{name:'Parse & review'}).click();
  await expect(page.getByLabel('Correct answer',{exact:true})).toHaveValue('2');
  await page.getByRole('button',{name:'Publish 1 questions'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.publishedTests[0].p_questions[0].options).toEqual(['2','3','4','5']);
  expect(errors).toEqual([]);
});

test('pending student login is rejected and approved student sees subject classes',async({page})=>{
  const state=await mockPortal(page,{role:'student',verified:false,session:false});
  await page.goto('/');
  await page.getByRole('button',{name:'Student Login'}).click();
  await page.getByLabel('Roll number / username').fill('fixture');
  await page.getByLabel('Password',{exact:true}).fill('NotARealPassword123');
  await page.getByRole('button',{name:'Sign in to learn'}).click();
  await expect(page.getByRole('alert')).toContainText('awaiting administrator verification');
  await expect(page.getByRole('button',{name:'My Batches'})).toHaveCount(0);
  state.profiles[0].verified=true;
  state.enrollments=[{student_id:state.profiles[0].id,batch_id:state.batches[0].id}];
  state.subjects=[{id:'maths',batch_id:state.batches[0].id,name:'Maths',position:1},{id:'english',batch_id:state.batches[0].id,name:'English',position:2}];
  state.lessons=[{id:'one',batch_id:state.batches[0].id,subject_id:'maths',title:'Algebra',published:true,position:1,video_url:'https://youtu.be/abcdefghijk'},{id:'two',batch_id:state.batches[0].id,subject_id:'english',title:'Grammar',published:true,position:1}];
  await page.getByRole('button',{name:'Sign in to learn'}).click();
  await expect(page.getByRole('heading',{name:'Keep going, Test.'})).toBeVisible();
  await page.getByRole('button',{name:'Maths (1)'}).click();
  await expect(page.getByRole('heading',{name:'Algebra',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Grammar',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Watch',exact:true}).click();
  await expect(page.locator('iframe')).toHaveAttribute('src',/youtube-nocookie/);
});


test('3D controls, carousel, campus view and motion toggle',async({page})=>{
  await page.goto('/');
  const scene=page.locator('.learning-scene');
  await expect(page.getByRole('heading',{level:1})).toHaveAccessibleName('Your future. In focus.');
  await page.getByRole('button',{name:'Rotate 3D scene right'}).click();
  await expect.poll(()=>scene.evaluate(el=>el.style.getPropertyValue('--yaw'))).toBe('12deg');
  await page.getByRole('button',{name:'Reset 3D scene'}).click();
  await expect.poll(()=>scene.evaluate(el=>el.style.getPropertyValue('--yaw'))).toBe('0deg');
  await page.getByRole('button',{name:'Show slide 2'}).click();
  await expect(page.getByRole('heading',{level:1})).toHaveAccessibleName('Small steps. Big possibilities.');
  await expect(scene).toHaveAttribute('data-chapter','1');
  await page.getByRole('button',{name:'Pause animations',exact:true}).click();
  await expect(scene).toHaveAttribute('data-active','false');
  await expect(page.getByRole('button',{name:'Rotate 3D scene right'})).toBeDisabled();
  await page.getByRole('button',{name:'Play animations',exact:true}).click();
  await expect(page.getByRole('button',{name:'Rotate 3D scene right'})).toBeEnabled();
  await page.getByRole('button',{name:'Campus view',exact:true}).click();
  const image=page.locator('.campus-scene img');
  await expect(image).toBeVisible();
  await expect.poll(()=>image.evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button',{name:'3D view',exact:true}).click();
  await expect(page.locator('.sculpture-ring i')).toHaveCount(12);
});

test('batch filters, details, FAQ and contact retain their functions',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Explore Our Batches'}).click();
  await page.getByRole('button',{name:'Banking',exact:true}).click();
  await expect(page.locator('.batch-card')).toHaveCount(1);
  await expect(page.locator('.batch-card')).toContainText('Banking & Finance');
  await page.getByRole('button',{name:'View Batch: Banking & Finance'}).click();
  await expect(page.getByRole('dialog')).toContainText('sample batch');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Railways',exact:true}).click();
  await expect(page.getByRole('heading',{name:'New batches coming soon'})).toBeVisible();
  await page.getByRole('button',{name:'All Exams',exact:true}).click();
  await expect(page.locator('.batch-card')).toHaveCount(3);
  await page.getByText('Can I learn on my phone?',{exact:true}).click();
  await expect(page.locator('details[open]')).toContainText('tablet and computer');
  await page.getByRole('button',{name:'Talk to us',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Karnal');
});

test('white canvas, responsive layouts and reduced-motion preference',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const width of [320,390,600,768,1024,1440]){
    await page.setViewportSize({width,height:900});
    await page.goto('/');
    await expect(page.getByRole('heading',{level:1})).toBeVisible();
    await expect(page.getByRole('button',{name:'Play animations',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await page.locator('.hero').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
    expect(await page.locator('.sculpture-float').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
    await page.locator('#contact').scrollIntoViewIfNeeded();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});

test('touch rotates the sculpture and offscreen motion sleeps',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage();
  await page.goto('/');
  const stage=page.locator('.scene-stage'),scene=page.locator('.learning-scene');
  await stage.scrollIntoViewIfNeeded();
  // Dispatch touch-type pointer events with the same browser event path as a drag.
  await stage.dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch',clientX:100,clientY:200});
  await stage.dispatchEvent('pointermove',{pointerId:1,pointerType:'touch',clientX:164,clientY:200});
  await stage.dispatchEvent('pointerup',{pointerId:1,pointerType:'touch',clientX:164,clientY:200});
  await expect.poll(()=>scene.evaluate(el=>el.style.getPropertyValue('--yaw'))).toBe('16deg');
  await page.locator('#contact').scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute('data-active','false');
  await context.close();
});
