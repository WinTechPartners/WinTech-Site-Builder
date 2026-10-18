const str={type:'string'},strings={type:'array',items:str};
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const array=items=>({type:'array',items});
const nullable={type:['string','null']};
const faq=array(object({question:str,answer:str}));
const art=object({concept:str,visitorJourney:array(object({section:str,purpose:str,layout:str,headline:str,action:str})),designTokens:object({colors:str,type:str,spacing:str,breakpoints:str}),heroCopy:object({headline:str,subheadline:str,primaryCTA:str,secondaryCTA:str}),motion:object({entrance:str,hover:str,reducedMotion:str}),palette:str,typography:str,hero:str,sections:strings,interaction:str,avoid:strings,imagePrompt:str});
const patch=object({page:{type:'string',enum:['','services','about']},selector:str,action:{type:'string',enum:['html','append','prepend','after','before','replace','text','rename']},html:nullable,text:nullable,tag:nullable});
const refinement=object({changes:strings,css:nullable,patches:{...array(patch),maxItems:24},faqUpdates:array(object({page:{type:'string',enum:['','services','about']},faq}))});
const page=object({slug:{type:'string',enum:['','services','about']},title:str,description:str,body:str,faq});
const website=object({designRationale:str,css:str,pages:array(page),changes:strings});
const visualReview=object({scores:object(Object.fromEntries(['composition','typography','distinctiveness','polish','mobile'].map(k=>[k,{type:'number',minimum:0,maximum:10}]))),issues:{...strings,maxItems:12},strengths:{...strings,maxItems:8}});
const sourceItem=object({name:str,sourceUrl:str,quote:str});
const companyProfile=object({name:str,tagline:str,voice:str,location:object({city:str,state:str,sourceUrl:str,quote:str}),phrases:strings,facts:array(object({text:str,sourceUrl:str,quote:str})),services:array(sourceItem),industries:array(sourceItem),vendors:array(object({name:str,category:str,sourceUrl:str,quote:str,logoUrl:str}))});
const contentReview=object({unsupportedClaims:array(object({page:{type:"string",enum:["","services","about"]},quote:str,reason:str,unsupported:{type:'boolean'}})),voiceIssues:strings,contentIssues:{...strings,maxItems:12},coverage:array(object({kind:{type:'string',enum:['services','industries']},name:str,page:{type:"string",enum:["","services","about"]},explanationQuote:str,buyerGuidanceQuote:str,nextActionQuote:str,useful:{type:'boolean'},reason:str}))});
export function responseFormat(purpose){
 const schema=purpose==='Source-backed company brief'?companyProfile:purpose==='Independent company-claims check'?contentReview:purpose==='Rendered visual design review'?visualReview:/^(Company-specific art direction|Structural creative reset)$/.test(purpose)?art:purpose==='Initial website generation'?website:purpose==='Targeted code refinement'?refinement:purpose==='Homepage reconstruction'?object({body:str,css:str,faq,changes:strings}):null;
 return schema?{type:'json_schema',json_schema:{name:purpose==='Targeted code refinement'?'website_refinement':'creative_direction',strict:true,schema}}:{type:'json_object'};
}
