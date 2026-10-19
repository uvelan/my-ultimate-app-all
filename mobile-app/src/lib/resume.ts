export const resumeTemplates = ['modern-professional', 'executive-premium', 'minimal-corporate', 'software-engineer-elite', 'enterprise-architect', 'stitch-premium', 'ats-optimized', 'silicon-valley', 'product-manager', 'data-science', 'creative-professional'];
export const skillGroups = ['technical', 'soft', 'tools', 'frameworks', 'platforms', 'languages'];
export type ResumeField = { key: string; label: string; list?: boolean; boolean?: boolean };
export const resumeSections: Record<string, { label: string; fields: ResumeField[] }> = {
 experience: { label: 'Experience', fields: [{key:'company',label:'Company'},{key:'position',label:'Position'},{key:'employmentType',label:'Employment type'},{key:'startDate',label:'Start date (YYYY-MM)'},{key:'endDate',label:'End date (YYYY-MM)'},{key:'isCurrent',label:'Current role',boolean:true},{key:'responsibilities',label:'Responsibilities (one per line)',list:true},{key:'achievements',label:'Achievements (one per line)',list:true},{key:'technologies',label:'Technologies (one per line)',list:true}] },
 education: { label:'Education', fields:[{key:'degree',label:'Degree'},{key:'institution',label:'Institution'},{key:'gpa',label:'GPA'},{key:'graduationDate',label:'Graduation (YYYY-MM)'},{key:'certifications',label:'Certifications (one per line)',list:true}] },
 projects: { label:'Projects', fields:[{key:'name',label:'Project name'},{key:'description',label:'Description'},{key:'technologies',label:'Technologies (one per line)',list:true},{key:'gitHubUrl',label:'GitHub URL'},{key:'liveUrl',label:'Live URL'},{key:'achievements',label:'Achievements (one per line)',list:true}] },
 certifications: { label:'Certifications', fields:[{key:'name',label:'Name'},{key:'issuingOrg',label:'Issuing organization'},{key:'issueDate',label:'Issued (YYYY-MM)'},{key:'credentialUrl',label:'Credential URL'}] },
 awards: { label:'Awards', fields:[{key:'name',label:'Award'},{key:'date',label:'Date'},{key:'description',label:'Description'}] },
 publications: { label:'Publications', fields:[{key:'title',label:'Title'},{key:'publisher',label:'Publisher'},{key:'link',label:'URL'}] },
};
export function emptyResume(): any {
 const now = new Date().toISOString();
 return { id:'', personalInfo:{fullName:'',professionalTitle:'',email:'',phone:'',location:'',linkedIn:'',gitHub:'',portfolio:'',photoUrl:''}, summary:'', experience:[],education:[],projects:[],certifications:[],awards:[],publications:[],
  skills:Object.fromEntries(skillGroups.map(key=>[key,[]])),meta:{createdAt:now,updatedAt:now,templateId:'modern-professional',targetRole:'',customization:{accentColor:'#4F46E5',fontPairing:'modern',fontSizeScale:'M',spacingDensity:'balanced',columnLayout:'1-col',sectionOrder:['summary','experience','education','skills','projects','certifications','awards','publications'],hiddenSections:[]}}};
}
export function normalizeResume(value: any): any {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid resume document.');
 const initial = emptyResume();
 const data = {...initial,...value,personalInfo:{...initial.personalInfo,...value.personalInfo},skills:{...initial.skills,...value.skills},meta:{...initial.meta,...value.meta,customization:{...initial.meta.customization,...value.meta?.customization}}};
 for (const key of Object.keys(initial.personalInfo)) data.personalInfo[key] = typeof data.personalInfo[key] === 'string' ? data.personalInfo[key] : '';
 data.summary = typeof data.summary === 'string' ? data.summary : '';
 data.id = typeof data.id === 'string' ? data.id : '';
 data.meta.targetRole = typeof data.meta.targetRole === 'string' ? data.meta.targetRole : '';
 if (!resumeTemplates.includes(data.meta.templateId)) data.meta.templateId = initial.meta.templateId;
 for (const [key,values] of Object.entries({fontPairing:['modern','classic','mono','serif'],fontSizeScale:['S','M','L','XL'],spacingDensity:['compact','balanced','airy'],columnLayout:['1-col','2-col']})) {
  if (!values.includes(data.meta.customization[key])) data.meta.customization[key] = initial.meta.customization[key];
 }
 if(typeof data.meta.customization.accentColor!=='string') data.meta.customization.accentColor=initial.meta.customization.accentColor;
 for(const key of skillGroups) data.skills[key] = Array.isArray(data.skills[key]) ? data.skills[key].filter((text:any)=>typeof text==='string') : [];
 for(const [key,section] of Object.entries(resumeSections)) data[key] = (Array.isArray(data[key]) ? data[key] : []).filter((entry:any)=>entry&&typeof entry==='object').map((entry:any,index:number)=>{
  const next:any={...entry,id:typeof entry.id==='string'?entry.id:key+'-'+index};
  for(const field of section.fields) next[field.key] = field.list ? (Array.isArray(entry[field.key])?entry[field.key].filter((v:any)=>typeof v==='string'):[]) : field.boolean ? !!entry[field.key] : typeof entry[field.key]==='string'?entry[field.key]:'';
  return next;
 });
 const known=['summary',...Object.keys(resumeSections),'skills'];
 data.meta.customization.sectionOrder = Array.from(new Set([...(Array.isArray(data.meta.customization.sectionOrder)?data.meta.customization.sectionOrder:[]),...initial.meta.customization.sectionOrder])).filter(key=>known.includes(String(key)));
 data.meta.customization.hiddenSections = (Array.isArray(data.meta.customization.hiddenSections)?data.meta.customization.hiddenSections:[]).filter((key:any)=>known.includes(key));
 return data;
}
export function maskResume(data:any):any {
 return {...data,personalInfo:{...data.personalInfo,fullName:'Confidential Candidate',email:'hidden@confidential.com',phone:'[Phone hidden]',location:'[Location hidden]',linkedIn:'',gitHub:'',portfolio:'',photoUrl:''}};
}
function escapeHtml(value:unknown):string { return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!)); }
export function resumeHtml(input:any,masked=false):string {
 const data=normalizeResume(masked?maskResume(input):input), config=data.meta.customization, personal=data.personalInfo;
 const accent=/^#[a-f0-9]{6}$/i.test(config.accentColor)?config.accentColor:'#4F46E5';
 const font=config.fontPairing==='serif'||config.fontPairing==='classic'?'Georgia,serif':config.fontPairing==='mono'?'monospace':'Arial,sans-serif';
 const size=({S:10,M:11,L:12,XL:13} as any)[config.fontSizeScale]||11;
 const gap=config.spacingDensity==='compact'?8:config.spacingDensity==='airy'?20:13;
 const bullets=(items:any[])=>'<ul>'+items.map(item=>'<li>'+escapeHtml(item)+'</li>').join('')+'</ul>';
 const sections:Record<string,string>={summary:escapeHtml(data.summary).replace(/\n/g,'<br>'), skills:skillGroups.filter(key=>data.skills[key].length).map(key=>'<p><b>'+escapeHtml(key)+':</b> '+data.skills[key].map(escapeHtml).join(', ')+'</p>').join('')};
 for(const [key,section]of Object.entries(resumeSections)) sections[key]=data[key].map((entry:any)=>'<article>'+section.fields.map(field=>{
  const value=entry[field.key]; if(field.boolean||!value||(Array.isArray(value)&&!value.length))return '';
  return field.list?bullets(value):'<p><b>'+escapeHtml(field.label)+':</b> '+escapeHtml(value).replace(/\n/g,'<br>')+'</p>';
 }).join('')+'</article>').join('');
 const body=config.sectionOrder.filter((key:string)=>!config.hiddenSections.includes(key)&&sections[key]).map((key:string)=>'<section><h2>'+escapeHtml(key==='summary'?'Summary':key==='skills'?'Skills':resumeSections[key]?.label||key)+'</h2>'+sections[key]+'</section>').join('');
 const photo = /^(?:https:\/\/|data:image\/(?:png|jpeg|webp);base64,)/i.test(personal.photoUrl || '') ? '<img alt="Profile" style="max-width:80px;max-height:80px;float:right;border-radius:50%" src="'+escapeHtml(personal.photoUrl)+'">' : '';
 const centered=['executive-premium','minimal-corporate','stitch-premium'].includes(data.meta.templateId);
 return '<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:18mm}body{font-family:'+font+';font-size:'+size+'pt;color:#172033;line-height:1.45}header{border-bottom:3px solid '+accent+';padding-bottom:12px;text-align:'+(centered?'center':'left')+'}h1{margin:0;color:'+accent+';font-size:26pt}h2{font-size:13pt;color:'+accent+';border-bottom:1px solid #ddd;padding-bottom:4px}p{margin:4px 0}section{margin-top:'+gap+'px;break-inside:avoid}article{margin-bottom:12px}ul{padding-left:18px}main{'+(config.columnLayout==='2-col'?'column-count:2;column-gap:24px;':'')+'}</style></head><body><header>'+photo+'<h1>'+escapeHtml(personal.fullName)+'</h1><p>'+escapeHtml(personal.professionalTitle)+'</p><p>'+['email','phone','location','linkedIn','gitHub','portfolio'].map(key=>personal[key]).filter(Boolean).map(escapeHtml).join(' | ')+'</p></header><main>'+body+'</main></body></html>';
}
