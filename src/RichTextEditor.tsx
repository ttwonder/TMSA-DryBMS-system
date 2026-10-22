import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type HTMLAttributes} from 'react';
import {compactBlankLines,formatStandardText} from './standardText';
import {RICH_COLORS,compactRichText,editorElementToDocument,encodeRichText,isRichText,reflowRichText,richTextRuns,richTextToEditorHtml,richTextToPlainText,type RichColor} from './richText';

export interface RichTextEditorProps extends Omit<HTMLAttributes<HTMLDivElement>,'onChange'|'children'|'onInput'> {
 value:string;
 onChange:(value:string)=>void;
 rows?:number;
 disabled?:boolean;
 readOnly?:boolean;
 singleLine?:boolean;
 compact?:boolean;
 placeholder?:string;
}

/** Native editing/undo owns the focused DOM; React owns only the surrounding controls. */
export function RichTextEditor({value,onChange,rows=3,disabled=false,readOnly=false,singleLine=false,compact=false,lang,placeholder,className='',style,'aria-label':ariaLabel,onFocus,onBlur,onKeyDown,...attributes}:RichTextEditorProps){
 const wrapper=useRef<HTMLDivElement>(null),input=useRef<HTMLDivElement>(null),savedRange=useRef<Range|null>(null);
 const composing=useRef(false),lastProp=useRef<string|undefined>(undefined),lastEmitted=useRef<string|undefined>(undefined),lastDom=useRef('');
 const pointerActive=useRef(false),pendingBlur=useRef(false);
 const [focused,setFocused]=useState(false),[inferredLabel,setInferredLabel]=useState(''),[bold,setBold]=useState(false);
 const editable=!disabled&&!readOnly,english=lang?.startsWith('en');
 const labels=english?{black:'Black',red:'Red',blue:'Blue',green:'Green',bold:'Bold',ordered:'Numbered list',bullet:'Bulleted list',toolbar:'Text formatting'}:{black:'黑色',red:'紅色',blue:'藍色',green:'綠色',bold:'加粗',ordered:'編號清單',bullet:'項目符號',toolbar:'文字格式'};
 const allowed=()=>editable&&!input.current?.closest('fieldset[disabled]');
 const remember=()=>{
  const selection=window.getSelection(),root=input.current;
  if(root&&selection?.rangeCount&&root.contains(selection.anchorNode)&&root.contains(selection.focusNode)){
   savedRange.current=selection.getRangeAt(0).cloneRange();setBold(document.queryCommandState('bold'));
  }
 };
 const emit=()=>{
  const root=input.current;if(!root||!allowed()||composing.current)return;
  const next=encodeRichText(editorElementToDocument(root,singleLine));
  if(next!==lastDom.current){lastDom.current=next;lastEmitted.current=next;onChange(next);}
  remember();
 };
 useLayoutEffect(()=>{
  const root=input.current;if(!root||composing.current)return;
  if(lastProp.current===value)return;
  if(lastEmitted.current===value){lastProp.current=value;lastEmitted.current=undefined;return;}
  if(wrapper.current?.contains(document.activeElement))return;
  const projected=compact?compactRichText(value):value;
  // Only escaped literal text + validated palette/bold/list tags reach innerHTML.
  root.innerHTML=richTextToEditorHtml(projected,singleLine);
  lastDom.current=encodeRichText(editorElementToDocument(root,singleLine));
  lastProp.current=value;lastEmitted.current=undefined;savedRange.current=null;
 },[value,compact,singleLine,focused]);
 useLayoutEffect(()=>{
  if(ariaLabel)return;
  const label=wrapper.current?.closest('label');if(!label)return;
  const clone=label.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.rich-editor,input,textarea,select,button').forEach(node=>node.remove());
  setInferredLabel(clone.textContent?.trim()??'');
 },[ariaLabel]);
 useEffect(()=>{
  const selection=()=>{if(wrapper.current?.contains(document.activeElement))remember();};
  document.addEventListener('selectionchange',selection);return()=>document.removeEventListener('selectionchange',selection);
 },[]);
 useEffect(()=>{
  let timer:number|undefined;
  const collapse=()=>{
   if(!pendingBlur.current)return;
   pendingBlur.current=false;
   if(wrapper.current&&!wrapper.current.contains(document.activeElement)){setFocused(false);savedRange.current=null;}
  };
  const down=()=>{pointerActive.current=true;};
  const up=()=>{pointerActive.current=false;if(pendingBlur.current)timer=window.setTimeout(collapse,0);};
  // A blur during mousedown must not remove a row before the matching click:
  // layout/scroll anchoring would move Save/Cancel out from under the pointer.
  const click=()=>{window.clearTimeout(timer);collapse();};
  document.addEventListener('pointerdown',down,true);
  document.addEventListener('pointerup',up,true);
  document.addEventListener('pointercancel',up,true);
  document.addEventListener('click',click);
  return()=>{window.clearTimeout(timer);document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',up,true);document.removeEventListener('click',click);};
 },[]);
 const command=(name:string,arg?:string)=>{
  if(!allowed()||composing.current)return;
  const root=input.current;if(!root)return;
  root.focus({preventScroll:true});
  const selection=window.getSelection(),range=savedRange.current;
  if(selection&&range&&root.contains(range.commonAncestorContainer)){
   const current=selection.rangeCount?selection.getRangeAt(0):null;
   // Re-adding an identical collapsed Range clears Chromium's pending typing style.
   if(!current||current.startContainer!==range.startContainer||current.startOffset!==range.startOffset||current.endContainer!==range.endContainer||current.endOffset!==range.endOffset){selection.removeAllRanges();selection.addRange(range);}
  }
  document.execCommand('styleWithCSS',false,'false');
  document.execCommand(name,false,arg);emit();remember();
 };
 const insertPlain=(text:string)=>{
  const plain=richTextToPlainText(text).replace(/\r\n?/gu,'\n');
  command('insertText',singleLine?plain.replace(/\n/gu,' '):plain);
 };
 return <div ref={wrapper} className={`rich-editor${singleLine?' rich-editor-single':''}${disabled?' rich-editor-disabled':''} ${className}`} style={style}
  onFocusCapture={()=>{pendingBlur.current=false;if(editable)setFocused(true);}}
  onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node)){if(pointerActive.current)pendingBlur.current=true;else{setFocused(false);savedRange.current=null;}}}}>
  {focused&&editable&&<div className="rich-editor-toolbar" role="toolbar" aria-label={labels.toolbar} onMouseDown={event=>event.preventDefault()}>
   {(Object.keys(RICH_COLORS) as RichColor[]).map(color=><button key={color} type="button" className="rich-editor-color" aria-label={labels[color]} title={labels[color]} onClick={()=>command('foreColor',RICH_COLORS[color])}><span style={{color:RICH_COLORS[color]}} aria-hidden="true">A</span></button>)}
   <button type="button" aria-label={labels.bold} title={labels.bold} aria-pressed={bold} onClick={()=>command('bold')}><b aria-hidden="true">B</b></button>
   {!singleLine&&<><button type="button" aria-label={labels.ordered} title={labels.ordered} onClick={()=>command('insertOrderedList')}><span aria-hidden="true">1.</span></button><button type="button" aria-label={labels.bullet} title={labels.bullet} onClick={()=>command('insertUnorderedList')}><span aria-hidden="true">•</span></button></>}
  </div>}
  <div {...attributes} ref={input} role="textbox" className="rich-editor-input" lang={lang} aria-label={ariaLabel||inferredLabel||placeholder} aria-multiline={!singleLine} aria-readonly={readOnly||undefined} aria-disabled={disabled||undefined}
   contentEditable={editable} suppressContentEditableWarning tabIndex={disabled?-1:0} data-placeholder={placeholder} style={{'--rich-rows':singleLine?1:Math.max(1,rows)} as CSSProperties}
   onFocus={event=>{if(allowed())document.execCommand('defaultParagraphSeparator',false,'div');remember();onFocus?.(event);}}
   onBlur={onBlur} onInput={emit}
   onCompositionStart={()=>{composing.current=true;}}
   onCompositionEnd={()=>{composing.current=false;emit();}}
   onBeforeInput={event=>{const native=event.nativeEvent as InputEvent;if(!allowed()||(singleLine&&['insertParagraph','insertLineBreak'].includes(native.inputType)))event.preventDefault();}}
   onPaste={event=>{event.preventDefault();if(allowed())insertPlain(event.clipboardData.getData('text/plain'));}}
   onDrop={event=>{event.preventDefault();if(allowed())insertPlain(event.dataTransfer.getData('text/plain'));}}
   onKeyDown={event=>{
    onKeyDown?.(event);if(event.defaultPrevented||!allowed()||event.nativeEvent.isComposing)return;
    if(singleLine&&event.key==='Enter'){event.preventDefault();return;}
    if((event.ctrlKey||event.metaKey)&&!event.altKey&&event.key.toLowerCase()==='b'){event.preventDefault();command('bold');}
   }} />
 </div>;
}

export interface RichTextProps {value:string|null|undefined;compact?:boolean;sentence?:boolean;inline?:boolean;className?:string}
/** Plain values return exactly the former formatter's text node, with no density-changing wrapper. */
export function RichText({value,compact=false,sentence=false,inline=false,className}:RichTextProps){
 const raw=value??'';
 if(!isRichText(raw))return sentence?formatStandardText(raw):compact?compactBlankLines(raw):raw;
 const projected=sentence?reflowRichText(raw,formatStandardText(richTextToPlainText(raw))):compact?compactRichText(raw):raw;
 return <span className={className} style={inline?undefined:{whiteSpace:'pre-wrap'}}>{richTextRuns(projected).map((run,index)=><span key={index} style={{...(run.bold?{fontWeight:700}:{}),...(run.color?{color:RICH_COLORS[run.color]}:{})}}>{run.text}</span>)}</span>;
}
