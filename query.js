import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: tbls } = await supabase.from('tabel_audit_seaair').select('vendor_inv_no, po_ori').ilike('vendor_inv_no', '%ICC-25050630%');
  console.log("tabel_audit_seaair:", tbls);
}
run();
