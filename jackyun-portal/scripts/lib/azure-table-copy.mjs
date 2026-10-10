// PostgreSQL record conversion maps both SQL NULL and JSON null to SQL NULL.
// Carry a per-row mask so top-level JSON null survives the protected copy.
const marker = '__jackyun_json_null_columns';
const identifier = value => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw Error('Invalid copy identifier');
  return `"${value}"`;
};
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
async function columns(client, schema, table) {
  const result = await client.query(`SELECT a.attname AS copy_column,format_type(a.atttypid,a.atttypmod) AS copy_type
    FROM pg_attribute a WHERE a.attrelid=to_regclass($1) AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,
  [`${schema}.${table}`]);
  if (!result.rows.length || result.rows.some(column => column.copy_column === marker)) throw Error('Invalid copy columns');
  return result.rows;
}
export async function encodedRows(client, table, schema = 'public') {
  const relation = `${identifier(schema)}.${identifier(table)}`;
  const jsonColumns = (await columns(client,schema,table)).filter(column => ['json','jsonb'].includes(column.copy_type));
  const nulls = jsonColumns.map(column => `CASE WHEN r.${identifier(column.copy_column)} IS NOT NULL
    AND r.${identifier(column.copy_column)}::jsonb='null'::jsonb THEN ${literal(column.copy_column)} END`);
  const encoded = `to_jsonb(r)||jsonb_build_object(${literal(marker)},to_jsonb(array_remove(ARRAY[${nulls.join(',')}]::text[],NULL)))`;
  // Keep PostgreSQL's JSON text intact: JS parsing would round large numbers
  // and remove decimal scale before the target fingerprint check.
  return (await client.query(`SELECT coalesce(jsonb_agg(${encoded} ORDER BY to_jsonb(r)::text COLLATE "C"),'[]'::jsonb)::text AS data FROM ${relation} r`)).rows[0].data;
}
export async function insertEncodedRows(client, table, data, schema = 'public', conflict = '') {
  const relation = `${identifier(schema)}.${identifier(table)}`;
  const fields = await columns(client,schema,table);
  const values = fields.map(column => ['json','jsonb'].includes(column.copy_type)
    ? `CASE WHEN (entry.doc->${literal(marker)}) ? ${literal(column.copy_column)} THEN 'null'::${column.copy_type}
      ELSE record.${identifier(column.copy_column)} END`
    : `record.${identifier(column.copy_column)}`);
  await client.query(`INSERT INTO ${relation}(${fields.map(column=>identifier(column.copy_column)).join(',')})
    SELECT ${values.join(',')} FROM jsonb_array_elements($1::jsonb) AS entry(doc)
    CROSS JOIN LATERAL jsonb_populate_record(NULL::${relation},entry.doc) AS record ${conflict}`,
  [typeof data === 'string' ? data : JSON.stringify(data)]);
}
