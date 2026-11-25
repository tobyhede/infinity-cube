import ts from 'typescript'; import {readFileSync} from 'node:fs';
for (const file of process.argv.slice(2)) {
 const src = ts.createSourceFile(file, readFileSync(file,'utf8'), ts.ScriptTarget.Latest, true);
 const visit=n=>{ if(ts.isCallExpression(n)){const c=n.expression; const isIt=e=>ts.isIdentifier(e)&&(e.text==='it'||e.text==='test');
  if(isIt(c)||(ts.isCallExpression(c)&&ts.isPropertyAccessExpression(c.expression)&&isIt(c.expression.expression))){const a=n.arguments[0]; let name;
   if(ts.isStringLiteral(a)||ts.isNoSubstitutionTemplateLiteral(a)) name=a.text; else if(ts.isTemplateExpression(a)) name=a.head.text+a.templateSpans.map(s=>`*${s.literal.text}`).join('');
   const line=src.getLineAndCharacterOfPosition(n.getStart()).line+1; console.log(`${file}:${line}\t${(name??'?').replace(/^\* /,'')}`);}}
  ts.forEachChild(n,visit)}; visit(src);}
