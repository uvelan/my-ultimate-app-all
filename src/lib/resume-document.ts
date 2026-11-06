export const resumeTemplateCatalog = [
 { id: 'ats-optimized', name: 'ATS Classic', accent: '#172033', style: 'plain', description: 'Single column, standard headings, no photo' },
 { id: 'modern-professional', name: 'Modern Professional', accent: '#4F46E5', style: 'line', description: 'Versatile layout with an accent rule' },
 { id: 'executive-premium', name: 'Executive', accent: '#0F172A', style: 'center', description: 'Centered heading for leadership roles' },
 { id: 'minimal-corporate', name: 'Minimal Corporate', accent: '#334155', style: 'plain', description: 'Subtle lines and restrained typography' },
 { id: 'software-engineer-elite', name: 'Software Engineer', accent: '#4338CA', style: 'side', description: 'Technical layout with a compact heading' },
 { id: 'enterprise-architect', name: 'Enterprise Architect', accent: '#047857', style: 'banner', description: 'Prominent heading and structured sections' },
 { id: 'stitch-premium', name: 'Stitch', accent: '#713F12', style: 'center', description: 'Centered, warm editorial styling' },
 { id: 'silicon-valley', name: 'Silicon Valley', accent: '#1D4ED8', style: 'side', description: 'Left accent with straightforward sections' },
 { id: 'product-manager', name: 'Product Manager', accent: '#0F766E', style: 'banner', description: 'Tinted header and clearly separated sections' },
 { id: 'data-science', name: 'Data Science', accent: '#3730A3', style: 'side', description: 'Compact layout with a technical accent' },
 { id: 'creative-professional', name: 'Creative Professional', accent: '#9D174D', style: 'banner', description: 'Color-forward header with readable text' },
 { id: 'academic-cv', name: 'Academic CV', accent: '#78350F', style: 'academic', description: 'Serif layout for education and publications' },
 { id: 'early-career', name: 'Early Career', accent: '#075985', style: 'line', description: 'Open layout for education and projects' },
 { id: 'consulting-brief', name: 'Consulting Brief', accent: '#374151', style: 'center', description: 'Centered heading with restrained section rules' },
] as const;
export const resumeTemplates: readonly string[] = resumeTemplateCatalog.map(template => template.id);
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
export function resumeDocument(input: any, masked = false, atsExport = false) {
 const normalized = normalizeResume(input);
 const data = masked ? maskResume(normalized) : normalized;
 const config = data.meta.customization, personal = data.personalInfo;
 const template = resumeTemplateCatalog.find(item => item.id === data.meta.templateId) || resumeTemplateCatalog[1];
 const ats = atsExport || template.id === 'ats-optimized';
 const accent = ats ? '#172033' : /^#[a-f0-9]{6}$/i.test(config.accentColor) ? config.accentColor : template.accent;
 const font = ats ? 'Arial,sans-serif' : template.style === 'academic' || ['serif','classic'].includes(config.fontPairing)
  ? 'Georgia,serif' : config.fontPairing === 'mono' ? 'monospace' : 'Arial,sans-serif';
 const size=({S:10,M:11,L:12,XL:13} as any)[config.fontSizeScale]||11;
 const gap=config.spacingDensity==='compact'?8:config.spacingDensity==='airy'?20:13;
 const bullets=(items:any[])=>'<ul>'+items.map(item=>'<li>'+escapeHtml(item)+'</li>').join('')+'</ul>';
 const sections:Record<string,string>={summary:escapeHtml(data.summary).replace(/\n/g,'<br>'), skills:skillGroups.filter(key=>data.skills[key].length).map(key=>'<p><b>'+escapeHtml(key)+':</b> '+data.skills[key].map(escapeHtml).join(', ')+'</p>').join('')};
 for (const [key,section] of Object.entries(resumeSections)) {
  const headingKeys: Record<string, string[]> = { experience: ['position','company'], education: ['degree','institution'],
   projects: ['name'], certifications: ['name','issuingOrg'], awards: ['name'], publications: ['title','publisher'] };
  const keys = headingKeys[key];
  sections[key] = data[key].map((entry: any) => {
   const heading = keys.map(field => entry[field].trim()).filter(Boolean).map(escapeHtml).join(' · ');
   const dates = key === 'experience' ? [entry.startDate, entry.isCurrent ? 'Present' : entry.endDate].filter(Boolean) : [];
   const detail = section.fields.map(field => {
    const value = entry[field.key];
    if (keys.includes(field.key) || field.boolean || !value || (Array.isArray(value) ? !value.some(item => item.trim()) : !value.trim())) return '';
    if (key === 'experience' && (['startDate','endDate'].includes(field.key) || (field.key === 'employmentType' && !heading && !dates.length))) return '';
    return field.list ? bullets(value.filter((item: string) => item.trim())) : '<p><b>'+escapeHtml(field.label.replace(/ \([^)]*\)/g,''))+':</b> '+escapeHtml(value).replace(/\n/g,'<br>')+'</p>';
   }).join('');
   return heading || dates.length || detail ? '<article>'+(heading ? '<h3>'+heading+'</h3>' : '')+
    (dates.length ? '<p>'+dates.map(escapeHtml).join(' – ')+'</p>' : '')+detail+'</article>' : '';
  }).join('');
 }
 const body=config.sectionOrder.filter((key:string)=>!config.hiddenSections.includes(key)&&sections[key]).map((key:string)=>'<section><h2>'+escapeHtml(key==='summary'?'Summary':key==='skills'?'Skills':resumeSections[key]?.label||key)+'</h2>'+sections[key]+'</section>').join('');
 const photo = !ats && /^(?:https:\/\/|data:image\/(?:png|jpeg|webp);base64,)/i.test(personal.photoUrl || '') ? '<img alt="Profile" src="'+escapeHtml(personal.photoUrl)+'">' : '';
 const headingStyle = ats ? '' : {
  plain: 'border-bottom:1px solid #ddd;', line: 'border-bottom:3px solid '+accent+';', center: 'text-align:center;border-bottom:1px solid '+accent+';',
  side: 'border-left:4px solid '+accent+';padding-left:14px;', banner: 'background:'+accent+'12;padding:14px;', academic: 'border-bottom:3px double '+accent+';',
 }[template.style];
 const styles = '.resume-paper{font-family:'+font+';font-size:'+size+'pt;color:#172033;background:white;line-height:1.45;overflow-wrap:anywhere}'
  +'.resume-paper header{padding-bottom:12px;display:flow-root;'+headingStyle+'}.resume-paper img{max-width:80px;max-height:80px;float:right;border-radius:50%;margin-left:12px}'
  +'.resume-paper h1{margin:0;color:'+accent+';font-size:'+(ats?22:26)+'pt}.resume-paper h2{margin:0 0 5px;font-size:13pt;color:'+accent+';break-after:avoid;'
  +(ats?'':'border-bottom:1px solid #ddd;padding-bottom:4px;')+'}.resume-paper h3{font-size:11pt;margin:0;break-after:avoid}'
  +'.resume-paper p{margin:4px 0;orphans:2;widows:2}.resume-paper section{margin-top:'+gap+'px}.resume-paper article{margin-bottom:12px}.resume-paper li{break-inside:avoid}.resume-paper ul{padding-left:18px;margin:4px 0}'
  +'.resume-paper main{'+(!ats&&config.columnLayout==='2-col'?'column-count:2;column-gap:24px;':'')+'}';
 const markup = '<div class="resume-paper"><header>'+photo+'<h1>'+escapeHtml(personal.fullName)+'</h1><p>'+escapeHtml(personal.professionalTitle)+'</p><p>'+
  ['email','phone','location','linkedIn','gitHub','portfolio'].map(key=>personal[key]).filter(Boolean).map(escapeHtml).join(' | ')+'</p></header><main>'+body+'</main></div>';
 return { styles, markup };
}

export function resumeHtml(input: any, masked = false, atsExport = false): string {
 const { styles, markup } = resumeDocument(input, masked, atsExport);
 return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: data:; style-src \'unsafe-inline\'">'+
  '<style>@page{size:A4;margin:16mm}body{margin:0}@media screen{.resume-paper{max-width:794px;margin:auto;padding:20px}}'+styles+'</style></head><body>'+markup+'</body></html>';
}

export function resumeAtsChecklist(input: any) {
 const data = normalizeResume(input), personal = data.personalInfo;
 const visible = (key: string) => !data.meta.customization.hiddenSections.includes(key);
 return [
  { label: 'Add your full name', ready: !!personal.fullName.trim() },
  { label: 'Add a valid contact email', ready: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personal.email.trim()) },
  { label: 'Include a visible summary or target title', ready: !!(personal.professionalTitle.trim() || (visible('summary') && data.summary.trim())) },
  { label: 'Include a visible experience, education, or project entry', ready:
   (visible('experience') && data.experience.some((item: any) => item.position.trim() && item.company.trim())) ||
   (visible('education') && data.education.some((item: any) => item.degree.trim() && item.institution.trim())) ||
   (visible('projects') && data.projects.some((item: any) => item.name.trim())) },
  { label: 'Include a visible skills section', ready: visible('skills') && skillGroups.some(key => data.skills[key].some((item: string) => item.trim())) },
 ];
}
