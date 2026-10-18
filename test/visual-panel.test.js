import test from 'node:test';
import assert from 'node:assert/strict';
import {combineVisualReviews} from '../src/visual-panel.js';
const review=(score,passed)=>({score,passed,scores:Object.fromEntries(['composition','typography','distinctiveness','polish','mobile'].map(k=>[k,score])),issues:passed?[]:['Material defect'],strengths:['Visible strength']});
test('premium consensus requires a strict independent majority and retains dissenting assessments',()=>{
 const votes=[{model:'a',review:review(9,true)},{model:'b',review:review(8.6,true)},{model:'c',review:review(6,false)}];
 const result=combineVisualReviews(votes,3);assert.equal(result.passed,true);assert.equal(result.score,8.8);assert.deepEqual(result.agreement,{passed:2,valid:3,total:3});assert.equal(result.reviews[2].review.score,6);
 const failed=combineVisualReviews([votes[0],votes[2],{model:'b',error:'Unavailable'}],3);assert.equal(failed.passed,false);assert.ok(failed.issues.length);
 assert.equal(combineVisualReviews([votes[2]],1).passed,false);assert.throws(()=>combineVisualReviews([{model:'a',error:'Unavailable'}],3),/No independent/);
});

import {responseFormat} from '../src/output-schema.js';
test('structured review requests require all dimensions without weakening the premium gate',()=>{const format=responseFormat('Rendered visual design review');assert.equal(format.type,'json_schema');assert.equal(format.json_schema.strict,true);const schema=format.json_schema.schema;assert.deepEqual(schema.required,['scores','issues','strengths']);assert.deepEqual(schema.properties.scores.required,['composition','typography','distinctiveness','polish','mobile']);for(const field of Object.values(schema.properties.scores.properties)){assert.equal(field.minimum,0);assert.equal(field.maximum,10);}assert.equal(schema.additionalProperties,false);});
