export function searchMatches(query:string, values:unknown[]):boolean {
  const normalizedQuery=query.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  if(!normalizedQuery)return true;
  const text=values.filter(value=>value!==undefined&&value!==null).map(String).join(' ');
  const normalizedText=text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const tokens=normalizedQuery.split(/[\s,;|]+/).filter(Boolean);
  if(tokens.every(token=>normalizedText.includes(token)))return true;
  const queryDigits=normalizedQuery.replace(/\D/g,'');
  const textDigits=text.replace(/\D/g,'');
  return queryDigits.length>=3&&textDigits.includes(queryDigits);
}
