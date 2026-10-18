export function combineVisualReviews(reviews,expected){
 const valid=reviews.filter(r=>r.review),support=valid.filter(r=>r.review.passed);
 if(expected===1&&valid.length===1)return{...valid[0].review,reviews,agreement:{passed:support.length,valid:1,total:1}};
 const quorum=Math.floor(expected/2)+1,passed=valid.length>=2&&support.length>=quorum;
 const selected=passed?support:valid,dimensions=['composition','typography','distinctiveness','polish','mobile'];
 if(!selected.length)throw new Error('No independent visual assessment was available');
 const scores=Object.fromEntries(dimensions.map(k=>[k,Math.round(selected.reduce((n,r)=>n+r.review.scores[k],0)/selected.length*100)/100]));
 const score=Math.round(dimensions.reduce((n,k)=>n+scores[k],0)/5*10)/10;
 const issues=passed?[]:[...new Set(valid.flatMap(r=>r.review.issues))];
 if(!passed&&!issues.length)issues.push('The configured independent visual panel did not reach a premium-quality majority.');
 return{scores,score,passed,issues,strengths:[...new Set(selected.flatMap(r=>r.review.strengths||[]))].slice(0,8),reviews,agreement:{passed:support.length,valid:valid.length,total:expected}};
}
