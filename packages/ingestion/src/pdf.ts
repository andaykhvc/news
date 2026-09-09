import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { structureSchema, type TextStructure } from '@sak/domain';
import type { FetchedDocument, ParsedDocument } from '@sak/source-sdk';
import { z } from 'zod';
const resultSchema = z.object({ text: z.string(), structure: structureSchema });
export interface PdfResult {
  status: 'parsed' | 'needs_review';
  reasons: string[];
  hash: string;
  parsed: ParsedDocument | null;
}
/** Isolated, time/memory/page/text bounded PDF parser. No OCR, scripting, external resources or rendering. */
export async function parsePdf(
  doc: FetchedDocument,
  options: { timeoutMs?: number; maxBytes?: number; maxPages?: number } = {},
): Promise<PdfResult> {
  const bytes = Buffer.from(doc.body_base64 ?? '', 'base64');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const review = (reason: string): PdfResult => ({
    status: 'needs_review',
    reasons: [reason],
    hash,
    parsed: null,
  });
  if (
    doc.mime_type !== 'application/pdf' ||
    !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))
  )
    return review('pdf_signature_or_mime_invalid');
  if (bytes.length > (options.maxBytes ?? 10_000_000))
    return review('pdf_byte_limit');
  const moduleUrl = import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  const code = `const {parentPort,workerData}=require('node:worker_threads');
(async()=>{const {getDocument}=await import(workerData.moduleUrl);
const task=getDocument({data:new Uint8Array(workerData.bytes),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,useWorkerFetch:false,stopAtErrors:true,verbosity:0});
try{const pdf=await task.promise;if(pdf.numPages>workerData.maxPages)throw new Error('pdf_page_limit');
let text='';const blocks=[];let empty=0;
for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){const page=await pdf.getPage(pageNumber);const content=await page.getTextContent();const start=text.length;let line='';
for(const item of content.items){if(!('str' in item))continue;line+=item.str+' ';if(item.hasEOL){text+=line.trimEnd()+'\\n';line='';}if(text.length+line.length>2000000)throw new Error('pdf_text_limit');}text+=line.trimEnd();
if(!text.slice(start).trim())empty++;blocks.push({kind:'page',start,end:Math.max(start+1,text.length),page:pageNumber,heading:null,selector:null});text+='\\n';page.cleanup();}
parentPort.postMessage({text,structure:{parser:'pdfjs-6.3.289-v1',blocks,warnings:empty===pdf.numPages?['image_only_pdf']:[],publication_date:null}});
}finally{await task.destroy();}})().catch(e=>parentPort.postMessage({error:e.message}));`;
  try {
    const output = await new Promise<unknown>((resolve, reject) => {
      const worker = new Worker(code, {
        eval: true,
        workerData: { moduleUrl, bytes, maxPages: options.maxPages ?? 80 },
        execArgv: [],
        resourceLimits: {
          maxOldGenerationSizeMb: 192,
          maxYoungGenerationSizeMb: 32,
        },
      });
      const timer = setTimeout(() => {
        void worker.terminate();
        reject(new Error('pdf_timeout'));
      }, options.timeoutMs ?? 20000);
      worker.once('message', (message: unknown) => {
        clearTimeout(timer);
        void worker.terminate();
        resolve(message);
      });
      worker.once('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      worker.once('exit', (code) => {
        clearTimeout(timer);
        if (code !== 0) reject(new Error('pdf_worker_exit'));
      });
    });
    const result = resultSchema.safeParse(output);
    if (!result.success) return review('pdf_extraction_failed');
    if (!result.data.text.trim() || result.data.structure.warnings.length)
      return review('image_only_pdf');
    const structure: TextStructure = result.data.structure;
    const first = result.data.text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8)
      .join(' ')
      .slice(0, 500);
    return {
      status: 'parsed',
      reasons: [],
      hash,
      parsed: {
        canonical_url: doc.final_url,
        title: first,
        document_type: 'pdf',
        raw_text: result.data.text,
        published_at: null,
        attachments: [],
        metadata: { structure, artifact_hash: hash },
      },
    };
  } catch (e) {
    return review(e instanceof Error ? e.message : 'pdf_extraction_failed');
  }
}
