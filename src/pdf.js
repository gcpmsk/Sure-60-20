export function parseQuestions(text) {
  const result=[];
  const chunks=text.replace(/\r/g,'').split(/(?:^|\n)\s*(?:Q\s*)?(\d+)\s*[.)]\s*/i);
  for(let i=1;i<chunks.length;i+=2) {
    const pieces=chunks[i+1].split(/(?:^|\n)\s*\(?([A-Da-d])\s*[).:]\s*/);
    if(pieces.length<9) continue;
    const opts={}; for(let j=1;j<pieces.length;j+=2) opts[pieces[j].toUpperCase()]=pieces[j+1].trim();
    if(['A','B','C','D'].every(k=>opts[k])) result.push({position:Number(chunks[i]),body:pieces[0].trim(),options:['A','B','C','D'].map(k=>opts[k])});
  }
  return result;
}
export function parseAnswers(text) { const answers={}; for(const match of text.matchAll(/(?:^|[\s,;])(?:Q\s*)?(\d+)\s*[.):=\-]?\s*([A-D])\b/gi)) answers[Number(match[1])]='ABCD'.indexOf(match[2].toUpperCase()); return answers; }
export async function validatePdf(file) {
  if(!file || !/\.pdf$/i.test(file.name)) throw new Error('Choose a PDF file (.pdf).');
  if(!file.size) throw new Error('This PDF is empty.');
  if(file.size>15*1024*1024) throw new Error('Please use a PDF smaller than 15 MB.');
  const header=new TextDecoder().decode(await file.slice(0,5).arrayBuffer());
  if(header!=='%PDF-') throw new Error('This file is not a valid PDF. Export it as PDF and try again.');
}
export async function readPdf(file) {
  await validatePdf(file);
  const [pdfjs,{default:workerUrl}]=await Promise.all([
    import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ]);
  // Vite emits this worker as a real local asset in both dev and production builds.
  pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
  const task=pdfjs.getDocument({data:await file.arrayBuffer(),isEvalSupported:false});
  try {
    const doc=await task.promise;
    if(doc.numPages>200) throw new Error('Use at most 200 pages per PDF. Split the document and retry.');
    let output='';
    for(let i=1;i<=doc.numPages;i++) {
      const page=await doc.getPage(i),content=await page.getTextContent(); let lastY=null;
      for(const item of content.items) {
        if(!('str' in item)) continue;
        const y=item.transform[5];
        if(lastY!==null&&Math.abs(y-lastY)>3) output+='\n';
        output+=item.str+' '; if(item.hasEOL) output+='\n'; lastY=y;
      }
      output+='\n'; page.cleanup();
    }
    if(!output.trim()) throw new Error('This is a scanned PDF. Paste or type the questions manually; OCR is not included.');
    return output;
  } catch(error) {
    if(error.name==='PasswordException') throw new Error('This PDF is password protected. Upload an unlocked copy.');
    if(error.name==='InvalidPDFException') throw new Error('This PDF is damaged. Export a fresh PDF and retry.');
    throw error;
  } finally { await task.destroy(); }
}
