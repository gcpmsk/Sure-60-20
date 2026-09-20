import { createClient } from '@supabase/supabase-js';
import {validatePdf} from './pdf';
export const configured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
export const db = configured ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY) : null;
export const defaults = { brand: 'Sure60', tagline: 'Your ambition. Our mission.', address: 'Sure60, Karnal Campus, Karnal, Haryana', phone: '', email: '', instagram: '', youtube: '', facebook: '', whatsapp: '', logo: '', hero: '/students.jpg', heroTitle: 'Your next big\nachievement\nstarts here.', heroSubtitle: 'Expert guidance. Focused preparation. Real results.\nBuild your future with a learning experience that puts you first.', announcement: 'A new beginning. A brighter future. Admissions are open!' };
export const sampleBatches = [
  {id:'demo-1',title:'SSC Foundation',subtitle:'Your first step towards a government career.',category:'SSC',tag:'POPULAR CHOICE',color:'mint',subjects:'Maths · Reasoning · English · GK',mode:'Live + Recorded',duration:'6 months',price:'2,999',lessons:120},
  {id:'demo-2',title:'Haryana CET',subtitle:'Haryana ke sapno ki, ab pakki taiyari.',category:'Haryana CET',tag:'NEW BATCH',color:'peach',subjects:'Haryana GK · Maths · Hindi · Reasoning',mode:'Live + Recorded',duration:'4 months',price:'1,999',lessons:90},
  {id:'demo-3',title:'Banking & Finance',subtitle:'A stronger foundation for a brighter career.',category:'Banking',tag:'START LEARNING',color:'lavender',subjects:'Quant · Reasoning · English · Awareness',mode:'Recorded',duration:'6 months',price:'3,499',lessons:100}
];
export const sampleTests = [{id:'demo-test',title:'SSC CGL • All India Mock Test',category:'SSC',duration_minutes:10,question_count:5,published:true,marks:1,negative_marks:0,description:'Get a feel for the real exam. Try our free practice test.'}];
export const demoQuestions = [
 {id:'1',position:1,body:'If 25% of a number is 80, what is the number?',options:['200','240','320','400'],answer:2},
 {id:'2',position:2,body:'Which city is known as the “Rice Bowl of India” in Haryana?',options:['Karnal','Rohtak','Hisar','Panipat'],answer:0},
 {id:'3',position:3,body:'Find the next number in the sequence: 2, 6, 12, 20, ...',options:['24','28','30','32'],answer:2},
 {id:'4',position:4,body:'Choose the synonym of “Diligent”.',options:['Careless','Hardworking','Indifferent','Slow'],answer:1},
 {id:'5',position:5,body:'The Constitution of India came into effect on:',options:['15 August 1947','26 November 1949','26 January 1950','2 October 1950'],answer:2}
];
export function safeUrl(value) { try { const u = new URL(value); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
export function youtubeId(value) { try { const u = new URL(value); let id; if (u.hostname === 'youtu.be') id = u.pathname.slice(1); else if (['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(u.hostname)) id = u.searchParams.get('v') || u.pathname.split('/').pop(); return /^[\w-]{11}$/.test(id || '') ? id : null; } catch { return null; } }
export function authEmail(value) { const v=value.trim().toLowerCase(); return v.includes('@') ? v : `${v}@students.sure60.app`; }
export async function rpc(name,args) { if(!db) throw new Error('Connect Supabase first. See SETUP.md in the GitHub repository.'); const {data,error}=await db.rpc(name,args); if(error) throw error; return data; }
export async function query(table,options={}) { let q=db.from(table).select(options.select || '*'); for(const [key,value] of Object.entries(options.eq || {})) q=q.eq(key,value); if(options.order) q=q.order(options.order); const {data,error}=await q; if(error) throw error; return data; }
export async function save(table,row) { const {data,error}=await db.from(table).upsert(row).select(); if(error) throw error; return data; }
export async function remove(table,id) { const {error}=await db.from(table).delete().eq('id',id); if(error) throw error; }

// Generate a new object key for every replacement; never overwrite another class's notes.
export async function uploadClassPdf(file,batchId,lessonId) {
  await validatePdf(file);
  const path=`${batchId}/${lessonId}/${crypto.randomUUID()}.pdf`;
  const {error}=await db.storage.from('class-notes').upload(path,file,{contentType:'application/pdf',upsert:false});
  if(error) throw new Error('PDF upload failed: '+error.message+'. Check the class-notes bucket and run the latest Supabase SQL setup.');
  return path;
}
export async function openClassPdf(lesson) {
  if(!lesson.pdf_path) {
    const url=safeUrl(lesson.pdf_url);
    if(url) window.open(url,'_blank','noopener,noreferrer');
    return;
  }
  // Open synchronously to avoid mobile popup blockers while requesting a signed URL.
  const tab=window.open('about:blank','_blank');
  if(tab) tab.opener=null;
  try {
    const {data,error}=await db.storage.from('class-notes').createSignedUrl(lesson.pdf_path,60);
    if(error) throw error;
    if(tab) tab.location.replace(data.signedUrl);
    else window.location.assign(data.signedUrl);
  } catch(error) { tab?.close(); throw new Error('Cannot open notes: '+error.message); }
}
