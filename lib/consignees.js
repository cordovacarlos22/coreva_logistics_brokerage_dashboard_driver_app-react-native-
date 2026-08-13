// Mirrors apps/web/src/lib/consignees.js's fetchConsignees -- same query
// shape, same customer_company scoping. Driver read access to consignees
// is new (see schema.sql's consignees_select policy comment); no write
// helper here on purpose -- a driver whose destination isn't listed yet
// falls back to typing the address manually rather than being able to
// create consignee records themselves.
export async function fetchConsignees(supabase, customerCompany) {
  const { data, error } = await supabase
    .from('consignees')
    .select('id, name, address')
    .eq('customer_company', customerCompany)
    .order('name', { ascending: true });

  if (error) throw new Error(`consignees: ${error.message}`);
  return data;
}
