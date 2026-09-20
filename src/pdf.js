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
export async function readPdf(file) {
  if(file.size>15*1024*1024) throw new Error('Please use a PDF smaller than 15 MB.');
  const pdfjs=await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString();
  const doc=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
  let output='';
  for(let i=1;i<=doc.numPages;i++) { const page=await doc.getPage(i); const content=await page.getTextContent(); let lastY=null;
    for(const item of content.items) { if(!('str' in item)) continue; const y=item.transform[5]; if(lastY!==null&&Math.abs(y-lastY)>3) output+='\n'; output+=item.str+' '; if(item.hasEOL) output+='\n'; lastY=y; } output+='\n';
  }
  await doc.destroy(); if(!output.trim()) throw new Error('This is a scanned PDF. Paste or type the questions manually; OCR is not included.'); return output;
}
